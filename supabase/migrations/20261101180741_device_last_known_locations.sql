/*
# Store each device's last known location

1. New Tables
- `device_locations`: one row per device that is sharing its location.
  - `device_key_hash` (text, primary key): SHA-256 of the device's private key. The key itself is never stored.
  - `latitude`, `longitude` (double precision): checked to be valid coordinates.
  - `accuracy` (double precision): accuracy in meters, 0 to 100000.
  - `captured_at` (timestamptz): when the device measured the position.
  - `updated_at` (timestamptz): when the row was last written.

2. New Functions
- `save_device_location(...)`: inserts or replaces the row for a device.
- `load_device_location(...)`: returns the stored row for a device, if one exists.
- `clear_device_location(...)`: deletes the row for a device.

3. Security
- Row level security is enabled on `device_locations` with no policies and no grants to public roles, so the table cannot be read or written directly through the data API.
- The three functions are the only access path. Each one finds the row by hashing the device key it receives, so a caller can only read or change a row when it knows that device's private key.
- The functions run with the owner's rights so they can reach the table. They are granted only to the `anon` and `authenticated` roles, and only the functions are callable.

4. Notes
- Stopping location sharing deletes the device's row.
- The functions are idempotent: running this migration again leaves the schema unchanged.
*/

CREATE TABLE IF NOT EXISTS device_locations (
  device_key_hash text PRIMARY KEY CHECK (char_length(device_key_hash) = 64),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100000),
  captured_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_locations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.save_device_location(
  p_device_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_captured_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(p_device_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'device key must be 16 to 128 characters';
  END IF;

  INSERT INTO device_locations (device_key_hash, latitude, longitude, accuracy, captured_at, updated_at)
  VALUES (
    encode(sha256(convert_to(p_device_key, 'UTF8')), 'hex'),
    p_latitude,
    p_longitude,
    p_accuracy,
    p_captured_at,
    now()
  )
  ON CONFLICT (device_key_hash) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy,
    captured_at = EXCLUDED.captured_at,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.load_device_location(p_device_key text)
RETURNS TABLE (
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  captured_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.latitude, d.longitude, d.accuracy, d.captured_at
  FROM device_locations d
  WHERE d.device_key_hash = encode(sha256(convert_to(p_device_key, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.clear_device_location(p_device_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM device_locations
  WHERE device_key_hash = encode(sha256(convert_to(p_device_key, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.save_device_location(text, double precision, double precision, double precision, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.load_device_location(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_device_location(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_device_location(text, double precision, double precision, double precision, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_device_location(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_device_location(text) TO anon, authenticated;
