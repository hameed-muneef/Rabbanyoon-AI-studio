insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journey-books', 'journey-books', true, 52428800, array['application/pdf'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload journey books" on storage.objects;
create policy "Admins upload journey books" on storage.objects
for insert to authenticated
with check (bucket_id = 'journey-books' and (select public.is_admin()));
