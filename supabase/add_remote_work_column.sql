-- Add remote_work column to employees table
-- This allows employees to check in/out from anywhere when enabled

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS remote_work BOOLEAN DEFAULT FALSE;

-- Update existing employees to have remote_work = false by default
UPDATE employees 
SET remote_work = FALSE 
WHERE remote_work IS NULL;

