create or replace function public.send_daily_checkin_reminders(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_date date := (reference_time at time zone 'Asia/Kolkata')::date;
  payload jsonb := '[]'::jsonb;
  token_count integer := 0;
  employee_ids bigint[];
  request_id bigint;
  token_employee_ids bigint[] := '{}'::bigint[];
  checked_in_employee_ids bigint[] := '{}'::bigint[];
  skip_reason text := 'no_eligible_tokens';
begin
  with token_holders as (
    select distinct
      e.id as employee_id
    from employees e
    join notification_tokens nt
      on nt.employee_id = e.id
     and nt.is_active = true
    where e.is_active = true
  ),
  already_checked_in as (
    select distinct
      e.id as employee_id
    from employees e
    join notification_tokens nt
      on nt.employee_id = e.id
     and nt.is_active = true
    join attendance a
      on a.employee_id = e.id
    where e.is_active = true
      and ((a.check_in_time at time zone 'UTC') at time zone 'Asia/Kolkata')::date = reminder_date
  ),
  targets as (
    select distinct
      e.id as employee_id,
      nt.token
    from employees e
    join notification_tokens nt
      on nt.employee_id = e.id
     and nt.is_active = true
    where e.is_active = true
      and not exists (
        select 1
        from attendance a
        where a.employee_id = e.id
          and ((a.check_in_time at time zone 'UTC') at time zone 'Asia/Kolkata')::date = reminder_date
      )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'to', token,
          'title', 'Attendance Reminder',
          'body', 'Please check in today.',
          'sound', 'default',
          'channelId', 'attendance-reminders',
          'data', jsonb_build_object(
            'type', 'system',
            'notificationKind', 'daily_checkin_reminder',
            'reminderDate', reminder_date::text
          )
        )
      ),
      '[]'::jsonb
    ),
    count(*),
    coalesce(array_agg(employee_id), '{}'::bigint[]),
    coalesce((select array_agg(employee_id) from token_holders), '{}'::bigint[]),
    coalesce((select array_agg(employee_id) from already_checked_in), '{}'::bigint[])
  into payload, token_count, employee_ids, token_employee_ids, checked_in_employee_ids
  from targets;

  if array_length(token_employee_ids, 1) is null then
    skip_reason := 'no_active_tokens';
  elsif token_count = 0 and array_length(checked_in_employee_ids, 1) is not null then
    skip_reason := 'all_token_holders_already_checked_in';
  end if;

  if token_count = 0 then
    insert into notification_delivery_logs (
      channel,
      recipient_type,
      notification_type,
      title,
      message,
      token_count,
      status,
      details
    ) values (
      'employee_checkin_reminder',
      'employee',
      'system',
      'Attendance Reminder',
      'Please check in today.',
      0,
      'skipped',
      jsonb_build_object(
        'reason', skip_reason,
        'reminder_date', reminder_date::text,
        'token_employee_ids', to_jsonb(token_employee_ids),
        'checked_in_employee_ids', to_jsonb(checked_in_employee_ids),
        'eligible_employee_ids', to_jsonb(employee_ids)
      )
    );

    return 0;
  end if;

  request_id := net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
    body := payload
  );

  insert into notification_delivery_logs (
    channel,
    recipient_type,
    notification_type,
    title,
    message,
    token_count,
    provider_request_id,
    status,
    details
  ) values (
    'employee_checkin_reminder',
    'employee',
    'system',
    'Attendance Reminder',
    'Please check in today.',
    token_count,
    request_id,
    'queued',
    jsonb_build_object(
      'reminder_date', reminder_date::text,
      'employee_ids', to_jsonb(employee_ids),
      'token_employee_ids', to_jsonb(token_employee_ids),
      'checked_in_employee_ids', to_jsonb(checked_in_employee_ids)
    )
  );

  update notification_tokens
  set
    last_sent_at = now(),
    last_error = null,
    updated_at = now()
  where employee_id = any(employee_ids)
    and is_active = true;

  return token_count;
exception
  when others then
    insert into notification_delivery_logs (
      channel,
      recipient_type,
      notification_type,
      title,
      message,
      token_count,
      status,
      details
    ) values (
      'employee_checkin_reminder',
      'employee',
      'system',
      'Attendance Reminder',
      'Please check in today.',
      token_count,
      'error',
      jsonb_build_object(
        'reminder_date', reminder_date::text,
        'error', sqlerrm,
        'token_employee_ids', to_jsonb(token_employee_ids),
        'checked_in_employee_ids', to_jsonb(checked_in_employee_ids),
        'eligible_employee_ids', to_jsonb(employee_ids)
      )
    );

    return 0;
end;
$$;
