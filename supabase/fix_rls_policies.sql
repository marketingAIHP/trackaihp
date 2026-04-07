-- Fix RLS policies for work_sites updates
-- This ensures updates work correctly even when site_image is null

-- Drop existing update policy if it exists
DROP POLICY IF EXISTS "Allow public update work_sites" ON work_sites;

-- Create a more permissive update policy
CREATE POLICY "Allow public update work_sites"
ON work_sites FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Also ensure the admin_id is preserved (this is handled by the application, but good to verify)
-- The admin_id should not be changed during updates, so we don't need to add it to the update

-- Fix similar policies for employees and admins if needed
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

