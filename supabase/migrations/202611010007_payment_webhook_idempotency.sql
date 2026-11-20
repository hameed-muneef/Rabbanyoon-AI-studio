-- Bind each verified provider event to one internal order before allowing the
-- payment state transition. This prevents a replay from being applied to a
-- different order and serializes concurrent delivery for the same order.
alter table public.payment_webhooks
  add column order_id uuid references public.payment_orders(id) on delete set null;

alter table public.payment_orders
  add column expires_at timestamptz;
update public.payment_orders
set expires_at = created_at + interval '30 minutes'
where expires_at is null;
alter table public.payment_orders
  alter column expires_at set default (now() + interval '30 minutes'),
  alter column expires_at set not null;

alter function public.mark_payment_order_succeeded(uuid, text, text, numeric, text, text, text)
  rename to mark_payment_order_succeeded_internal;
revoke all on function public.mark_payment_order_succeeded_internal(uuid, text, text, numeric, text, text, text)
  from public, anon, authenticated;

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
  v_existing_subscription public.subscriptions;
  v_prior_order_id uuid;
  v_inserted integer;
  v_result jsonb;
  v_interval text;
  v_period interval;
  v_period_start timestamptz;
begin
  if p_order_id is null
    or p_provider_order_id is null or char_length(btrim(p_provider_order_id)) = 0
    or p_provider_payment_id is null or char_length(btrim(p_provider_payment_id)) = 0
    or p_event_id is null or char_length(btrim(p_event_id)) = 0
    or p_amount is null or p_amount <= 0
    or p_currency_code is null or upper(btrim(p_currency_code)) !~ '^[A-Z]{3}$'
    or lower(coalesce(p_provider_status, '')) not in ('succeeded','success','paid','approved') then
    raise exception 'verified payment event is incomplete or invalid' using errcode = '22023';
  end if;

  select * into v_order from public.payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'payment order not found' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'payment activation requires admin or service role' using errcode = '42501';
  end if;
  if p_amount <> v_order.amount then
    raise exception 'payment amount does not match the order' using errcode = '22023';
  end if;
  if upper(btrim(p_currency_code)) <> v_order.currency_code then
    raise exception 'payment currency does not match the order' using errcode = '22023';
  end if;
  if v_order.provider_order_id is not null and v_order.provider_order_id <> p_provider_order_id then
    raise exception 'provider order reference does not match the payment order' using errcode = '22023';
  end if;
  if v_order.status in ('cancelled','failed','refunded') then
    raise exception 'payment order cannot be activated in its current state' using errcode = 'P0001';
  end if;
  if v_order.expires_at <= now() then
    raise exception 'payment order session has expired' using errcode = 'P0001';
  end if;

  select * into v_existing_subscription
  from public.subscriptions s
  where s.user_id = v_order.user_id and s.plan_id = v_order.plan_id
  order by s.updated_at desc, s.created_at desc
  limit 1;

  insert into public.payment_webhooks(gateway_id, event_id, event_type, payload, signature_verified, signature, processed_at, order_id)
  values (v_order.gateway_id, p_event_id, 'payment.succeeded', '{}'::jsonb, true, '', now(), p_order_id)
  on conflict (gateway_id, event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select w.order_id into v_prior_order_id
    from public.payment_webhooks w
    where w.gateway_id = v_order.gateway_id and w.event_id = p_event_id;
    if v_prior_order_id is distinct from p_order_id then
      return jsonb_build_object('duplicate', true, 'ignored', true, 'order_id', p_order_id);
    end if;
    return public.mark_payment_order_succeeded_internal(
      p_order_id, p_provider_order_id, p_provider_status, p_amount,
      p_currency_code, p_provider_payment_id, null
    );
  end if;

  v_result := public.mark_payment_order_succeeded_internal(
    p_order_id, p_provider_order_id, p_provider_status, p_amount,
    p_currency_code, p_provider_payment_id, null
  );
  if v_result->>'status' <> 'succeeded' or v_order.status = 'succeeded' then
    return v_result;
  end if;

  select pl.billing_interval into v_interval
  from public.subscription_plans pl
  where pl.id = v_order.plan_id;
  if v_interval = 'none' then
    update public.subscriptions s
    set paid_until = null, current_period_end = null, updated_at = now()
    where s.id = coalesce(
      v_existing_subscription.id,
      (select s2.id from public.subscriptions s2
       where s2.user_id = v_order.user_id and s2.plan_id = v_order.plan_id
       order by s2.updated_at desc, s2.created_at desc limit 1)
    );
  elsif v_existing_subscription.id is not null then
    v_period := case v_interval when 'yearly' then interval '365 days' else interval '30 days' end;
    v_period_start := greatest(
      coalesce(v_existing_subscription.current_period_end, v_existing_subscription.paid_until, now()),
      now()
    );
    update public.subscriptions s
    set current_period_start = v_period_start,
        current_period_end = v_period_start + v_period,
        paid_until = v_period_start + v_period,
        updated_at = now()
    where s.id = v_existing_subscription.id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.mark_payment_order_succeeded(uuid, text, text, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_order_succeeded(uuid, text, text, numeric, text, text, text)
  to authenticated, service_role;
