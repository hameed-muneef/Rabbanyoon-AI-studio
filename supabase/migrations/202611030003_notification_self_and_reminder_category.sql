-- Notification centre: reminders/prayer category + a safe way to notify oneself.
-- 1) send_notification requires a recipient, so engine-generated reminders were
--    silently rejected. notify_self lets a user record only their own
--    prayer/reminder/worship/goal/task notifications, with a rate limit.
-- 2) The generated category gains 'reminder' for those kinds so the centre can
--    filter them. A generated column cannot be altered, so it is recreated.

alter table public.notifications drop column if exists category;
alter table public.notifications add column category text
  generated always as (
    case
      when kind in ('join_request','join_decision','invitation') then 'invitation'
      when kind in ('course','session','mudarasa','announcement') then 'activity'
      when kind = 'share' then 'resource'
      when kind in ('prayer','reminder','worship','goal','task') then 'reminder'
      else 'system'
    end
  ) stored;

create index if not exists notifications_recipient_category_idx
  on public.notifications(recipient_id, category, created_at desc);

create or replace function public.list_notifications(
  p_limit integer default 30,
  p_offset integer default 0,
  p_category text default null,
  p_unread_only boolean default false
)
returns table (
  notification_id uuid,
  notification_kind text,
  notification_title text,
  notification_body text,
  notification_link text,
  notification_category text,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  if p_category is not null and p_category not in ('invitation','activity','resource','reminder','system') then
    raise exception 'تصنيف الإشعارات غير صالح' using errcode = '22023';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.link, n.category, n.read_at, n.created_at
      from public.notifications n
     where n.recipient_id = v_user
       and (p_category is null or n.category = p_category)
       and (not coalesce(p_unread_only, false) or n.read_at is null)
     order by n.created_at desc, n.id desc
     limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.notify_self(
  p_kind text, p_title text, p_body text default '', p_link text default ''
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'تسجيل الدخول مطلوب' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('prayer','reminder','worship','goal','task') then
    raise exception 'نوع الإشعار غير صالح' using errcode = '22023';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'عنوان الإشعار يجب أن يكون بين 1 و200 حرف' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 2000 or char_length(coalesce(p_link, '')) > 500 then
    raise exception 'محتوى الإشعار تجاوز الحد' using errcode = '22023';
  end if;
  if (select count(*) from public.notifications
       where recipient_id = v_user and created_at > now() - interval '1 hour'
         and kind in ('prayer','reminder','worship','goal','task')) >= 120 then
    raise exception 'تجاوزت حد الإشعارات الذاتية في الساعة' using errcode = 'P0001';
  end if;
  insert into public.notifications (recipient_id, kind, title, body, link)
    values (v_user, p_kind, btrim(p_title), coalesce(p_body, ''), coalesce(p_link, ''))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.notify_self(text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_self(text, text, text, text) to authenticated;
