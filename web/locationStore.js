import { validateLocationPayload } from "./protocol.js";
import { SIGNALING_PORT } from "./serverConfig.js";

const DEVICE_KEY_STORAGE = "meshnet.deviceKey";
const SHARING_STORAGE = "meshnet.locationSharing";

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
  const protocol = location.protocol === "https:" ? "https:" : "http:";
  const host = location.hostname || "localhost";
  return `${protocol}//${host}:${SIGNALING_PORT}/api/device-location/${action}`;
}

async function postLocationRequest(action, body) {
  const response = await fetch(locationApiUrl(action), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
