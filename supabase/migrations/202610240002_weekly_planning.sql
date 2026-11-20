-- The running JSON sync preserves these optional fields without a backfill.
-- Keep the relational destination aligned for the future client cutover.
alter table public.planner_items
  add column week_start date,
  add column scheduled_date date,
  add constraint planner_week_start_monday check (
    week_start is null or (period = 'weekly' and extract(isodow from week_start) = 1)
  ),
  add constraint planner_scheduled_day_in_week check (
    scheduled_date is null or (week_start is not null and scheduled_date >= week_start and scheduled_date < week_start + 7)
  );
create index planner_items_week_idx on public.planner_items(user_id, week_start)
  where week_start is not null;
create index planner_items_date_idx on public.planner_items(user_id, scheduled_date)
  where scheduled_date is not null;
