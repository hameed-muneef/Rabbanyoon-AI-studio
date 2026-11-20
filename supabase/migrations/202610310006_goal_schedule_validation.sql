-- Validate custom goal-step dates at the JSON persistence boundary. Existing goal
-- state stays backward compatible; only explicit custom dates are constrained.
create or replace function public.is_valid_goal_iso_date(p_date text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return to_char(to_date(p_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = p_date;
exception when others then
  return false;
end;
$$;

create or replace function public.validate_user_goal_schedule_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_goal jsonb;
  v_step jsonb;
  v_start text;
  v_end text;
  v_custom text;
begin
  if jsonb_typeof(new.payload->'goals') is distinct from 'array' then
    return new;
  end if;
  for v_goal in select value from jsonb_array_elements(new.payload->'goals') loop
    v_start := nullif(v_goal->>'createdAt', '');
    v_end := nullif(v_goal->>'targetDate', '');
    if v_start is not null and not public.is_valid_goal_iso_date(v_start) then
      raise exception 'تاريخ بدء الهدف غير صالح' using errcode = '22023';
    end if;
    if v_end is not null and not public.is_valid_goal_iso_date(v_end) then
      raise exception 'تاريخ انتهاء الهدف غير صالح' using errcode = '22023';
    end if;
    if v_start is not null and v_end is not null and v_start > v_end then
      raise exception 'تاريخ بدء الهدف بعد تاريخ انتهائه' using errcode = '22023';
    end if;
    if jsonb_typeof(v_goal->'steps') is distinct from 'array' then
      continue;
    end if;
    for v_step in select value from jsonb_array_elements(v_goal->'steps') loop
      if v_step->>'period' is distinct from 'custom' then
        continue;
      end if;
      v_custom := coalesce(v_step->>'customDate', '');
      if v_custom !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'تاريخ تنفيذ الخطوة غير صالح' using errcode = '22023';
      end if;
      begin
        if to_char(to_date(v_custom, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_custom then
          raise exception 'تاريخ تنفيذ الخطوة غير صالح' using errcode = '22023';
        end if;
      exception when others then
        raise exception 'تاريخ تنفيذ الخطوة غير صالح' using errcode = '22023';
      end;
      if v_start is not null and v_custom < v_start then
        raise exception 'لا يمكن تحديد موعد قبل تاريخ بدء الهدف' using errcode = '22023';
      end if;
      if v_end is not null and v_custom > v_end then
        raise exception 'يجب أن يكون موعد تنفيذ الخطوة قبل أو في تاريخ انتهاء الهدف' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_user_goal_schedule_dates on public.user_data;
create trigger validate_user_goal_schedule_dates
before insert or update of payload on public.user_data
for each row execute function public.validate_user_goal_schedule_dates();

