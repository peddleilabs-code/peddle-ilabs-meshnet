const DEVICE_KEY_MIN_LENGTH = 16;
const DEVICE_KEY_MAX_LENGTH = 128;
const MAX_ACCURACY_METERS = 100_000;

export class InvalidInputError extends Error {}

function requireDeviceKey(deviceKey) {
  if (typeof deviceKey !== "string" || deviceKey.length < DEVICE_KEY_MIN_LENGTH || deviceKey.length > DEVICE_KEY_MAX_LENGTH) {
    throw new InvalidInputError("deviceKey must be a private key of 16 to 128 characters");
  }
  return deviceKey;
}

function requireNumber(source, key, min, max) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new InvalidInputError(`${key} must be a number from ${min} to ${max}`);
  }
  return value;
}

function requireLocation(location) {
  if (typeof location !== "object" || location === null) {
    throw new InvalidInputError("location must be an object");
  }
  const capturedAt = new Date(location.capturedAt);
  if (typeof location.capturedAt !== "string" || Number.isNaN(capturedAt.getTime())) {
    throw new InvalidInputError("capturedAt must be a valid timestamp");
  }
  return {
    latitude: requireNumber(location, "latitude", -90, 90),
    longitude: requireNumber(location, "longitude", -180, 180),
    accuracy: requireNumber(location, "accuracy", 0, MAX_ACCURACY_METERS),
    capturedAt: capturedAt.toISOString(),
  };
}

export function createDeviceLocationStore({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  async function callFunction(name, args) {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      throw new Error(`Supabase function ${name} failed with status ${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async save(deviceKey, location) {
      const key = requireDeviceKey(deviceKey);
      const { latitude, longitude, accuracy, capturedAt } = requireLocation(location);
      await callFunction("save_device_location", {
        p_device_key: key,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy: accuracy,
        p_captured_at: capturedAt,
      });
    },

    async load(deviceKey) {
      const rows = await callFunction("load_device_location", { p_device_key: requireDeviceKey(deviceKey) });
      if (!Array.isArray(rows)) throw new Error("Unexpected response from load_device_location");
      const row = rows[0];
      if (!row) return null;
      return {
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        capturedAt: new Date(row.captured_at).toISOString(),
      };
    },

    async clear(deviceKey) {
      await callFunction("clear_device_location", { p_device_key: requireDeviceKey(deviceKey) });
    },
  };
}
