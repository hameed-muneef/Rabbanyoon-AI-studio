-- Payment operations: audited RPC layer for orders, capture, refunds and invoices.
-- State transitions only run through verified provider events and audited RPCs;
-- clients never flip payment state or activate access directly.

create function public.create_payment_order(
  p_user_id uuid,
  p_plan_id uuid,
  p_gateway_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_idempotency_key text,
  p_description text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_invoice_id uuid;
  v_inserted integer;
  v_order public.payment_orders;
  v_invoice public.invoices;
  v_plan_amount numeric;
  v_plan_currency text;
begin
  if p_user_id is null or p_plan_id is null or p_gateway_id is null then
    raise exception 'payment order requires user, plan and gateway' using errcode = '22023';
  end if;
  if (select auth.uid()) is not null
     and (select auth.uid()) <> p_user_id
     and not public.is_admin() then
    raise exception 'payment order user does not match the caller' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment order amount must be greater than zero' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) < 4 then
    raise exception 'payment order idempotency key must be at least 4 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'payment order user does not exist' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.subscription_plans pl where pl.id = p_plan_id and pl.is_active = true) then
    raise exception 'payment order plan is not active' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payment_gateways g where g.id = p_gateway_id and g.is_enabled = true) then
    raise exception 'payment order gateway is not enabled' using errcode = 'P0001';
  end if;

  select pl.price_amount, pl.currency_code into v_plan_amount, v_plan_currency
  from public.subscription_plans pl where pl.id = p_plan_id;
  if v_plan_amount is null or v_plan_currency is null then
    raise exception 'payment order plan has no trusted price' using errcode = 'P0001';
  end if;
  if p_amount is not null and p_amount <> v_plan_amount then
    raise exception 'payment order amount does not match the plan price' using errcode = '22023';
  end if;
  if p_currency_code is not null and upper(btrim(p_currency_code)) <> v_plan_currency then
    raise exception 'payment order currency does not match the plan currency' using errcode = '22023';
  end if;

  insert into public.payment_orders(user_id, subscription_id, plan_id, gateway_id, amount, currency_code, status, idempotency_key, description, provider_order_id)
  values (p_user_id, null, p_plan_id, p_gateway_id, v_plan_amount, v_plan_currency, 'pending', p_idempotency_key, p_description, null)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  select o.id into v_order_id from public.payment_orders o where o.idempotency_key = p_idempotency_key;

  if v_inserted = 1 then
    insert into public.invoices(user_id, subscription_id, order_id, amount, currency_code, status, due_at, invoice_number)
    values (p_user_id, null, v_order_id, v_plan_amount, v_plan_currency, 'pending', now() + interval '14 days', 'INV-' || replace(gen_random_uuid()::text, '-', ''))
    returning id into v_invoice_id;
  end if;

  select * into v_order from public.payment_orders where id = v_order_id;
  select * into v_invoice from public.invoices where order_id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code,
    'idempotency_key', v_order.idempotency_key,
    'created', v_inserted = 1,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status
  );
end;
$$;

