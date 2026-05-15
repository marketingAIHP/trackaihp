do $$
begin
  create extension if not exists pg_cron;
exception
  when others then null;
end $$;

create or replace function attendance_legacy_auto_checkout_deadline(row_check_in timestamp)
returns timestamp
language sql
immutable
as $$
  select least(
    row_check_in + interval '9 hours',
    (
      (
        date_trunc(
          'day',
          ((row_check_in at time zone 'UTC') at time zone 'Asia/Kolkata')
        ) + interval '1 day'
      ) at time zone 'Asia/Kolkata'
    ) at time zone 'UTC'
  );
$$;

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
    returning a.id, due.employee_id
  ),
  cleared as (
    delete from location_tracking
    where employee_id in (
      select distinct employee_id
      from updated
    )
    returning employee_id
  )
  select count(*) into updated_count from updated;

  return updated_count;
end;
$$;

grant execute on function auto_checkout_due_attendance(timestamptz) to anon, authenticated;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        admin_id,
        type,
        coalesce(metadata->>'attendance_id', ''),
        coalesce(metadata->>'event', '')
      order by created_at desc, id desc
    ) as rn
  from notifications
  where
    (
      type in ('checkin', 'checkout')
      and metadata ? 'attendance_id'
    )
    or (
      type = 'alert'
      and metadata ? 'attendance_id'
      and coalesce(metadata->>'event', '') = 'geofence_exit'
    )
)
delete from notifications n
using ranked r
where n.id = r.id
  and r.rn > 1;

create unique index if not exists idx_notifications_unique_attendance_event
on notifications (
  admin_id,
  type,
  coalesce(metadata->>'attendance_id', ''),
  coalesce(metadata->>'event', '')
)
where
  (
    type in ('checkin', 'checkout')
    and metadata ? 'attendance_id'
  )
  or (
    type = 'alert'
    and metadata ? 'attendance_id'
    and coalesce(metadata->>'event', '') = 'geofence_exit'
  );

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'attendance-auto-checkout') then
      perform cron.unschedule('attendance-auto-checkout');
    end if;

    perform cron.schedule(
      'attendance-auto-checkout',
      '* * * * *',
      'select public.auto_checkout_due_attendance(now());'
    );
  end if;
exception
  when others then null;
end $$;
