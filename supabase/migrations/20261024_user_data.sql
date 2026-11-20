-- A single document preserves the current planner schema while it evolves.
-- Authentication users are managed by Supabase Auth, not by this table.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_data_payload_object check (jsonb_typeof(payload) = 'object')
);

alter table public.user_data enable row level security;

grant select, insert, update on public.user_data to authenticated;

drop policy if exists "Users read their own data" on public.user_data;
create policy "Users read their own data" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own data" on public.user_data;
create policy "Users create their own data" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own data" on public.user_data;
create policy "Users update their own data" on public.user_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
