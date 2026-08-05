-- Type adapter only: preserve the existing deadline formula while allowing the
-- scheduler to consume the live attendance.check_in_time timestamptz column.
create or replace function public.attendance_legacy_auto_checkout_deadline(row_check_in timestamptz)
returns timestamp
language sql
immutable
set search_path = public
as $$
  select public.attendance_legacy_auto_checkout_deadline(row_check_in at time zone 'UTC');
$$;
