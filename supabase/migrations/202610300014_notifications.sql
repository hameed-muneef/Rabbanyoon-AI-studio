-- INT-004: in-app notifications (no push provider in phase 1). Notifications are
-- scoped to the recipient; creators must be an administrator or a circle founder
-- notifying members of their own circle. No secrets or payment data are stored.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('announcement','join_request','join_decision','course','session','report','system')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 2000),
  link text not null default '' check (char_length(link) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
-- Recipients read their own; no direct writes.
create policy own_notification_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create function public.send_notification(p_recipient_id uuid, p_kind text, p_title text,
  p_body text default '', p_link text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'إرسال إشعار يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  if p_recipient_id is null then
    raise exception 'مستلم الإشعار مطلوب' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('announcement','join_request','join_decision','course','session','report','system') then
    raise exception 'نوع الإشعار غير صالح' using errcode = '22023';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'عنوان الإشعار يجب أن يكون بين 1 و200 حرف' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body,'')) > 2000 or char_length(coalesce(p_link,'')) > 500 then
    raise exception 'محتوى الإشعار تجاوز الحد' using errcode = '22023';
  end if;
  -- Only admins may notify arbitrary users; founders may notify members of their own circles.
  if not public.is_admin() and not exists (
    select 1 from public.group_members m
      join public.study_groups g on g.id = m.group_id
     where m.user_id = p_recipient_id and g.founder_id = v_actor
       and m.group_id in (select group_id from public.group_members where user_id = v_actor and role = 'founder')
  ) then
    raise exception 'لا تملك صلاحية إرسال إشعار لهذا المستخدم' using errcode = '42501';
  end if;
  insert into public.notifications (recipient_id, kind, title, body, link)
    values (p_recipient_id, p_kind, btrim(p_title), coalesce(p_body,''), coalesce(p_link,''))
    returning id into v_id;
  return v_id;
end $$;

create function public.list_notifications(p_limit integer default 50)
returns table (notification_id uuid, notification_kind text, notification_title text,
               notification_body text, notification_link text, read_at timestamptz,
               created_at timestamptz)
language sql security definer set search_path = '' as $$
  select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
    from public.notifications n
   where n.recipient_id = (select auth.uid())
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'تسجيل الدخول مطلوب' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
    where id = p_notification_id and recipient_id = v_user and read_at is null;
end $$;

create function public.mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'تسجيل الدخول مطلوب' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
    where recipient_id = v_user and read_at is null;
end $$;

create function public.unread_notification_count()
returns integer
language sql security definer set search_path = '' as $$
  select count(*)::int from public.notifications
   where recipient_id = (select auth.uid()) and read_at is null;
$$;

revoke all on function public.send_notification(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
revoke all on function public.unread_notification_count() from public, anon, authenticated;
grant execute on function public.send_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
