import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEVICE_KEY_MIN_LENGTH = 16;
const DEVICE_KEY_MAX_LENGTH = 128;
const MAX_ACCURACY_METERS = 100_000;
const ACTIONS = ["save", "load", "clear"];

class InvalidInputError extends Error {}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireDeviceKey(value: unknown): string {
  if (typeof value !== "string" || value.length < DEVICE_KEY_MIN_LENGTH || value.length > DEVICE_KEY_MAX_LENGTH) {
    throw new InvalidInputError("deviceKey must be a private key of 16 to 128 characters");
  }
  return value;
}

function requireNumber(source: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new InvalidInputError(`${key} must be a number from ${min} to ${max}`);
  }
  return value;
}

function requireLocation(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new InvalidInputError("location must be an object");
  }
  const source = value as Record<string, unknown>;
  const capturedAt = typeof source.capturedAt === "string" ? new Date(source.capturedAt) : null;
  if (!capturedAt || Number.isNaN(capturedAt.getTime())) {
    throw new InvalidInputError("capturedAt must be a valid timestamp");
  }
  return {
    latitude: requireNumber(source, "latitude", -90, 90),
    longitude: requireNumber(source, "longitude", -180, 180),
    accuracy: requireNumber(source, "accuracy", 0, MAX_ACCURACY_METERS),
    capturedAt: capturedAt.toISOString(),
  };
}

async function handleAction(action: string, body: Record<string, unknown>, supabaseUrl: string, serviceKey: string) {
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const deviceKey = requireDeviceKey(body.deviceKey);

  if (action === "save") {
    const location = requireLocation(body.location);
    const { error } = await supabase.rpc("save_device_location", {
      p_device_key: deviceKey,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_accuracy: location.accuracy,
      p_captured_at: location.capturedAt,
    });
    if (error) throw new Error(`save_device_location failed: ${error.message}`);
    return { ok: true };
  }

  if (action === "clear") {
    const { error } = await supabase.rpc("clear_device_location", { p_device_key: deviceKey });
    if (error) throw new Error(`clear_device_location failed: ${error.message}`);
    return { ok: true };
  }

  const { data, error } = await supabase.rpc("load_device_location", { p_device_key: deviceKey });
  if (error) throw new Error(`load_device_location failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("load_device_location returned an unexpected shape");
  const row = data[0];
  if (!row) return { location: null };
  return {
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      capturedAt: new Date(row.captured_at).toISOString(),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const action = new URL(req.url).pathname.split("/").pop() ?? "";
  if (!ACTIONS.includes(action)) return json({ error: "Unknown action" }, 404);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Location storage is not configured." }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  try {
    return json(await handleAction(action, body, supabaseUrl, serviceKey));
  } catch (error) {
    if (error instanceof InvalidInputError) return json({ error: error.message }, 400);
    console.error("device-location failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Location storage is unavailable right now." }, 502);
  }
});
