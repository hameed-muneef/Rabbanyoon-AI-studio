-- Match optional Task.monthKey (YYYY-MM) in the current JSON client.
alter table public.planner_items
  add column month_start date,
  drop constraint planner_scheduled_day_in_week,
  add constraint planner_month_start_first check (
    month_start is null or (period = 'monthly' and extract(day from month_start) = 1)
  ),
  add constraint planner_scheduled_day_in_period check (
    scheduled_date is null or
    (week_start is not null and scheduled_date >= week_start and scheduled_date < week_start + 7) or
    (month_start is not null and scheduled_date >= month_start and scheduled_date < month_start + interval '1 month')
  );
create index planner_items_month_idx on public.planner_items(user_id, month_start)
  where month_start is not null;
