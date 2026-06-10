-- Migration 050: Customer geofence + closing-bill service fee settings.
--
-- Geofence starts with a 3m radius as requested for Round 24. Latitude and
-- longitude stay nullable so tenants can roll this out by setting either DB
-- settings or API env vars without breaking existing deployments.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS geofence_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_radius_meters NUMERIC(10, 2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS service_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00;

ALTER TABLE scan_verification_requests
  ADD COLUMN IF NOT EXISTS distance_meters NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS inside_radius BOOLEAN,
  ADD COLUMN IF NOT EXISTS radius_meters NUMERIC(10, 2);
