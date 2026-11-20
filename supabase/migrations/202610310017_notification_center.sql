-- NTF-003: unified Notification Center.
-- One notifications table remains the single source of truth. A generated
-- category column lets every activity reuse the same feed without a second
-- notification engine, and list_notifications gains category/unread filters
-- plus offset pagination. No notification body carries private data.

-- 1) Invitations get their own kind so the feed can classify them reliably.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('announcement','join_request','join_decision','course','session','report','system','mudarasa','share','invitation'));

-- 2) Category is derived once, in the database, for old and new rows alike.
alter table public.notifications add column if not exists category text
  generated always as (
    case
      when kind in ('join_request','join_decision','invitation') then 'invitation'
      when kind in ('course','session','mudarasa','announcement') then 'activity'
      when kind = 'share' then 'resource'
      else 'system'
    end
  ) stored;

create index if not exists notifications_recipient_category_idx
  on public.notifications(recipient_id, category, created_at desc);

-- 3) Replace the fixed list with a filtered, paginated feed. The old signature
-- (integer) is dropped because PostgreSQL cannot change a return type in place.
drop function if exists public.list_notifications(integer);

create function public.list_notifications(
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
  if p_category is not null and p_category not in ('invitation','activity','resource','system') then
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

revoke all on function public.list_notifications(integer, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.list_notifications(integer, integer, text, boolean) to authenticated;

-- 4) Study invitations and decisions are invitations, not generic mudarasa
-- activity. Replace the applied 202610310016 bodies without touching the
-- invitation table or its lifecycle.
create or replace function public.invite_study_member(p_circle_id uuid, p_username text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_invitee uuid;
  v_title text;
  v_status text;
begin
  if v_user is null then
    raise exception 'الدعوة تتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  if private.study_role(p_circle_id, array['creator','supervisor']) is null then
    raise exception 'المنشئ أو المشرف فقط يدعو الأعضاء' using errcode = '42501';
  end if;
  select title, status into v_title, v_status from public.study_circles where id = p_circle_id;
  if v_status is distinct from 'active' then
    raise exception 'المدارسة ليست نشطة فلا تصدر دعوات' using errcode = 'P0001';
  end if;
  perform private.consume_share_search(v_user);
  select p.user_id into v_invitee from public.member_share_profiles p
   where p.username = v_name and p.discoverable and p.user_id <> v_user
     and not exists (select 1 from public.member_blocks b
           where (b.blocker_id = p.user_id and b.blocked_id = v_user)
              or (b.blocker_id = v_user and b.blocked_id = p.user_id));
  if v_invitee is null then
    raise exception 'تعذّرت دعوة هذا الاسم. تأكد من اسم المستخدم.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_circle_members where circle_id = p_circle_id and user_id = v_invitee) then
    raise exception 'هذا العضو في المدارسة بالفعل' using errcode = 'P0001';
  end if;
  begin
    insert into public.study_member_invites (circle_id, invitee_id, invited_by)
    values (p_circle_id, v_invitee, v_user);
  exception when unique_violation then
    raise exception 'سبق إرسال دعوة لهذا العضو وهي بانتظار رده' using errcode = 'P0001';
  end;
  perform private.notify(v_invitee, 'invitation', 'دعوة إلى مدارسة: ' || v_title,
    'وصلتك دعوة للانضمام، افتح المدارسة لقبولها أو رفضها.', 'study');
end $$;

create or replace function public.respond_study_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.study_member_invites%rowtype;
  v_title text;
begin
  if v_user is null then
    raise exception 'الرد يتطلب تسجيل الدخول' using errcode = '42501';
  end if;
  select * into v_inv from public.study_member_invites
   where id = p_invite_id and invitee_id = v_user and status = 'pending' for update;
  if not found then
    raise exception 'الدعوة غير موجودة أو انتهت' using errcode = 'P0001';
  end if;
  select title into v_title from public.study_circles where id = v_inv.circle_id and status = 'active';
  if v_title is null then
    raise exception 'المدارسة لم تعد نشطة' using errcode = 'P0001';
  end if;
  update public.study_member_invites
     set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where id = v_inv.id;
  if p_accept then
    insert into public.study_circle_members (circle_id, user_id, role)
    values (v_inv.circle_id, v_user, 'member') on conflict (circle_id, user_id) do nothing;
  end if;
  perform private.notify(v_inv.invited_by, 'invitation',
    (case when p_accept then 'قبل دعوتك: ' else 'اعتذر عن دعوتك: ' end) || v_title,
    (case when p_accept then 'انضم عضو جديد إلى المدارسة.' else 'لم ينضم العضو هذه المرة.' end), 'study');
end $$;

revoke all on function public.invite_study_member(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_study_invite(uuid, boolean) from public, anon, authenticated;
grant execute on function public.invite_study_member(uuid, text) to authenticated;
grant execute on function public.respond_study_invite(uuid, boolean) to authenticated;
