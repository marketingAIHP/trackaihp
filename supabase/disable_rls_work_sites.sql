-- Disable RLS on work_sites table
-- This is a temporary solution to get updates working
-- You can re-enable RLS later with proper policies

-- Disable RLS
ALTER TABLE work_sites DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE tablename = 'work_sites';

-- If you want to re-enable later, run:
-- ALTER TABLE work_sites ENABLE ROW LEVEL SECURITY;
-- Then recreate policies

