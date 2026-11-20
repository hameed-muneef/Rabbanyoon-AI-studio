-- Durable queue: metadata commits first; actual bytes are deleted via Storage API.
-- Never delete storage.objects directly in SQL (that leaves orphaned bytes).
create table public.resource_cleanup (
  storage_path text primary key check (storage_path ~ '^[0-9a-fA-F-]{36}\.pdf$'),
  created_at timestamptz not null default now()
);
alter table public.resource_cleanup enable row level security;
revoke all on public.resource_cleanup from public, anon, authenticated;
grant select, delete on public.resource_cleanup to authenticated;
grant select, insert, update, delete on public.resource_cleanup to service_role;
create policy admins_read_cleanup on public.resource_cleanup for select to authenticated
  using ((select public.is_admin()));
create policy admins_ack_cleanup on public.resource_cleanup for delete to authenticated
  using ((select public.is_admin()));

create function private.curriculum_book_paths(document jsonb)
returns table(path text) language sql immutable set search_path = '' as $$
  select distinct substring(value #>> '{}' from '/storage/v1/object/public/journey-books/([0-9a-fA-F-]{36}\.pdf)(?:[?#].*)?$')
  from jsonb_path_query(document, '$.**.url') value
  where jsonb_typeof(value) = 'string';
$$;
revoke all on function private.curriculum_book_paths(jsonb) from public, anon, authenticated;

create function private.queue_removed_books()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.resource_cleanup(storage_path)
    select path from private.curriculum_book_paths(old.payload) where path is not null
    except select path from private.curriculum_book_paths(new.payload)
    on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.queue_removed_books() from public, anon, authenticated;
create trigger queue_removed_curriculum_books after update of payload on public.platform_curriculum
  for each row execute function private.queue_removed_books();

-- Guard Storage API deletions using current persisted references, including the
-- archive and relational resources. Non-admin callers never get a positive result.
create function public.can_delete_journey_book(object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and object_path ~ '^[0-9a-fA-F-]{36}\.pdf$'
    and not exists (
      select 1 from public.platform_curriculum c,
        lateral private.curriculum_book_paths(c.payload) p where p.path = object_path
    ) and not exists (
      select 1 from public.learning_resources r
      where substring(r.url from '/storage/v1/object/public/journey-books/([0-9a-fA-F-]{36}\.pdf)(?:[?#].*)?$') = object_path
    );
$$;
revoke all on function public.can_delete_journey_book(text) from public, anon;
grant execute on function public.can_delete_journey_book(text) to authenticated;

create policy "Admins inspect journey books" on storage.objects for select to authenticated
  using (bucket_id = 'journey-books' and (select public.is_admin()));
create policy "Admins delete unused journey books" on storage.objects for delete to authenticated
  using (bucket_id = 'journey-books' and public.can_delete_journey_book(name));
