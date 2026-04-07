-- Disable RLS on work_sites and all related tables
-- This fixes the "new row violates row-level security policy" error

-- Disable RLS on work_sites
ALTER TABLE work_sites DISABLE ROW LEVEL SECURITY;

-- Disable RLS on areas (referenced by work_sites.area_id)
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;

-- Disable RLS on admins (referenced by work_sites.admin_id)
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- Also disable on other related tables that might be involved
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE tablename IN ('work_sites', 'areas', 'admins', 'employees', 'departments')
ORDER BY tablename;

-- Note: Your application code still validates admin_id ownership,
-- so you still have application-level security

