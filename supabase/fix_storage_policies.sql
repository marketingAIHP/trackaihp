-- Fix storage policies to allow public/anon uploads
-- The current policies require 'authenticated' but app uses 'anon' key

-- Drop existing storage policies for site-images
DROP POLICY IF EXISTS "Admins can upload site images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for site images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update site images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete site images" ON storage.objects;

-- Create new policies that allow public/anon access
CREATE POLICY "Public can upload site images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Public read access for site images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'site-images');

CREATE POLICY "Public can update site images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'site-images')
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Public can delete site images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'site-images');

-- Also fix profile-images policies if needed
DROP POLICY IF EXISTS "Users can upload own profile image" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own profile image" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own profile image" ON storage.objects;

CREATE POLICY "Public can upload profile images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'profile-images');

CREATE POLICY "Public read access for profile images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-images');

CREATE POLICY "Public can update profile images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'profile-images')
WITH CHECK (bucket_id = 'profile-images');

CREATE POLICY "Public can delete profile images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'profile-images');

-- Verify policies
SELECT 
  policyname as policy_name,
  cmd,
  qual as "USING clause",
  with_check as "WITH CHECK clause"
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
ORDER BY policyname;

