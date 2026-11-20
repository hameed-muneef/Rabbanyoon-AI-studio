-- Payment administration: gateway configuration, admin order/refund views,
-- revenue summaries and subscription cancellation.

create function public.cancel_subscription(p_user_id uuid)
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
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user_id and not public.is_admin() then
    raise exception 'subscription cancellation access denied' using errcode = '42501';
  end if;
  select * into v_subscription from public.subscriptions where user_id = p_user_id order by updated_at desc limit 1;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  update public.subscriptions
  set status = 'cancelled', cancel_at = now(), cancelled_at = now(), updated_at = now()
  where id = v_subscription.id;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (p_user_id, 'subscription.cancelled', 'subscription', v_subscription.id, '{}'::jsonb);
  return jsonb_build_object('user_id', p_user_id, 'status', 'cancelled', 'cancelled_at', now());
end;
$$;

revoke all on function public.cancel_subscription(uuid) from public, anon, authenticated;
grant execute on function public.cancel_subscription(uuid) to authenticated;

create function public.admin_set_payment_gateway(
  p_gateway_id uuid,
  p_is_enabled boolean,
  p_is_sandbox boolean,
  p_base_url text,
  p_create_order_path text,
  p_callback_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gateway public.payment_gateways;
begin
  if not public.is_admin() then
    raise exception 'payment gateway configuration requires admin' using errcode = '42501';
  end if;
  if p_gateway_id is null then
    raise exception 'gateway id is required' using errcode = '22023';
  end if;
  update public.payment_gateways
  set is_enabled = coalesce(p_is_enabled, is_enabled),
      is_sandbox = coalesce(p_is_sandbox, is_sandbox),
      base_url = coalesce(nullif(btrim(p_base_url), ''), base_url),
      create_order_path = coalesce(nullif(btrim(p_create_order_path), ''), create_order_path),
      callback_path = coalesce(nullif(btrim(p_callback_path), ''), callback_path),
      updated_at = now()
  where id = p_gateway_id
  returning * into v_gateway;
  if not found then
    raise exception 'payment gateway not found' using errcode = 'P0001';
  end if;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'payment.gateway.updated', 'payment_gateway', p_gateway_id, jsonb_build_object('enabled', v_gateway.is_enabled, 'sandbox', v_gateway.is_sandbox));
  return jsonb_build_object(
    'gateway_id', v_gateway.id,
    'code', v_gateway.code,
    'name', v_gateway.name,
    'is_enabled', v_gateway.is_enabled,
    'is_sandbox', v_gateway.is_sandbox,
    'base_url', v_gateway.base_url,
    'create_order_path', v_gateway.create_order_path,
    'callback_path', v_gateway.callback_path
  );
end;
$$;

revoke all on function public.admin_set_payment_gateway(uuid, boolean, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_payment_gateway(uuid, boolean, boolean, text, text, text) to authenticated;

create function public.list_payment_orders_admin(
  p_limit int default 50,
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
  if not public.is_admin() then
    raise exception 'payment order listing requires admin' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(order_row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'order_id', o.id,
      'user_id', o.user_id,
      'status', o.status,
      'amount', o.amount,
      'currency_code', o.currency_code,
      'provider_order_id', o.provider_order_id,
      'created_at', o.created_at
    ) as order_row
    from public.payment_orders o
    order by o.created_at desc
    limit p_limit
    offset p_offset
  ) sub;
  return v_rows;
end;
$$;

revoke all on function public.list_payment_orders_admin(int, int) from public, anon, authenticated;
grant execute on function public.list_payment_orders_admin(int, int) to authenticated;

create function public.payment_revenue_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'revenue summary requires admin' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(summary_row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'currency_code', o.currency_code,
      'provider', g.code,
      'status', o.status,
      'order_count', count(*)::int,
      'total_amount', coalesce(sum(o.amount), 0)
    ) as summary_row
    from public.payment_orders o
    join public.payment_gateways g on g.id = o.gateway_id
    group by o.currency_code, g.code, o.status
  ) sub;
  return v_rows;
end;
$$;

revoke all on function public.payment_revenue_summary() from public, anon, authenticated;
grant execute on function public.payment_revenue_summary() to authenticated;
