-- Check for constraints that might be causing the error
-- The error might not be RLS but a constraint violation

-- 1. Check NOT NULL constraints on work_sites
SELECT 
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'work_sites'
ORDER BY ordinal_position;

-- 2. Check CHECK constraints
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'work_sites'::regclass
  AND contype = 'c';

-- 3. Check foreign key constraints
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'work_sites';

-- 4. Check if admin_id or area_id values are valid
-- Replace with actual values from your update
SELECT 
  'Check if admin_id exists' as check_type,
  COUNT(*) as count
FROM admins
WHERE id = 1; -- Replace with your actual admin_id

SELECT 
  'Check if area_id exists' as check_type,
  COUNT(*) as count
FROM areas
WHERE id IS NOT NULL; -- Check if any areas exist

