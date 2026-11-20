-- Administrator membership is granted only to confirmed, pre-approved emails.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_allowlist (
  email text primary key,
  added_at timestamptz not null default now()
);
revoke all on private.admin_allowlist from public, anon, authenticated;

create table if not exists public.admin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_accounts enable row level security;
grant select on public.admin_accounts to authenticated;
revoke insert, update, delete on public.admin_accounts from anon, authenticated;
drop policy if exists "Admins view own membership" on public.admin_accounts;
create policy "Admins view own membership" on public.admin_accounts
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_accounts
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function private.grant_allowed_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and exists (
    select 1 from private.admin_allowlist where email = lower(new.email)
  ) then
    insert into public.admin_accounts(user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.grant_allowed_admin() from public, anon, authenticated;
drop trigger if exists grant_allowed_admin_on_confirmation on auth.users;
create trigger grant_allowed_admin_on_confirmation
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.grant_allowed_admin();

create table if not exists public.platform_curriculum (
  id text primary key check (id = 'main'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.platform_curriculum enable row level security;
grant select, insert, update on public.platform_curriculum to authenticated;
revoke delete on public.platform_curriculum from anon, authenticated;
drop policy if exists "Members read platform curriculum" on public.platform_curriculum;
create policy "Members read platform curriculum" on public.platform_curriculum
  for select to authenticated using (true);
drop policy if exists "Admins create platform curriculum" on public.platform_curriculum;
create policy "Admins create platform curriculum" on public.platform_curriculum
  for insert to authenticated with check ((select public.is_admin()) and updated_by = (select auth.uid()));
drop policy if exists "Admins update platform curriculum" on public.platform_curriculum;
create policy "Admins update platform curriculum" on public.platform_curriculum
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
