-- Security hardening: feature access uses the unified subscriptions table,
-- default gateway selection, and related audit fixes.

create or replace function public.has_feature_access(p_feature_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_features f
    where f.key=p_feature_key and f.enabled and auth.uid() is not null
      and coalesce((select o.allowed from public.member_feature_overrides o
        where o.user_id=auth.uid() and o.feature_key=f.key),
        not f.requires_premium or exists (
          select 1 from public.paid_subscriptions s
          where s.user_id=auth.uid() and s.status='active' and s.paid_until>now()
            and (s.feature_key is null or s.feature_key=f.key)
        ) or exists (
          select 1 from public.subscriptions s
          where s.user_id=auth.uid() and s.status='active' and (s.paid_until is null or s.paid_until>now())
            and (s.feature_key is null or s.feature_key=f.key)
        ))
  );
$$;
revoke all on function public.has_feature_access(text) from public,anon,authenticated;
grant execute on function public.has_feature_access(text) to authenticated;

create function public.admin_set_default_payment_gateway(p_gateway_id uuid)
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
  if not exists (select 1 from public.payment_gateways g where g.id = p_gateway_id and g.is_enabled = true) then
    raise exception 'default gateway must be enabled' using errcode = 'P0001';
  end if;
  update public.payment_gateways set is_default = false where is_default = true;
  update public.payment_gateways set is_default = true, updated_at = now() where id = p_gateway_id returning * into v_gateway;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'payment.gateway.default', 'payment_gateway', p_gateway_id, '{}'::jsonb);
  return jsonb_build_object('gateway_id', v_gateway.id, 'code', v_gateway.code, 'is_default', v_gateway.is_default);
end;
$$;

revoke all on function public.admin_set_default_payment_gateway(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_default_payment_gateway(uuid) to authenticated;
