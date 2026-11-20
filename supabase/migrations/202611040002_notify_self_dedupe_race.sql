-- Serialize self-notification dedupe per user so two tabs cannot both insert
-- the same notification during the check-then-insert window.
create or replace function public.notify_self(
  p_kind text, p_title text, p_body text default '', p_link text default ''
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_existing uuid;
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

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select id into v_existing
    from public.notifications
   where recipient_id = v_user
     and kind = p_kind
     and title = btrim(p_title)
     and created_at > now() - interval '5 minutes'
   order by created_at desc
   limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.notifications (recipient_id, kind, title, body, link)
    values (v_user, p_kind, btrim(p_title), coalesce(p_body, ''), coalesce(p_link, ''))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.notify_self(text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_self(text, text, text, text) to authenticated;
