-- Forward-only repair: no historical rows are updated, deleted, or backfilled.
-- Reinstalls the previously undeployed timeline guards/observers. Attendance
-- deadlines, geofences, overtime, and notifications are untouched.
-- Timeline data must never outlive the attendance session it belongs to.
-- This does not change any attendance deadline or auto-checkout calculation.
create or replace function public.enforce_location_timeline_attendance_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attendance_row public.attendance%rowtype;
  expected_terminal text;
begin
  -- The row lock serializes terminal insertion for one attendance, so a late
  -- manual checkout cannot race an auto-checkout terminal into the timeline.
  select * into attendance_row
  from public.attendance
  where id = new.attendance_id
    and employee_id = new.employee_id
  for update;

  if not found then
    raise exception 'Location timeline event must belong to its employee attendance session';
  end if;

  if new.event_time < attendance_row.check_in_time then
    raise exception 'Location timeline event precedes its attendance check-in';
  end if;

  if new.event_type in ('check_out', 'auto_checkout') then
    expected_terminal := case when attendance_row.checkout_type = 'auto_checkout' then 'auto_checkout' else 'check_out' end;
    if attendance_row.check_out_time is null
       or new.event_time <> attendance_row.check_out_time
       or new.event_type <> expected_terminal then
      raise exception 'Timeline terminal must match the actual attendance checkout';
    end if;
    if exists (
      select 1 from public.location_timeline existing
      where existing.attendance_id = new.attendance_id
        and existing.event_type in ('check_out', 'auto_checkout')
    ) then
      return null; -- Idempotent acknowledgement; retain exactly one terminal.
    end if;
  elsif attendance_row.check_out_time is not null
        and new.event_time > attendance_row.check_out_time then
    raise exception 'Location timeline event is after its attendance checkout';
  end if;

  return new;
end;
$$;

drop trigger if exists location_timeline_enforce_attendance_boundary on public.location_timeline;
create trigger location_timeline_enforce_attendance_boundary
before insert on public.location_timeline
for each row execute function public.enforce_location_timeline_attendance_boundary();

-- Preserve the existing attendance observer, but terminal rows deliberately
-- contain no location label. They are session boundaries, not locations.
create or replace function public.capture_auto_checkout_timeline_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.checkout_type = 'auto_checkout' and old.check_out_time is null and new.check_out_time is not null then
    begin
      insert into public.location_timeline (employee_id, attendance_id, event_time, location_name, site_id, event_type, idempotency_key)
      values (new.employee_id, new.id, new.check_out_time, '', null, 'auto_checkout', 'auto-checkout:' || new.id::text)
      on conflict (idempotency_key) do nothing;
    exception when others then
      raise warning '[LocationTimeline] auto_checkout failed employee=% attendance=% gps=% code=% error=%', new.employee_id, new.id, new.check_out_time, SQLSTATE, SQLERRM;
    end;
  end if;
  return new;
end $$;

-- Capture attendance boundaries on the server so timeline history does not
-- depend on a foreground app callback succeeding. Attendance logic itself is
-- unchanged: these observers only copy its already-recorded timestamps.
create or replace function public.capture_attendance_check_in_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.location_timeline (
    employee_id, attendance_id, event_time, latitude, longitude,
    location_name, site_id, event_type, idempotency_key
  ) values (
    new.employee_id, new.id, new.check_in_time, new.check_in_latitude,
    new.check_in_longitude, coalesce(new.check_in_location_name, 'Unknown location'),
    new.site_id, 'check_in', 'attendance-check-in:' || new.id::text
  ) on conflict (idempotency_key) do nothing;
  return new;
exception when others then
  raise warning '[LocationTimeline] attendance boundary failed employee=% attendance=% code=% error=%', new.employee_id, new.id, SQLSTATE, SQLERRM;
  return new;
end;
$$;

create or replace function public.capture_manual_checkout_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.check_out_time is null
     and new.check_out_time is not null
     and coalesce(new.checkout_type, 'manual_checkout') <> 'auto_checkout' then
    insert into public.location_timeline (
      employee_id, attendance_id, event_time, location_name, site_id,
      event_type, idempotency_key
    ) values (
      new.employee_id, new.id, new.check_out_time, '', null,
      'check_out', 'manual-checkout:' || new.id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
exception when others then
  raise warning '[LocationTimeline] attendance boundary failed employee=% attendance=% code=% error=%', new.employee_id, new.id, SQLSTATE, SQLERRM;
  return new;
end;
$$;

drop trigger if exists location_timeline_after_attendance_check_in on public.attendance;
create trigger location_timeline_after_attendance_check_in
after insert on public.attendance
for each row execute function public.capture_attendance_check_in_timeline_event();

drop trigger if exists location_timeline_after_manual_checkout on public.attendance;
create trigger location_timeline_after_manual_checkout
after update of check_out_time, checkout_type on public.attendance
for each row execute function public.capture_manual_checkout_timeline_event();
