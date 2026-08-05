-- Targeted repair for Gagan Jha (employees.id = 34). No other employee is affected.
create or replace function public.queue_gagan_auto_checkout_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_token text;
  request_id bigint;
begin
  if new.employee_id <> 34
     or new.checkout_type <> 'auto_checkout'
     or old.check_out_time is not null
     or new.check_out_time is null then
    return new;
  end if;

  if not exists (
    select 1 from employees e
    where e.id = 34
      and upper(trim(e.first_name)) = 'GAGAN'
      and upper(trim(e.last_name)) = 'JHA'
  ) then
    return new;
  end if;

  select nt.token into target_token
  from notification_tokens nt
  where nt.employee_id = 34 and nt.is_active = true
  order by nt.updated_at desc, nt.id desc
  limit 1;

  if target_token is null then
    insert into notification_delivery_logs (
      channel, recipient_type, recipient_id, notification_type,
      title, message, token_count, status, details
    ) values (
      'employee_auto_checkout', 'employee', 34, 'alert',
      'Auto checkout completed', 'You have been automatically checked out.',
      0, 'skipped',
      jsonb_build_object('reason', 'no_active_token', 'attendance_id', new.id)
    );
    return new;
  end if;

  request_id := net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', target_token,
      'title', 'Auto checkout completed',
      'body', 'You have been automatically checked out.',
      'sound', 'default',
      'channelId', 'alerts',
      'data', jsonb_build_object(
        'type', 'alert',
        'notificationKind', 'checkout_success',
        'event', 'auto_checkout',
        'employeeId', 34,
        'attendanceId', new.id,
        'checkOutTime', new.check_out_time
      )
    )
  );

  insert into notification_delivery_logs (
    channel, recipient_type, recipient_id, notification_type,
    title, message, token_count, provider_request_id, status, details
  ) values (
    'employee_auto_checkout', 'employee', 34, 'alert',
    'Auto checkout completed', 'You have been automatically checked out.',
    1, request_id, 'queued',
    jsonb_build_object('attendance_id', new.id, 'check_out_time', new.check_out_time)
  );

  update notification_tokens
  set last_sent_at = now(), last_error = null, updated_at = now()
  where token = target_token;

  return new;
exception
  when others then
    insert into notification_delivery_logs (
      channel, recipient_type, recipient_id, notification_type,
      title, message, token_count, status, details
    ) values (
      'employee_auto_checkout', 'employee', 34, 'alert',
      'Auto checkout completed', 'You have been automatically checked out.',
      case when target_token is null then 0 else 1 end, 'error',
      jsonb_build_object('attendance_id', new.id, 'error', sqlerrm)
    );
    return new;
end;
$$;

drop trigger if exists trg_queue_gagan_auto_checkout_push on attendance;
create trigger trg_queue_gagan_auto_checkout_push
after update of check_out_time, checkout_type on attendance
for each row execute function public.queue_gagan_auto_checkout_push();
