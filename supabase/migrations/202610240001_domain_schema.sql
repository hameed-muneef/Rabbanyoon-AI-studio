-- Additive relational foundation. Existing JSON sync remains authoritative until
-- the client is migrated; see DATABASE.md. Requires the three legacy migrations.
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Africa/Cairo',
  locale text not null default 'ar',
  city text,
  work_start time,
  sleep_time time,
  prayer_settings jsonb not null default '{}' check (jsonb_typeof(prayer_settings) = 'object'),
  notification_preferences jsonb not null default '{}' check (jsonb_typeof(notification_preferences) = 'object'),
  updated_at timestamptz not null default now()
);

-- Text IDs preserve existing client IDs (including seed IDs such as d1).
-- Every private child FK includes user_id: references cannot cross accounts.
create table public.goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (length(trim(title)) > 0),
  benefit text not null default '',
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.goal_actions (
  user_id uuid not null,
  id text not null,
  goal_id text not null,
  title text not null check (length(trim(title)) > 0),
  period text not null check (period in ('daily','weekly','monthly','yearly')),
  position integer not null default 0 check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete cascade
);
create index goal_actions_goal_idx on public.goal_actions(user_id, goal_id);
create table public.goal_progress_entries (
  user_id uuid not null,
  action_id text not null,
  period_key text not null check (length(period_key) > 0),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, action_id, period_key),
  foreign key (user_id, action_id) references public.goal_actions(user_id, id) on delete cascade
);
create table public.planner_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (length(trim(title)) > 0),
  period text not null check (period in ('daily','weekly','monthly','yearly')),
  optional boolean not null default true,
  done boolean not null default false,
  goal_action_id text,
  slot text,
  timing_anchor text,
  offset_minutes integer not null default 0,
  duration_minutes integer check (duration_minutes >= 0),
  position integer not null default 0 check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, goal_action_id) references public.goal_actions(user_id, id)
);
create index planner_items_action_idx on public.planner_items(user_id, goal_action_id);
create table public.day_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  opening_message text,
  resolve_message text,
  gratitude text,
  improvement text,
  review_saved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
-- Historical snapshots survive template edits/deletion. No FK to planner_items.
create table public.activity_logs (
  user_id uuid not null,
  date date not null,
  id text not null,
  title text not null,
  period_label text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  status text not null default 'pending' check (status in ('pending','done','deferred')),
  updated_at timestamptz not null default now(),
  primary key (user_id, date, id),
  foreign key (user_id, date) references public.day_records(user_id, date) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create table public.reflections (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  period text not null default 'daily' check (period in ('daily','weekly','monthly')),
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index reflections_date_idx on public.reflections(user_id, date desc);

create table public.adhkar_catalog (
  id text primary key,
  title text not null,
  body text not null,
  source_reference text not null,
  prescribed_count integer check (prescribed_count > 0),
  prescribed_context text,
  status text not null default 'draft' check (status in ('draft','review','approved','published')),
  updated_at timestamptz not null default now()
);
create table public.user_wirds (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  catalog_id text references public.adhkar_catalog(id),
  title text not null check (length(trim(title)) > 0),
  target integer not null check (target > 0),
  period text not null check (period in ('daily','weekly','monthly')),
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index user_wirds_catalog_idx on public.user_wirds(catalog_id);
-- One corrected total per period, matching the application's editable counter.
create table public.wird_period_totals (
  user_id uuid not null,
  wird_id text not null,
  period_key text not null check (length(period_key) > 0),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, wird_id, period_key),
  foreign key (user_id, wird_id) references public.user_wirds(user_id, id) on delete cascade
);

-- Editorial tables are admin-only for now. A future gated read API must expose
-- published, unlocked units; granting all members SELECT would bypass gating.
create table public.learning_paths (
  id text primary key,
  title text not null,
  position integer not null default 0 check (position >= 0),
  updated_at timestamptz not null default now()
);
create table public.learning_units (
  id text primary key,
  path_id text not null references public.learning_paths(id),
  position integer not null check (position >= 0),
  title text not null,
  focus text,
  summary text not null,
  status text not null default 'draft' check (status in ('draft','review','approved','published')),
  revision integer not null default 1 check (revision > 0),
  reviewer text not null default '',
  review_note text not null default '',
  updated_at timestamptz not null default now(),
  unique (path_id, position),
  check (status not in ('approved','published') or (length(trim(reviewer)) > 0 and length(trim(review_note)) > 0))
);
create table public.learning_stations (
  unit_id text not null references public.learning_units(id) on delete cascade,
  position integer not null check (position between 0 and 6),
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (unit_id, position)
);
create table public.learning_resources (
  unit_id text not null references public.learning_units(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('source','book','video')),
  title text not null,
  author text not null,
  source_reference text not null,
  url text not null,
  level text not null check (level in ('basic','extra')),
  license_note text,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id)
);
create table public.station_resources (
  unit_id text not null,
  station_position integer not null,
  resource_id text not null,
  primary key (unit_id, station_position, resource_id),
  foreign key (unit_id, station_position) references public.learning_stations(unit_id, position) on delete cascade,
  foreign key (unit_id, resource_id) references public.learning_resources(unit_id, id) on delete cascade
);
create index station_resources_resource_idx on public.station_resources(unit_id, resource_id);
create table public.user_learning_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id text not null references public.learning_units(id) on delete cascade,
  revision integer not null check (revision > 0),
  completed_stations integer not null default 0 check (completed_stations between 0 and 7),
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);
create index user_learning_progress_unit_idx on public.user_learning_progress(unit_id);
create table public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  page integer not null check (page > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- Explicit grants override Supabase's permissive default table grants.
do $$
declare t text;
begin
  foreach t in array array['user_preferences','goals','goal_actions','goal_progress_entries',
    'planner_items','day_records','activity_logs','reflections','user_wirds',
    'wird_period_totals','reading_progress'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
  -- Progress is written by a trusted future completion endpoint, never directly
  -- by a browser. Otherwise clients could unlock future units by forging it.
  alter table public.user_learning_progress enable row level security;
  revoke all on public.user_learning_progress from public, anon, authenticated;
  grant select on public.user_learning_progress to authenticated;
  grant select, insert, update, delete on public.user_learning_progress to service_role;
  create policy owner_select on public.user_learning_progress for select to authenticated
    using ((select auth.uid()) = user_id);

  foreach t in array array['learning_paths','learning_units','learning_stations',
    'learning_resources','station_resources','adhkar_catalog'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('create policy admin_select on public.%I for select to authenticated using ((select public.is_admin()))', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;

  foreach t in array array['user_preferences','goals','goal_actions','goal_progress_entries',
    'planner_items','day_records','activity_logs','reflections','user_wirds','wird_period_totals',
    'learning_paths','learning_units','learning_stations','learning_resources',
    'user_learning_progress','reading_progress','adhkar_catalog','user_data','platform_curriculum'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;
create policy members_read_published_adhkar on public.adhkar_catalog for select
  to authenticated using (status = 'published');
