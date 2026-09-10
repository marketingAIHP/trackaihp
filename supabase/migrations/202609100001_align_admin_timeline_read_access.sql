-- Employees and attendance are readable by every authenticated admin. Apply
-- the same read-only rule to timeline reports so all admin surfaces agree.
drop policy if exists "admins read their employee timelines" on public.location_timeline;
drop policy if exists "admins read all employee timelines" on public.location_timeline;

create policy "admins read all employee timelines"
on public.location_timeline
for select
to authenticated
using (private.is_authenticated_admin());
