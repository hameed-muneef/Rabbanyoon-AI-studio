-- Payment foundation for the global gateway abstraction layer.
-- Stage 1 of docs/payment-system-implementation-plan.md: creates the core
-- payment/subscription entities with RLS and service-role-only access. No
-- provider credentials or live charges are introduced here.

create table public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('xpay','paytabs','paymob')),
  name text not null,
  is_enabled boolean not null default false,
  is_sandbox boolean not null default true,
  is_default boolean not null default false,
  base_url text not null default '',
  create_order_path text not null default '',
  callback_path text not null default '',
  supported_currencies text[] not null default '{}',
  supported_methods text[] not null default '{}',
  fee_percent numeric(8,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_gateways_enabled_idx on public.payment_gateways(is_enabled) where is_enabled = true;
create unique index payment_gateways_one_default_idx on public.payment_gateways(is_default) where is_default = true;

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  gateway_id uuid not null references public.payment_gateways(id) on delete cascade,
  code text not null,
  name text not null,
  method_type text not null check (method_type in ('card','bank_transfer','wallet','bnpl','cash')),
  is_enabled boolean not null default true,
  supports_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  unique (gateway_id, code)
);

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null default '',
  decimals int not null default 2,
  is_default_display boolean not null default false,
  is_settlement boolean not null default false
);

create table public.exchange_rates (
  base_currency text not null,
  quote_currency text not null,
  rate numeric(24,12) not null check (rate > 0),
  effective_at timestamptz not null default now(),
  source text not null default 'manual',
  primary key (base_currency, quote_currency, effective_at)
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null,
  name text not null,
  billing_interval text not null default 'monthly' check (billing_interval in ('none','monthly','yearly')),
  price_amount numeric(14,2) not null check (price_amount > 0),
  currency_code text not null,
  trial_days int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  feature_key text,
  status text not null default 'pending'
    check (status in ('pending','active','past_due','cancelled','expired','suspended')),
  provider text not null default 'xpay',
  provider_subscription_id text not null default '',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_status_idx on public.subscriptions(user_id,status,paid_until);
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  gateway_id uuid not null references public.payment_gateways(id),
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','cancelled','refunded')),
  idempotency_key text not null,
  provider_order_id text,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);
create index payment_orders_user_status_idx on public.payment_orders(user_id,status,created_at desc);
create index payment_orders_subscription_idx on public.payment_orders(subscription_id);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id) on delete cascade,
  gateway_id uuid not null references public.payment_gateways(id),
  provider_transaction_id text not null,
  provider_status text not null default 'pending',
  amount numeric(14,2) not null,
  currency_code text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_transaction_id)
);

create index payment_transactions_order_idx on public.payment_transactions(order_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  order_id uuid references public.payment_orders(id) on delete set null,
  amount numeric(14,2) not null,
  currency_code text not null,
  status text not null default 'pending'
    check (status in ('pending','paid','failed','refunded')),
  issue_at timestamptz not null default now(),
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_number)
);

create index invoices_user_created_idx on public.invoices(user_id,created_at desc);
create index invoices_subscription_idx on public.invoices(subscription_id);
create index invoices_order_idx on public.invoices(order_id);

create table public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  gateway_id uuid not null references public.payment_gateways(id),
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  signature text not null default '',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gateway_id, event_id)
);

create index payment_webhooks_gateway_idx on public.payment_webhooks(gateway_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  order_id uuid references public.payment_orders(id) on delete set null,
  provider_refund_id text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null,
  status text not null default 'pending'
    check (status in ('pending','succeeded','failed')),
  reason text not null default '',
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index refunds_transaction_idx on public.refunds(transaction_id);
create index refunds_order_idx on public.refunds(order_id);

create table public.payment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index payment_audit_logs_created_idx on public.payment_audit_logs(created_at desc);
create index payment_audit_logs_actor_idx on public.payment_audit_logs(actor_id);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger payment_gateways_set_updated_at before update on public.payment_gateways
  for each row execute function private.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods
  for each row execute function private.set_updated_at();
create trigger subscription_plans_set_updated_at before update on public.subscription_plans
  for each row execute function private.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger payment_orders_set_updated_at before update on public.payment_orders
  for each row execute function private.set_updated_at();
create trigger payment_transactions_set_updated_at before update on public.payment_transactions
  for each row execute function private.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();


-- Security posture: deny direct table access to client roles; access through
-- audited RPCs only (same pattern as the existing paid-subscription tables).
alter table public.payment_gateways enable row level security;
revoke all on public.payment_gateways from public, anon;
grant select on public.payment_gateways to authenticated;
grant all on public.payment_gateways to service_role;
create policy payment_gateways_read on public.payment_gateways for select to authenticated using (is_enabled = true);

alter table public.payment_methods enable row level security;
revoke all on public.payment_methods from public, anon, authenticated;
grant select, insert, update, delete on public.payment_methods to service_role;

alter table public.currencies enable row level security;
revoke all on public.currencies from public, anon, authenticated;
grant select, insert, update, delete on public.currencies to service_role;

alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from public, anon, authenticated;
grant select, insert, update, delete on public.exchange_rates to service_role;

alter table public.subscription_plans enable row level security;
revoke all on public.subscription_plans from public, anon;
grant select on public.subscription_plans to authenticated;
grant all on public.subscription_plans to service_role;
create policy subscription_plans_read on public.subscription_plans for select to authenticated using (is_active = true);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from public, anon, authenticated;
grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;
create policy payment_orders_owner_select on public.payment_orders for select to authenticated using ((select auth.uid()) = user_id);

alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from public, anon, authenticated;
grant select, insert, update, delete on public.payment_transactions to service_role;

alter table public.invoices enable row level security;
revoke all on public.invoices from public, anon;
grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;
create policy invoices_owner_select on public.invoices for select to authenticated using ((select auth.uid()) = user_id);

alter table public.payment_webhooks enable row level security;
revoke all on public.payment_webhooks from public, anon, authenticated;
grant select, insert, update, delete on public.payment_webhooks to service_role;

alter table public.refunds enable row level security;
revoke all on public.refunds from public, anon, authenticated;
grant select, insert, update, delete on public.refunds to service_role;
create policy refunds_admin_select on public.refunds for select to authenticated using (public.is_admin());

alter table public.payment_audit_logs enable row level security;
revoke all on public.payment_audit_logs from public, anon, authenticated;
grant select, insert, update, delete on public.payment_audit_logs to service_role;
