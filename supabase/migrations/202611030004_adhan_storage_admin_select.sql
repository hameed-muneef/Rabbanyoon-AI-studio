-- Storage API deletes need SELECT visibility on the object, otherwise remove() silently deletes nothing.
drop policy if exists "Admins read adhan audio" on storage.objects;
create policy "Admins read adhan audio" on storage.objects for select to authenticated
  using (bucket_id = 'adhan-audio' and (select public.is_admin()));
