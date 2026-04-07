-- ============================================
-- Add Admin User - Quick SQL Script
-- ============================================
-- Run this in Supabase SQL Editor to create an admin user
-- ============================================

-- Option 1: Basic Admin
INSERT INTO admins (
  first_name,
  last_name,
  company_name,
  email,
  password,
  role,
  is_verified,
  is_active
)
VALUES (
  'Admin',
  'User',
  'My Company',
  'admin@example.com',
  'password123',
  'admin',
  true,
  true
);

-- Option 2: Super Admin (uncomment to use)
-- INSERT INTO admins (
--   first_name,
--   last_name,
--   company_name,
--   email,
--   password,
--   role,
--   is_verified,
--   is_active
-- )
-- VALUES (
--   'Super',
--   'Admin',
--   'My Company',
--   'superadmin@example.com',
--   'superpass123',
--   'super_admin',
--   true,
--   true
-- );

-- ============================================
-- Verify Admin Was Created
-- ============================================
-- Run this to check all admins:
-- SELECT id, first_name, last_name, email, role, is_verified, is_active 
-- FROM admins;
-- ============================================


