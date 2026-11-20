-- Payment integration readiness tracking for the admin dashboard.
-- Stores operator-recorded verification states; never stores secrets.

create table public.payment_integration_settings (
  id int primary key default 1 check (id = 1),
  merchant_approved boolean not null default false,
  webhook_configured boolean not null default false,
  sandbox_tested boolean not null default false,
  production_credentials_verified boolean not null default false,
  live_enabled boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.payment_integration_settings(id) values (1) on conflict (id) do nothing;

alter table public.payment_integration_settings enable row level security;
revoke all on public.payment_integration_settings from public, anon, authenticated;
grant select, insert, update on public.payment_integration_settings to service_role;
grant select on public.payment_integration_settings to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger payment_integration_settings_updated_at before update on public.payment_integration_settings
  for each row execute function private.set_updated_at();

create function public.get_payment_integration_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.payment_integration_settings;
  v_gateway public.payment_gateways;
  v_db_ready boolean;
  v_signature_verification text := 'not_implemented';
begin
  if not public.is_admin() then
    raise exception 'payment integration status requires admin' using errcode = '42501';
  end if;
  select * into v_settings from public.payment_integration_settings where id = 1;
  select * into v_gateway from public.payment_gateways where is_default = true and is_enabled = true limit 1;
  if v_gateway.id is null then
    select * into v_gateway from public.payment_gateways where is_enabled = true order by code limit 1;
  end if;
  v_db_ready := exists (select 1 from information_schema.tables where table_schema='public' and table_name='payment_orders');
  return jsonb_build_object(
    'integration_status', case
      when v_gateway.id is null then 'not_configured'
      when v_signature_verification <> 'verified'
        or not v_gateway.is_sandbox
        or not v_settings.webhook_configured then 'configuration_incomplete'
      when not v_settings.sandbox_tested then 'sandbox_ready'
      when v_gateway.is_sandbox
        and not v_settings.merchant_approved then 'awaiting_provider_approval'
      when v_gateway.is_sandbox
        and not v_settings.production_credentials_verified then 'sandbox_verified'
      when v_gateway.is_sandbox
        and v_settings.merchant_approved
        and v_settings.production_credentials_verified then 'production_ready'
      else 'configuration_incomplete'
    end,
    'database_setup', case when v_db_ready then 'ready' else 'not_ready' end,
    'provider_selected', coalesce(v_gateway.code, 'none'),
    'provider_name', coalesce(v_gateway.name, 'لم يُحدَّد'),
    'merchant_account_approval', case when v_settings.merchant_approved then 'approved' else 'pending' end,
    'sandbox_configured', case when v_gateway.id is null then 'not_configured' when v_gateway.is_sandbox then 'configured' else 'production_mode' end,
    'webhook_configured', case when v_settings.webhook_configured then 'configured' else 'not_configured' end,
    'signature_verification', v_signature_verification,
    'sandbox_tested', case when v_settings.sandbox_tested then 'verified' else 'not_tested' end,
    'production_credentials', case when v_settings.production_credentials_verified then 'verified' else 'not_verified' end,
    'live_payments_enabled', 'disabled',
    'live_enabled_flag', false,
    'notes', v_settings.notes,
    'updated_at', v_settings.updated_at
  );
end;
$$;

revoke all on function public.get_payment_integration_status() from public, anon, authenticated;
grant execute on function public.get_payment_integration_status() to authenticated;

create function public.admin_update_payment_integration_status(
  p_merchant_approved boolean,
  p_webhook_configured boolean,
  p_sandbox_tested boolean,
  p_production_credentials_verified boolean,
  p_live_enabled boolean,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.payment_integration_settings;
begin
  if not public.is_admin() then
    raise exception 'payment integration status requires admin' using errcode = '42501';
  end if;
  if coalesce(p_live_enabled, false) then
    raise exception 'live payments are unavailable until a provider integration is verified' using errcode = '55000';
  end if;
  update public.payment_integration_settings
  set merchant_approved = coalesce(p_merchant_approved, merchant_approved),
      webhook_configured = coalesce(p_webhook_configured, webhook_configured),
      sandbox_tested = coalesce(p_sandbox_tested, sandbox_tested),
      production_credentials_verified = coalesce(p_production_credentials_verified, production_credentials_verified),
      live_enabled = false,
      notes = coalesce(p_notes, notes),
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1
  returning * into v_settings;
  insert into public.payment_audit_logs(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'payment.integration.updated', 'payment_integration', '1', jsonb_build_object('live_enabled', false));
  return jsonb_build_object('ok', true, 'live_enabled', false);
end;
$$;

revoke all on function public.admin_update_payment_integration_status(boolean, boolean, boolean, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_update_payment_integration_status(boolean, boolean, boolean, boolean, boolean, text) to authenticated;
