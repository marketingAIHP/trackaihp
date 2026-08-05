-- Backend-only notification delivery repair. Attendance/geofence calculations are unchanged.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Keep the existing notification-row -> Expo push behavior, scoped to the row's admin,
-- and restore delivery audit rows removed by the July 23 function replacement.
create or replace function public.queue_admin_push_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  payload jsonb := '[]'::jsonb;
  token_count integer := 0;
  request_id bigint;
begin
  if new.admin_id is null then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'to', token, 'title', new.title, 'body', new.message, 'sound', 'default',
    'channelId', case when new.type = 'alert' or coalesce(new.metadata->>'event','') = 'auto_checkout' then 'alerts' else 'default' end,
    'data', jsonb_build_object('notificationId',new.id,'adminId',new.admin_id,'type',new.type,'screen','Notifications','metadata',coalesce(new.metadata,'{}'::jsonb))
  )), '[]'::jsonb), count(*) into payload, token_count
  from notification_tokens where admin_id = new.admin_id and is_active = true;

  if token_count > 0 then
    request_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      body := payload
    );
  end if;

  insert into notification_delivery_logs(channel,recipient_type,recipient_id,notification_type,title,message,token_count,provider_request_id,status,details)
  values ('admin_push','admin',new.admin_id,new.type,new.title,new.message,token_count,request_id,
    case when token_count > 0 then 'queued' else 'skipped' end,
    jsonb_build_object('notification_id',new.id,'reason',case when token_count = 0 then 'no_active_tokens' else null end));

  update notification_tokens set last_sent_at=now(),last_error=null,updated_at=now()
  where admin_id=new.admin_id and is_active=true;
  return new;
exception when others then
  insert into notification_delivery_logs(channel,recipient_type,recipient_id,notification_type,title,message,token_count,status,details)
  values ('admin_push','admin',new.admin_id,new.type,new.title,new.message,token_count,'error',jsonb_build_object('notification_id',new.id,'error',sqlerrm));
  return new;
end $$;

drop trigger if exists trg_queue_admin_push_notification on public.notifications;
create trigger trg_queue_admin_push_notification after insert on public.notifications
for each row execute function public.queue_admin_push_notification();

-- Employee completion push is emitted by the auto-checkout update itself, with no
-- app foreground, realtime reconnect, or dashboard dependency.
create or replace function public.queue_employee_auto_checkout_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  payload jsonb := '[]'::jsonb;
  token_count integer := 0;
  request_id bigint;
begin
  if new.checkout_type <> 'auto_checkout' or old.check_out_time is not null or new.check_out_time is null then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'to',token,'title','Auto checkout completed','body','You have been automatically checked out.','sound','default','channelId','alerts',
    'data',jsonb_build_object('type','alert','notificationKind','checkout_success','event','auto_checkout','employeeId',new.employee_id,'attendanceId',new.id,'checkOutTime',new.check_out_time)
  )), '[]'::jsonb), count(*) into payload, token_count
  from notification_tokens where employee_id=new.employee_id and is_active=true;

  if token_count > 0 then
    request_id := net.http_post(url:='https://exp.host/--/api/v2/push/send',headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,body:=payload);
  end if;
  insert into notification_delivery_logs(channel,recipient_type,recipient_id,notification_type,title,message,token_count,provider_request_id,status,details)
  values ('employee_auto_checkout','employee',new.employee_id,'alert','Auto checkout completed','You have been automatically checked out.',token_count,request_id,
    case when token_count > 0 then 'queued' else 'skipped' end,jsonb_build_object('attendance_id',new.id,'check_out_time',new.check_out_time));
  update notification_tokens set last_sent_at=now(),last_error=null,updated_at=now()
  where employee_id=new.employee_id and is_active=true;
  return new;
exception when others then
  insert into notification_delivery_logs(channel,recipient_type,recipient_id,notification_type,title,message,token_count,status,details)
  values ('employee_auto_checkout','employee',new.employee_id,'alert','Auto checkout completed','You have been automatically checked out.',token_count,'error',jsonb_build_object('attendance_id',new.id,'error',sqlerrm));
  return new;
end $$;

drop trigger if exists trg_queue_gagan_auto_checkout_push on public.attendance;
drop trigger if exists trg_queue_employee_auto_checkout_push on public.attendance;
create trigger trg_queue_employee_auto_checkout_push after update of check_out_time,checkout_type on public.attendance
for each row execute function public.queue_employee_auto_checkout_push();

-- Server-side 15-minute warning. The delivery log provides the deduplication key.
create or replace function public.send_due_auto_checkout_warnings(reference_time timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  due_row record;
  payload jsonb;
  token_count integer;
  request_id bigint;
  sent_count integer := 0;
  reference_utc timestamp := reference_time at time zone 'UTC';
begin
  for due_row in
    select a.id,a.employee_id
    from attendance a
    where a.check_out_time is null
      and attendance_legacy_auto_checkout_deadline(a.check_in_time) > reference_utc
      and attendance_legacy_auto_checkout_deadline(a.check_in_time) <= reference_utc + interval '15 minutes'
      and not exists(select 1 from notification_delivery_logs l where l.channel='employee_auto_checkout_warning' and l.status='queued' and l.details->>'attendance_id'=a.id::text)
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'to',token,'title','Auto checkout warning','body','You will be auto checked out in 15 minutes if you do not check out manually.','sound','default','channelId','alerts',
      'data',jsonb_build_object('type','alert','notificationKind','auto_checkout_warning','attendanceId',due_row.id,'employeeId',due_row.employee_id)
    )), '[]'::jsonb),count(*) into payload,token_count
    from notification_tokens where employee_id=due_row.employee_id and is_active=true;

    if token_count > 0 then
      request_id := net.http_post(url:='https://exp.host/--/api/v2/push/send',headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,body:=payload);
      sent_count := sent_count + token_count;
    else request_id := null;
    end if;
    insert into notification_delivery_logs(channel,recipient_type,recipient_id,notification_type,title,message,token_count,provider_request_id,status,details)
    values ('employee_auto_checkout_warning','employee',due_row.employee_id,'alert','Auto checkout warning','You will be auto checked out in 15 minutes if you do not check out manually.',token_count,request_id,
      case when token_count > 0 then 'queued' else 'skipped' end,jsonb_build_object('attendance_id',due_row.id));
  end loop;
  return sent_count;
end $$;

grant execute on function public.send_due_auto_checkout_warnings(timestamptz) to authenticated;

-- Repair schedules only; the existing auto-checkout function and calculation are untouched.
do $$ declare existing_job bigint; begin
  select jobid into existing_job from cron.job where jobname='attendance-auto-checkout';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('attendance-auto-checkout','* * * * *','select public.auto_checkout_due_attendance(now());');
  existing_job := null;
  select jobid into existing_job from cron.job where jobname='attendance-auto-checkout-warning';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('attendance-auto-checkout-warning','* * * * *','select public.send_due_auto_checkout_warnings(now());');
end $$;
