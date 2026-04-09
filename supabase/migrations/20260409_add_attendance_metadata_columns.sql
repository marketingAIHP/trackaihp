-- Add attendance metadata columns used by the app for:
-- - remote-work check-ins
-- - stored check-in/check-out place names
-- - explicit manual vs auto checkout tracking
--
-- This migration is intentionally conservative for historical rows:
-- if an older checked-out row does not have a stored checkout_type,
-- we leave it NULL so the app can infer the correct label at read time.

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS check_in_location_name TEXT;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS check_out_location_name TEXT;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS checkout_type TEXT;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS is_remote_location BOOLEAN DEFAULT FALSE;

UPDATE attendance
SET is_remote_location = FALSE
WHERE is_remote_location IS NULL;

UPDATE attendance
SET check_in_location_name =
  COALESCE(
    check_in_location_name,
    CASE
      WHEN check_in_latitude IS NOT NULL AND check_in_longitude IS NOT NULL
        THEN CONCAT(ROUND(check_in_latitude::numeric, 5), ', ', ROUND(check_in_longitude::numeric, 5))
      ELSE 'Unnamed Location'
    END
  )
WHERE check_in_location_name IS NULL;

UPDATE attendance
SET check_out_location_name =
  COALESCE(
    check_out_location_name,
    CASE
      WHEN check_out_time IS NULL THEN NULL
      WHEN check_out_latitude IS NOT NULL AND check_out_longitude IS NOT NULL
        THEN CONCAT(ROUND(check_out_latitude::numeric, 5), ', ', ROUND(check_out_longitude::numeric, 5))
      ELSE 'Unnamed Location'
    END
  )
WHERE check_out_time IS NOT NULL
  AND check_out_location_name IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_checkout_type_check'
  ) THEN
    ALTER TABLE attendance
    ADD CONSTRAINT attendance_checkout_type_check
    CHECK (
      checkout_type IS NULL
      OR checkout_type IN ('manual_checkout', 'auto_checkout')
    );
  END IF;
END $$;
