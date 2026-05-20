create table if not exists public.app_deployment_policies (
  id bigserial primary key,
  app_id text not null default 'aihp-crewtrack',
  channel text not null,
  platform text not null check (platform in ('android', 'ios', 'all')),
  minimum_supported_version text,
  recommended_version text,
  force_native_update boolean not null default false,
  update_title text,
  update_message text,
  download_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_app_deployment_policies_active_target
on public.app_deployment_policies (app_id, channel, platform)
where is_active = true;

create or replace function public.set_app_deployment_policies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_app_deployment_policies_updated_at
on public.app_deployment_policies;

create trigger trg_app_deployment_policies_updated_at
before update on public.app_deployment_policies
for each row
execute function public.set_app_deployment_policies_updated_at();

alter table public.app_deployment_policies enable row level security;

drop policy if exists "public can read active deployment policies"
on public.app_deployment_policies;

create policy "public can read active deployment policies"
on public.app_deployment_policies
for select
using (is_active = true);

insert into public.app_deployment_policies (
  app_id,
  channel,
  platform,
  minimum_supported_version,
  recommended_version,
  force_native_update,
  update_title,
  update_message,
  download_url
)
values
  (
    'aihp-crewtrack',
    'production',
    'android',
    '1.0.0',
    '1.0.0',
    false,
    'Update required',
    'Install the latest production APK shared by your administrator to continue using AIHP CrewTrack.',
    null
  ),
  (
    'aihp-crewtrack',
    'staging',
    'android',
    '1.0.0',
    '1.0.0',
    false,
    'Update required',
    'Install the latest staging APK shared by your administrator to continue testing AIHP CrewTrack.',
    null
  )
on conflict do nothing;
