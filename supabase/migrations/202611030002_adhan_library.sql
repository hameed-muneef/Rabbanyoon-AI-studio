-- مكتبة الأذان تُدار من لوحة الإدارة فقط: رفع تسجيلات الأذان بعد تأكد المدير من ترخيصها.
-- يُحذف الصفّان الوهميان بعنوان about:blank لأنهما لا يشيران إلى أي ملف صوتي.

delete from public.audio_resources where url = 'about:blank';

alter table public.audio_resources
  add column if not exists storage_path text,
  add column if not exists license_note text,
  add column if not exists is_active boolean not null default true;

alter table public.audio_resources drop constraint if exists audio_resources_url_https;
alter table public.audio_resources add constraint audio_resources_url_https check (url ~ '^https://');
alter table public.audio_resources drop constraint if exists audio_resources_adhan_license;
alter table public.audio_resources add constraint audio_resources_adhan_license
  check (kind <> 'adhan' or char_length(btrim(coalesce(license_note, ''))) >= 3);

drop policy if exists audio_resources_select_all on public.audio_resources;
drop policy if exists audio_resources_own_insert on public.audio_resources;
drop policy if exists audio_resources_own_delete on public.audio_resources;

-- الصوت المرفوع من المستخدم (custom) خاص به حتى عن المدير؛ غيره مرئي لكل مسجَّل إن كان مفعّلًا، والموقوف للمدير فقط.
create policy audio_resources_read on public.audio_resources for select to authenticated
  using (
    (kind = 'custom' and uploader_id = (select auth.uid()))
    or (kind <> 'custom' and (is_active or (select public.is_admin())))
  );
create policy audio_resources_admin_insert on public.audio_resources for insert to authenticated
  with check ((select public.is_admin()) and kind in ('adhan', 'tone') and uploader_id = (select auth.uid()));
create policy audio_resources_admin_update on public.audio_resources for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()) and kind in ('adhan', 'tone'));
create policy audio_resources_admin_delete on public.audio_resources for delete to authenticated
  using ((select public.is_admin()) and kind in ('adhan', 'tone'));
create policy audio_resources_own_custom_insert on public.audio_resources for insert to authenticated
  with check (kind = 'custom' and uploader_id = (select auth.uid()));
create policy audio_resources_own_custom_delete on public.audio_resources for delete to authenticated
  using (kind = 'custom' and uploader_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adhan-audio', 'adhan-audio', true, 10485760, array['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload adhan audio" on storage.objects;
create policy "Admins upload adhan audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'adhan-audio' and (select public.is_admin()));
drop policy if exists "Admins delete adhan audio" on storage.objects;
create policy "Admins delete adhan audio" on storage.objects for delete to authenticated
  using (bucket_id = 'adhan-audio' and (select public.is_admin()));
