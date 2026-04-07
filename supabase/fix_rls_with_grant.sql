-- Complete RLS fix using GRANT permissions
-- This approach grants explicit permissions which work alongside RLS

-- Step 1: Grant explicit table permissions
GRANT ALL ON work_sites TO anon;
GRANT ALL ON work_sites TO authenticated;
GRANT ALL ON work_sites TO public;

-- Step 2: Drop and recreate RLS policies
DROP POLICY IF EXISTS "Allow public update work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public insert work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public read work_sites" ON work_sites;

-- Step 3: Recreate policies with explicit role targeting
CREATE POLICY "Allow public read work_sites"
ON work_sites FOR SELECT
TO anon, authenticated, public
USING (true);

CREATE POLICY "Allow public insert work_sites"
ON work_sites FOR INSERT
TO anon, authenticated, public
WITH CHECK (true);

CREATE POLICY "Allow public update work_sites"
ON work_sites FOR UPDATE
TO anon, authenticated, public
USING (true)
WITH CHECK (true);

-- Step 4: Verify
SELECT 
  tablename,
  policyname,
  cmd,
  roles,
  qual as "USING",
  with_check as "WITH CHECK"
FROM pg_policies
WHERE tablename = 'work_sites';

-- If still not working, try this nuclear option (TEMPORARY - for testing only):
-- ALTER TABLE work_sites DISABLE ROW LEVEL SECURITY;

