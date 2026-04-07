-- Diagnose the RLS issue
-- Run this to check what's actually happening

-- 1. Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE tablename = 'work_sites';

-- 2. Check all policies on work_sites (should be none if RLS is disabled)
SELECT * FROM pg_policies WHERE tablename = 'work_sites';

-- 3. Check for triggers on work_sites
SELECT 
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'work_sites';

-- 4. Check for foreign key constraints that might reference other tables
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (tc.table_name = 'work_sites' OR ccu.table_name = 'work_sites');

-- 5. Check if areas table has RLS enabled (since work_sites references areas)
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE tablename IN ('areas', 'admins');

-- 6. Check policies on related tables
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('areas', 'admins');

