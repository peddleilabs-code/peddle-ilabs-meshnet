/*
# Restrict device location functions to the server

1. Changed Functions
- `save_device_location`, `load_device_location`, `clear_device_location`: execute permission is removed from the `anon` and `authenticated` roles and granted only to `service_role`.

2. Security
- Browsers can no longer call these functions directly with the public anon key. Only the signaling server, which holds the service key, can save, load, or clear a device's last known location.
- Each device still identifies its own row by its private key, which the server passes along; the key is hashed before lookup and never stored.

3. Notes
- This migration only changes permissions. No data is changed.
- Running it again leaves permissions unchanged.
*/

REVOKE EXECUTE ON FUNCTION public.save_device_location(text, double precision, double precision, double precision, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.load_device_location(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_device_location(text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_device_location(text, double precision, double precision, double precision, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_device_location(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_device_location(text) TO service_role;
