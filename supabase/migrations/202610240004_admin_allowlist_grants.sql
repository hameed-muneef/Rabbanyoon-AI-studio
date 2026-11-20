-- Approval after signup/confirmation must also grant membership. Only trusted
-- database operators can write this private allowlist; no self-enrolment API.
create or replace function private.grant_existing_allowed_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_accounts(user_id)
    select id from auth.users
    where lower(email) = lower(trim(new.email)) and email_confirmed_at is not null
    on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.grant_existing_allowed_admin() from public, anon, authenticated;
create trigger grant_existing_admin_on_approval
  after insert or update of email on private.admin_allowlist
  for each row execute function private.grant_existing_allowed_admin();

create or replace function private.grant_allowed_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and exists (
    select 1 from private.admin_allowlist where lower(trim(email)) = lower(new.email)
  ) then
    insert into public.admin_accounts(user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Repair existing confirmed accounts already approved by an operator.
insert into public.admin_accounts(user_id)
  select u.id from auth.users u
  where u.email_confirmed_at is not null and exists (
    select 1 from private.admin_allowlist a where lower(trim(a.email)) = lower(u.email)
  ) on conflict do nothing;
