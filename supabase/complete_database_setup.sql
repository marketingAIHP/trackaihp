-- ============================================
-- AIHP CrewTrack - Complete Database Setup
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- This creates all tables, indexes, triggers, RLS policies, storage, and realtime
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  profile_image TEXT,
  role TEXT NOT NULL DEFAULT 'admin', -- 'super_admin' or 'admin'
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Areas table
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Work sites table
CREATE TABLE IF NOT EXISTS work_sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  geofence_radius INTEGER NOT NULL DEFAULT 200, -- in meters
  site_image TEXT, -- URL to site image in Supabase Storage
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_id TEXT, -- Custom employee ID (like "EMP001")
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  password TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES work_sites(id) ON DELETE SET NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  profile_image TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Location tracking table
CREATE TABLE IF NOT EXISTS location_tracking (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  is_on_site BOOLEAN NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES work_sites(id) ON DELETE CASCADE,
  check_in_time TIMESTAMP DEFAULT NOW(),
  check_out_time TIMESTAMP,
  check_in_latitude DECIMAL(10, 8),
  check_in_longitude DECIMAL(11, 8),
  check_out_latitude DECIMAL(10, 8),
  check_out_longitude DECIMAL(11, 8)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'checkin', 'checkout', 'alert', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB, -- Additional data
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_employees_admin_id ON employees(admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_site_id ON employees(site_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_work_sites_admin_id ON work_sites(admin_id);
CREATE INDEX IF NOT EXISTS idx_work_sites_area_id ON work_sites(area_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_employee_id ON location_tracking(employee_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_timestamp ON location_tracking(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_site_id ON attendance(site_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance(check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_admin_id ON notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- 3. CREATE TRIGGERS
-- ============================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_sites_updated_at BEFORE UPDATE ON work_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Admins table policies (for login/signup)
CREATE POLICY "Allow public read for login"
ON admins FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert for signup"
ON admins FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update for admins"
ON admins FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Areas, Departments, Work Sites policies
CREATE POLICY "Allow public read areas"
ON areas FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert areas"
ON areas FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update areas"
ON areas FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read departments"
ON departments FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert departments"
ON departments FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update departments"
ON departments FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read work_sites"
ON work_sites FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert work_sites"
ON work_sites FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update work_sites"
ON work_sites FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Employees policies
CREATE POLICY "Admins can view all employees"
ON employees FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = (SELECT admin_id FROM employees WHERE employees.id = employees.id)
  )
);

CREATE POLICY "Employees can view own data"
ON employees FOR SELECT
TO authenticated
USING (id = (SELECT id FROM employees WHERE email = auth.jwt() ->> 'email'));

CREATE POLICY "Allow public read employees"
ON employees FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert employees"
ON employees FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update employees"
ON employees FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Location tracking policies
CREATE POLICY "Admins can view all location tracking"
ON location_tracking FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = location_tracking.employee_id
    AND EXISTS (
      SELECT 1 FROM admins WHERE admins.id = employees.admin_id
    )
  )
);

CREATE POLICY "Employees can view own location tracking"
ON location_tracking FOR SELECT
TO authenticated
USING (
  employee_id = (SELECT id FROM employees WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Allow public read location_tracking"
ON location_tracking FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert location_tracking"
ON location_tracking FOR INSERT
TO public
WITH CHECK (true);

-- Attendance policies
CREATE POLICY "Admins can view all attendance"
ON attendance FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = attendance.employee_id
    AND EXISTS (
      SELECT 1 FROM admins WHERE admins.id = employees.admin_id
    )
  )
);

CREATE POLICY "Employees can view own attendance"
ON attendance FOR SELECT
TO authenticated
USING (
  employee_id = (SELECT id FROM employees WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Allow public read attendance"
ON attendance FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert attendance"
ON attendance FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update attendance"
ON attendance FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Notifications policies
CREATE POLICY "Admins can view own notifications"
ON notifications FOR SELECT
TO authenticated
USING (
  admin_id = (SELECT id FROM admins WHERE email = auth.jwt() ->> 'email')
);

CREATE POLICY "Allow public read notifications"
ON notifications FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert notifications"
ON notifications FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update notifications"
ON notifications FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- ============================================
-- 5. STORAGE BUCKETS
-- ============================================

-- Create profile-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create site-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile-images
CREATE POLICY "Users can upload own profile image"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public read access for profile images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-images');

CREATE POLICY "Users can update own profile image"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own profile image"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for site-images
CREATE POLICY "Admins can upload site images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Public read access for site images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'site-images');

CREATE POLICY "Admins can update site images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-images');

CREATE POLICY "Admins can delete site images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-images');

-- ============================================
-- 6. REALTIME SETUP
-- ============================================

-- Enable realtime for location_tracking table
ALTER PUBLICATION supabase_realtime ADD TABLE location_tracking;

-- Enable realtime for attendance table
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for employees table (for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE employees;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- All tables, indexes, triggers, RLS policies,
-- storage buckets, and realtime are now configured.
-- ============================================

