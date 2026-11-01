import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeviceLocationStore, InvalidInputError } from "../server/deviceLocationStore.js";

const DEVICE_KEY = "device-key-0123456789abcdef";
const LOCATION = {
  latitude: 51.5,
  longitude: -0.12,
  accuracy: 12,
  capturedAt: "2026-11-01T10:00:00.000Z",
};

function createStub(responder) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const name = url.split("/rpc/")[1];
    const body = JSON.parse(options.body);
    calls.push({ name, url, options, body });
    return responder(name, body);
  };
  const store = createDeviceLocationStore({
    supabaseUrl: "https://example.supabase.co",
    serviceKey: "service-key",
    fetchImpl,
  });
  return { store, calls };
}

function jsonResponse(payload, status = 200) {
  return new Response(payload === undefined ? "" : JSON.stringify(payload), { status });
}

test("save sends a validated location to the save function with the service key", async () => {
  const { store, calls } = createStub(() => jsonResponse(undefined));

  await store.save(DEVICE_KEY, LOCATION);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "save_device_location");
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/save_device_location");
  assert.equal(calls[0].options.headers.apikey, "service-key");
  assert.equal(calls[0].options.headers.Authorization, "Bearer service-key");
  assert.deepEqual(calls[0].body, {
    p_device_key: DEVICE_KEY,
    p_latitude: 51.5,
    p_longitude: -0.12,
    p_accuracy: 12,
    p_captured_at: "2026-11-01T10:00:00.000Z",
  });
});

test("save normalises the capture time to ISO format", async () => {
  const { store, calls } = createStub(() => jsonResponse(undefined));

  await store.save(DEVICE_KEY, { ...LOCATION, capturedAt: "2026-11-01 10:00:00+00" });

  assert.equal(calls[0].body.p_captured_at, "2026-11-01T10:00:00.000Z");
});

test("save rejects out-of-range coordinates without calling the database", async () => {
  const { store, calls } = createStub(() => jsonResponse(undefined));

  await assert.rejects(store.save(DEVICE_KEY, { ...LOCATION, latitude: 91 }), InvalidInputError);
  await assert.rejects(store.save(DEVICE_KEY, { ...LOCATION, longitude: -181 }), InvalidInputError);
  await assert.rejects(store.save(DEVICE_KEY, { ...LOCATION, accuracy: 100001 }), InvalidInputError);
  assert.equal(calls.length, 0);
});

test("save rejects a missing location or an invalid timestamp", async () => {
  const { store, calls } = createStub(() => jsonResponse(undefined));

  await assert.rejects(store.save(DEVICE_KEY, null), InvalidInputError);
  await assert.rejects(store.save(DEVICE_KEY, { ...LOCATION, capturedAt: "yesterday" }), InvalidInputError);
  assert.equal(calls.length, 0);
});

test("a device key outside 16 to 128 characters is rejected", async () => {
  const { store, calls } = createStub(() => jsonResponse(undefined));

  await assert.rejects(store.clear("short"), InvalidInputError);
  await assert.rejects(store.clear("x".repeat(129)), InvalidInputError);
  await assert.rejects(store.load(42), InvalidInputError);
  assert.equal(calls.length, 0);
});

test("load returns null when no location is saved", async () => {
  const { store } = createStub(() => jsonResponse([]));

  assert.equal(await store.load(DEVICE_KEY), null);
});

test("load maps the stored row to the client location shape", async () => {
  const { store } = createStub(() =>
    jsonResponse([
      { latitude: 51.5, longitude: -0.12, accuracy: 12, captured_at: "2026-11-01T10:00:00+00:00" },
    ]),
  );

  assert.deepEqual(await store.load(DEVICE_KEY), {
    latitude: 51.5,
    longitude: -0.12,
    accuracy: 12,
    capturedAt: "2026-11-01T10:00:00.000Z",
  });
});

test("load fails when the database returns an unexpected shape", async () => {
  const { store } = createStub(() => jsonResponse({ latitude: 1 }));

  await assert.rejects(store.load(DEVICE_KEY), /Unexpected response/);
});

test("a failed database call surfaces as an error", async () => {
  const { store } = createStub(() => jsonResponse({ message: "denied" }, 403));

  await assert.rejects(store.clear(DEVICE_KEY), /failed with status 403/);
});
