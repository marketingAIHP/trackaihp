-- Make site_id nullable in attendance table to support remote work
-- Remote work employees may not have an assigned site

ALTER TABLE attendance 
ALTER COLUMN site_id DROP NOT NULL;

-- Update foreign key constraint to allow NULL
-- (PostgreSQL allows NULL in foreign keys by default, so we just need to drop NOT NULL)

