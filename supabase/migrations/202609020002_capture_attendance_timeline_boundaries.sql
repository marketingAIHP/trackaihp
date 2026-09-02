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
