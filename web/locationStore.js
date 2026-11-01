import { validateLocationPayload } from "./protocol.js";

const DEVICE_KEY_STORAGE = "meshnet.deviceKey";
const SHARING_STORAGE = "meshnet.locationSharing";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SAVE_INTERVAL_MS = 30_000;

export function getOrCreateDeviceKey() {
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (stored) return stored;
  const key = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY_STORAGE, key);
  return key;
}

export function readSharingPreference() {
  return localStorage.getItem(SHARING_STORAGE) === "on";
}

export function writeSharingPreference(enabled) {
  if (enabled) localStorage.setItem(SHARING_STORAGE, "on");
  else localStorage.removeItem(SHARING_STORAGE);
}

function locationApiUrl(action) {
  return `${SUPABASE_URL}/functions/v1/device-location/${action}`;
}

async function postLocationRequest(action, body) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Location storage is not configured.");
  const response = await fetch(locationApiUrl(action), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `The location service responded with status ${response.status}.`);
  }
  return payload;
}

export function saveLastLocation(deviceKey, location) {
  return postLocationRequest("save", { deviceKey, location });
}

export function clearLastLocation(deviceKey) {
  return postLocationRequest("clear", { deviceKey });
}

export async function loadLastLocation(deviceKey) {
  const payload = await postLocationRequest("load", { deviceKey });
  if (!payload || !("location" in payload)) {
    throw new Error("The location service sent an unexpected response.");
  }
  return validateLocationPayload({ location: payload.location }).location;
}

export function createThrottledSaver(save, intervalMs = SAVE_INTERVAL_MS) {
  let timer = null;
  let pending = null;
  let lastSavedAt = 0;

  function flush() {
    timer = null;
    if (!pending) return;
    const location = pending;
    pending = null;
    lastSavedAt = Date.now();
    save(location);
  }

  return {
    schedule(location) {
      pending = location;
      if (timer) return;
      timer = setTimeout(flush, Math.max(0, lastSavedAt + intervalMs - Date.now()));
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
