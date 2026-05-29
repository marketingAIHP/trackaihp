create or replace function auto_checkout_due_attendance(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer := 0;
  reference_utc timestamp := reference_time at time zone 'UTC';
begin
  with due as (
    select
      id,
      employee_id,
      check_in_time,
      check_in_latitude,
      check_in_longitude,
      check_in_location_name,
      attendance_legacy_auto_checkout_deadline(check_in_time) as deadline
    from attendance
    where check_out_time is null
      and attendance_legacy_auto_checkout_deadline(check_in_time) <= reference_utc
    for update skip locked
  ),
  updated as (
    update attendance a
    set
      check_out_time = due.deadline,
      check_out_latitude = coalesce(a.check_out_latitude, due.check_in_latitude),
      check_out_longitude = coalesce(a.check_out_longitude, due.check_in_longitude),
      check_out_location_name = coalesce(a.check_out_location_name, due.check_in_location_name, 'Auto checkout'),
      checkout_type = 'auto_checkout'
    from due
    where a.id = due.id
      and a.check_out_time is null
    returning
      a.id,
      a.employee_id,
      a.site_id,
      a.check_out_time,
      a.check_out_location_name
  ),
  cleared as (
    delete from location_tracking
    where employee_id in (
      select distinct employee_id
      from updated
    )
    returning employee_id
  ),
  notified as (
    insert into notifications (
      admin_id,
      type,
      title,
      message,
      metadata,
      is_read
    )
    select
      e.admin_id,
      'checkout',
      'Employee Auto Checked Out',
      coalesce(nullif(trim(concat(e.first_name, ' ', e.last_name)), ''), 'Employee') || ' was auto checked out from ' || coalesce(ws.name, u.check_out_location_name, 'Remote Work'),
      jsonb_build_object(
        'employee_id', u.employee_id,
        'attendance_id', u.id,
        'site_id', u.site_id,
        'check_out_time', u.check_out_time,
        'check_out_location_name', u.check_out_location_name,
        'checkout_type', 'auto_checkout',
        'event', 'auto_checkout'
      ),
      false
    from updated u
    join employees e on e.id = u.employee_id
    left join work_sites ws on ws.id = u.site_id
    where e.admin_id is not null
    on conflict do nothing
    returning id
  )
  select count(*) into updated_count from updated;

  return updated_count;
end;
$$;

grant execute on function auto_checkout_due_attendance(timestamptz) to anon, authenticated;
