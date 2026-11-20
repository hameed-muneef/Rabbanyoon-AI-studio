create function public.load_my_user_state()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select (d.payload - 'curriculum') || jsonb_build_object(
    'curriculumProgress',coalesce(
      d.payload->'curriculumProgress',
      d.payload#>'{curriculum,progress}',
      '{}'::jsonb
    )
  )
  from public.user_data d
  where d.user_id=(select auth.uid());
$$;

revoke all on function public.load_my_user_state() from public,anon,authenticated;
grant execute on function public.load_my_user_state() to authenticated;