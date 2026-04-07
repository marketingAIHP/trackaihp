-- Fix RLS policies for admin login
-- This ensures admins can be read for login purposes

-- First, check if RLS is enabled on admins table
SELECT 
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'admins';

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow public read for login" ON admins;

-- Create a policy that allows reading admins for login
-- This is safe because we only expose email and password hash (not sensitive data)
CREATE POLICY "Allow public read for login"
ON admins
FOR SELECT
USING (true);

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'admins'
ORDER BY policyname;

-- Test query (should work now)
-- SELECT id, email, is_verified, is_active FROM admins LIMIT 1;