revoke all on function public.create_payment_order(uuid, uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.create_payment_order(uuid, uuid, uuid, numeric, text, text, text) to authenticated;

create function public.get_payment_order(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders;
  v_invoice public.invoices;
begin
  if p_order_id is null or p_user_id is null then
    raise exception 'payment order lookup requires order id and user id' using errcode = '22023';
  end if;
  if (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'payment order access denied' using errcode = '42501';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  select * into v_invoice from public.invoices where order_id = p_order_id;
  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code,
    'created_at', v_order.created_at,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status
  );
end;
$$;

revoke all on function public.get_payment_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_payment_order(uuid, uuid) to authenticated;

create function public.mark_payment_order_succeeded(
  p_order_id uuid,
  p_provider_order_id text,
  p_provider_status text,
  p_amount numeric,
  p_currency_code text,
  p_provider_payment_id text,
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders;
  v_invoice public.invoices;
  v_period interval;
begin
  if p_order_id is null then
    raise exception 'payment order id is required' using errcode = '22023';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'payment activation requires admin or service role' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount <> v_order.amount then
    raise exception 'payment amount does not match the order' using errcode = '22023';
  end if;
  if p_currency_code is not null and upper(btrim(p_currency_code)) <> v_order.currency_code then
    raise exception 'payment currency does not match the order' using errcode = '22023';
  end if;

  if v_order.status in ('cancelled','failed','refunded') then
    raise exception 'payment order cannot be activated in its current state' using errcode = 'P0001';
  end if;

  if v_order.status <> 'succeeded' then
    if p_event_id is not null then
      insert into public.payment_webhooks(gateway_id, event_id, event_type, payload, signature_verified, signature, processed_at)
      values (v_order.gateway_id, p_event_id, 'payment.succeeded', '{}'::jsonb, true, '', now())
      on conflict do nothing;
    end if;
    update public.payment_orders
    set status = 'succeeded', provider_order_id = coalesce(provider_order_id, p_provider_order_id), updated_at = now()
    where id = p_order_id;

    v_period = (select case pl.billing_interval when 'yearly' then interval '365 days' else interval '30 days' end
                from public.subscription_plans pl where pl.id = v_order.plan_id);

    if exists (
      select 1 from public.subscriptions s
      where s.user_id = v_order.user_id and s.plan_id = v_order.plan_id
    ) then
      update public.subscriptions s
      set status = 'active',
          feature_key = pl.feature_key,
          provider_subscription_id = coalesce(s.provider_subscription_id, p_provider_payment_id, v_order.provider_order_id),
          paid_until = coalesce(s.paid_until, now() + v_period),
          current_period_start = coalesce(s.current_period_start, now()),
          current_period_end = coalesce(s.current_period_end, now() + v_period),
          updated_at = now()
      from public.subscription_plans pl
      where s.id = (
        select s2.id
        from public.subscriptions s2
        where s2.user_id = v_order.user_id and s2.plan_id = v_order.plan_id
        order by s2.updated_at desc, s2.created_at desc
        limit 1
      ) and pl.id = v_order.plan_id;
    else
      insert into public.subscriptions(user_id, plan_id, feature_key, status, provider, provider_subscription_id, current_period_start, current_period_end, paid_until, created_at, updated_at)
      select v_order.user_id, v_order.plan_id, pl.feature_key, 'active', 'xpay', coalesce(p_provider_payment_id, v_order.provider_order_id), now(), now() + v_period, now() + v_period, now(), now()
      from public.subscription_plans pl where pl.id = v_order.plan_id;
    end if;

    update public.invoices i
    set status = 'paid', paid_at = now(), updated_at = now()
    where i.order_id = p_order_id;

    insert into public.payment_transactions(order_id, gateway_id, provider_transaction_id, provider_status, amount, currency_code, status, metadata)
    values (p_order_id, v_order.gateway_id, coalesce(p_provider_order_id, v_order.provider_order_id, ''), coalesce(p_provider_status, 'approved'), v_order.amount, v_order.currency_code, 'succeeded', jsonb_build_object('event_id', p_event_id, 'provider_payment_id', p_provider_payment_id));
  end if;

  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (null, 'payment.succeeded', 'payment_order', p_order_id, jsonb_build_object('provider_order_id', p_provider_order_id, 'event_id', p_event_id));

  select * into v_order from public.payment_orders where id = p_order_id;
  select * into v_invoice from public.invoices where order_id = p_order_id;
  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status
  );
end;
$$;

revoke all on function public.mark_payment_order_succeeded(uuid, text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_order_succeeded(uuid, text, text, numeric, text, text, text) to authenticated;

create function public.mark_payment_order_failed(
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
  select * into v_order from public.payment_orders where id = p_order_id;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'payment failure marking requires admin or service role' using errcode = '42501';
  end if;
  update public.payment_orders
  set status = 'failed', updated_at = now()
  where id = p_order_id;
  update public.invoices i
  set status = 'failed', updated_at = now()
  where i.order_id = p_order_id;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (null, 'payment.failed', 'payment_order', p_order_id, jsonb_build_object('provider_status', p_provider_status, 'reason', p_reason));

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
grant execute on function public.mark_payment_order_failed(uuid, text, text) to authenticated;

create function public.refund_payment_order(
  p_order_id uuid,
  p_provider_refund_id text,
  p_amount numeric,
  p_currency_code text,
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
  v_refund public.refunds;
begin
  if p_order_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'refund requires order id and a positive amount' using errcode = '22023';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'payment refund requires admin or service role' using errcode = '42501';
  end if;
  if v_order.status <> 'succeeded' then
    raise exception 'only succeeded orders can be refunded' using errcode = 'P0001';
  end if;
  if p_amount > v_order.amount then
    raise exception 'refund amount exceeds the order amount' using errcode = '22023';
  end if;
  if p_currency_code is not null and upper(btrim(p_currency_code)) <> v_order.currency_code then
    raise exception 'refund currency does not match the order' using errcode = '22023';
  end if;
  insert into public.refunds(transaction_id, order_id, provider_refund_id, amount, currency_code, status, reason, requested_by)
  values (null, p_order_id, coalesce(p_provider_refund_id, ''), p_amount, coalesce(p_currency_code, v_order.currency_code), 'pending', coalesce(p_reason, 'requested'), p_requested_by);

  update public.refunds
  set status = 'succeeded'
  where order_id = p_order_id and provider_refund_id = coalesce(p_provider_refund_id, '');

  update public.payment_orders
  set status = 'refunded', updated_at = now()
  where id = p_order_id;

  update public.subscriptions s
  set status = 'cancelled', cancel_at = now(), cancelled_at = now(), updated_at = now()
  where s.user_id = v_order.user_id
    and (s.feature_key is null or s.feature_key = (select pl.feature_key from public.subscription_plans pl where pl.id = v_order.plan_id));

  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (p_requested_by, 'payment.refunded', 'payment_order', p_order_id, jsonb_build_object('provider_refund_id', p_provider_refund_id, 'amount', p_amount));

  select * into v_refund from public.refunds where order_id = p_order_id order by created_at desc limit 1;
  return jsonb_build_object(
    'refund_id', v_refund.id,
    'order_id', p_order_id,
    'provider_refund_id', v_refund.provider_refund_id,
    'amount', v_refund.amount,
    'status', v_refund.status
  );
end;
$$;

revoke all on function public.refund_payment_order(uuid, text, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.refund_payment_order(uuid, text, numeric, text, text, uuid) to authenticated;

create function public.cancel_payment_order(
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
begin
  if p_order_id is null then
    raise exception 'payment order id is required' using errcode = '22023';
  end if;
  select * into v_order from public.payment_orders where id = p_order_id;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and (select auth.uid()) <> v_order.user_id and not public.is_admin() then
    raise exception 'payment cancellation access denied' using errcode = '42501';
  end if;
  update public.payment_orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;
  select * into v_order from public.payment_orders where id = p_order_id;
  update public.subscriptions s
  set status = 'cancelled', cancel_at = now(), cancelled_at = now(), updated_at = now()
  where s.user_id = v_order.user_id and s.status = 'active'
    and (s.feature_key is null or s.feature_key = (select pl.feature_key from public.subscription_plans pl where pl.id = v_order.plan_id));

  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (p_requested_by, 'payment.cancelled', 'payment_order', p_order_id, jsonb_build_object('reason', p_reason));

  return jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'provider_order_id', v_order.provider_order_id,
    'amount', v_order.amount,
    'currency_code', v_order.currency_code
  );
end;
$$;

revoke all on function public.cancel_payment_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.cancel_payment_order(uuid, text, uuid) to authenticated;

create function public.list_payment_orders(
  p_user_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'payment order access denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(order_row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'order_id', o.id,
      'status', o.status,
      'provider_order_id', o.provider_order_id,
      'amount', o.amount,
      'currency_code', o.currency_code,
      'created_at', o.created_at
    ) as order_row
    from public.payment_orders o
    where o.user_id = p_user_id
    order by o.created_at desc
    limit p_limit
    offset p_offset
  ) sub;
  return v_rows;
end;
$$;

revoke all on function public.list_payment_orders(uuid, int, int) from public, anon, authenticated;
grant execute on function public.list_payment_orders(uuid, int, int) to authenticated;

create function public.list_invoices(
  p_user_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'invoice access denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(invoice_row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'invoice_id', i.id,
      'invoice_number', i.invoice_number,
      'order_id', i.order_id,
      'amount', i.amount,
      'currency_code', i.currency_code,
      'status', i.status,
      'issue_at', i.issue_at,
      'due_at', i.due_at,
      'paid_at', i.paid_at
    ) as invoice_row
    from public.invoices i
    where i.user_id = p_user_id
    order by i.created_at desc
    limit p_limit
    offset p_offset
  ) sub;
  return v_rows;
end;
$$;

revoke all on function public.list_invoices(uuid, int, int) from public, anon, authenticated;
grant execute on function public.list_invoices(uuid, int, int) to authenticated;

create function public.list_payment_refunds(
  p_user_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'refund access denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(refund_row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'refund_id', r.id,
      'order_id', r.order_id,
      'provider_refund_id', r.provider_refund_id,
      'amount', r.amount,
      'currency_code', r.currency_code,
      'status', r.status,
      'reason', r.reason,
      'created_at', r.created_at
    ) as refund_row
    from public.refunds r
    where r.requested_by = p_user_id
    order by r.created_at desc
    limit p_limit
    offset p_offset
  ) sub;
  return v_rows;
end;
$$;

revoke all on function public.list_payment_refunds(uuid, int, int) from public, anon, authenticated;
grant execute on function public.list_payment_refunds(uuid, int, int) to authenticated;

create function public.record_payment_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;

revoke all on function public.record_payment_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_audit(uuid, text, text, text, jsonb) to authenticated;

create function public.get_user_subscription(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'subscription access denied' using errcode = '42501';
  end if;
  select * into v_subscription from public.subscriptions where user_id = p_user_id order by updated_at desc limit 1;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object(
    'user_id', v_subscription.user_id,
    'status', v_subscription.status,
    'provider', v_subscription.provider,
    'provider_subscription_id', v_subscription.provider_subscription_id,
    'paid_until', v_subscription.paid_until,
    'current_period_start', v_subscription.current_period_start,
    'current_period_end', v_subscription.current_period_end,
    'cancelled_at', v_subscription.cancelled_at
  );
end;
$$;

revoke all on function public.get_user_subscription(uuid) from public, anon, authenticated;
grant execute on function public.get_user_subscription(uuid) to authenticated;
