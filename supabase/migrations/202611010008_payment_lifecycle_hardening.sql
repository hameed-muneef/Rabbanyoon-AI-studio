-- A cancelled checkout must not cancel an already-paid subscription.
create or replace function public.cancel_payment_order(
  p_order_id uuid,
  p_reason text,
  p_requested_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders;
  v_actor uuid;
begin
  if p_order_id is null then
    raise exception 'payment order id is required' using errcode = '22023';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null
    and (select auth.uid()) <> v_order.user_id
    and not public.is_admin() then
    raise exception 'payment cancellation access denied' using errcode = '42501';
  end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('order_id', v_order.id, 'status', v_order.status);
  end if;
  if v_order.status not in ('pending','processing') then
    raise exception 'only pending payment orders can be cancelled' using errcode = '55000';
  end if;

  update public.payment_orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;
  update public.invoices
  set status = 'cancelled', updated_at = now()
  where order_id = p_order_id and status = 'pending';

  v_actor := coalesce((select auth.uid()), p_requested_by);
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_actor, 'payment.cancelled', 'payment_order', p_order_id, jsonb_build_object('reason', p_reason));

  return jsonb_build_object(
    'order_id', v_order.id,
    'status', 'cancelled',
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code
  );
end;
$$;
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('pending','paid','failed','cancelled','refunded'));
revoke all on function public.cancel_payment_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.cancel_payment_order(uuid, text, uuid) to authenticated, service_role;

create or replace function public.mark_payment_order_failed(
  p_order_id uuid,
  p_provider_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders;
  v_invoice public.invoices;
begin
  if p_order_id is null then
    raise exception 'payment order id is required' using errcode = '22023';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'payment failure marking requires admin or service role' using errcode = '42501';
  end if;
  if v_order.status in ('succeeded','cancelled','refunded') then
    raise exception 'terminal payment orders cannot be marked failed' using errcode = '55000';
  end if;
  if v_order.status = 'pending' or v_order.status = 'processing' then
    update public.payment_orders
    set status = 'failed', updated_at = now()
    where id = p_order_id;
    update public.invoices i
    set status = 'failed', updated_at = now()
    where i.order_id = p_order_id and i.status = 'pending';
    insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
    values (null, 'payment.failed', 'payment_order', p_order_id, jsonb_build_object('provider_status', p_provider_status, 'reason', p_reason));
  end if;

  select * into v_order from public.payment_orders where id = p_order_id;
  select * into v_invoice from public.invoices where order_id = p_order_id;
  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code,
    'invoice_status', v_invoice.status
  );
end;
$$;
revoke all on function public.mark_payment_order_failed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_order_failed(uuid, text, text) to authenticated, service_role;

create or replace function public.cancel_subscription(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_cancel_at timestamptz;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if (select auth.uid()) is not null
    and (select auth.uid()) <> p_user_id
    and not public.is_admin() then
    raise exception 'subscription cancellation access denied' using errcode = '42501';
  end if;
  select * into v_subscription
  from public.subscriptions
  where user_id = p_user_id and status = 'active'
  order by updated_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  v_cancel_at := case
    when v_subscription.paid_until > now() then v_subscription.paid_until
    else now()
  end;
  update public.subscriptions
  set status = 'cancelled', cancel_at = v_cancel_at, cancelled_at = now(), updated_at = now()
  where id = v_subscription.id;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (coalesce((select auth.uid()), p_user_id), 'subscription.cancelled', 'subscription', v_subscription.id,
    jsonb_build_object('access_until', v_cancel_at));
  return jsonb_build_object('user_id', p_user_id, 'status', 'cancelled', 'access_until', v_cancel_at);
end;
$$;
revoke all on function public.cancel_subscription(uuid) from public, anon, authenticated;
grant execute on function public.cancel_subscription(uuid) to authenticated, service_role;

create or replace function public.has_feature_access(p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_features f
    where f.key = p_feature_key and f.enabled and auth.uid() is not null
      and coalesce(
        (select o.allowed from public.member_feature_overrides o
         where o.user_id = auth.uid() and o.feature_key = f.key),
        not f.requires_premium
        or exists (
          select 1 from public.paid_subscriptions s
          where s.user_id = auth.uid() and s.status = 'active' and s.paid_until > now()
            and (s.feature_key is null or s.feature_key = f.key)
        )
        or exists (
          select 1 from public.subscriptions s
          where s.user_id = auth.uid()
            and (
              (s.status = 'active' and (s.paid_until is null or s.paid_until > now()))
              or (s.status = 'cancelled' and s.cancel_at > now() and s.paid_until > now())
            )
            and (s.feature_key is null or s.feature_key = f.key)
        )
      )
  );
$$;
revoke all on function public.has_feature_access(text) from public, anon, authenticated;
grant execute on function public.has_feature_access(text) to authenticated;
