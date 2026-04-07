-- Final RLS fix - More explicit policies
-- Run this in Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public update work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public insert work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public read work_sites" ON work_sites;

-- Recreate with explicit permissions
CREATE POLICY "Allow public read work_sites"
ON work_sites FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert work_sites"
ON work_sites FOR INSERT
TO public
WITH CHECK (true);

-- Critical: Update policy that explicitly allows all updates
-- The key is to make both USING and WITH CHECK very permissive
CREATE POLICY "Allow public update work_sites"
ON work_sites FOR UPDATE
TO public
USING (true)  -- Allow updating any existing row
WITH CHECK (true);  -- Allow any values in the updated row

-- Verify policies
SELECT 
  tablename,
  policyname,
  cmd,
  qual as "USING clause",
  with_check as "WITH CHECK clause"
FROM pg_policies
WHERE tablename = 'work_sites'
ORDER BY cmd, policyname;

-- If still having issues, try this alternative approach:
-- Grant explicit permissions (this bypasses RLS for the anon role)
-- GRANT ALL ON work_sites TO anon, authenticated;

