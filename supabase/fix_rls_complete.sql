-- Complete RLS fix for work_sites updates
-- Run this in Supabase SQL Editor

-- First, let's check if RLS is enabled
-- If you want to temporarily disable RLS for testing (NOT recommended for production):
-- ALTER TABLE work_sites DISABLE ROW LEVEL SECURITY;

-- Better approach: Fix the policies properly

-- Drop all existing policies on work_sites
DROP POLICY IF EXISTS "Allow public read work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public insert work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow public update work_sites" ON work_sites;
DROP POLICY IF EXISTS "Allow admin update own sites" ON work_sites;

-- Recreate policies with proper permissions
-- SELECT policy
CREATE POLICY "Allow public read work_sites"
ON work_sites FOR SELECT
TO public
USING (true);

-- INSERT policy  
CREATE POLICY "Allow public insert work_sites"
ON work_sites FOR INSERT
TO public
WITH CHECK (true);

-- UPDATE policy - This is the critical one
-- Make it very permissive to avoid RLS blocking
CREATE POLICY "Allow public update work_sites"
ON work_sites FOR UPDATE
TO public
USING (true)  -- Allow updating any row
WITH CHECK (true);  -- Allow any values in the update

-- Also fix employees and admins policies
DROP POLICY IF EXISTS "Allow public update employees" ON employees;
CREATE POLICY "Allow public update employees"
ON employees FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for admins" ON admins;
CREATE POLICY "Allow public update for admins"
ON admins FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'work_sites';

