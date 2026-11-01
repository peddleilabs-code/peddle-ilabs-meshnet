import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMessage, encodeMessage, MESSAGE_TYPES, ProtocolError, validateSignal } from "../web/protocol.js";

const validResource = () => ({
  resourceId: "r-1",
  contentId: `sha256:${"a".repeat(64)}`,
  title: "Lesson",
  mimeType: "application/pdf",
  size: 40000,
  chunkSize: 16384,
  totalChunks: 3,
  version: 1,
  hashAlgorithm: "sha256",
  language: "en",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});

const manifestRaw = (resources) =>
  JSON.stringify({
    type: "manifest",
    messageId: "m-1",
    timestamp: "2026-11-01T00:00:00.000Z",
    payload: { protocolVersion: 1, resources },
  });

test("a manifest survives encoding and decoding", () => {
  const resource = validResource();
  const decoded = decodeMessage(
    encodeMessage(MESSAGE_TYPES.MANIFEST, { protocolVersion: 1, resources: [resource] }),
  );
  assert.equal(decoded.type, "manifest");
  assert.deepEqual(decoded.payload.resources, [resource]);
});

test("unknown resource fields are dropped rather than passed through", () => {
  const decoded = decodeMessage(manifestRaw([{ ...validResource(), script: "x" }]));
  assert.equal("script" in decoded.payload.resources[0], false);
});

test("non-text, oversized, and non-JSON input is rejected", () => {
  assert.throws(() => decodeMessage(42), ProtocolError);
  assert.throws(() => decodeMessage("x".repeat(300 * 1024)), ProtocolError);
  assert.throws(() => decodeMessage("{not json"), ProtocolError);
});

test("unknown message types are rejected", () => {
  const raw = JSON.stringify({ type: "shell", messageId: "m", timestamp: "2026-11-01T00:00:00.000Z", payload: {} });
  assert.throws(() => decodeMessage(raw), /Unknown message type/);
});

test("a malformed content identifier is rejected", () => {
  const resource = { ...validResource(), contentId: "md5:abc" };
  assert.throws(() => decodeMessage(manifestRaw([resource])), ProtocolError);
});

test("a chunk count that does not match the size is rejected", () => {
  const resource = { ...validResource(), totalChunks: 2 };
  assert.throws(() => decodeMessage(manifestRaw([resource])), /totalChunks/);
});

test("an invalid timestamp is rejected", () => {
  const raw = JSON.stringify({
    type: "manifest",
    messageId: "m-1",
    timestamp: "yesterday",
    payload: { protocolVersion: 1, resources: [] },
  });
  assert.throws(() => decodeMessage(raw), /timestamp/);
});

test("offers and answers must carry a matching session description", () => {
  const offer = { type: "offer", from: "peer-a", description: { type: "offer", sdp: "v=0" } };
  assert.deepEqual(validateSignal(offer), offer);
  assert.throws(() => validateSignal({ ...offer, description: { type: "answer", sdp: "v=0" } }), ProtocolError);
});

test("ICE signals accept end-of-candidates and reject malformed candidates", () => {
  assert.deepEqual(validateSignal({ type: "ice", from: "peer-a", candidate: null }), {
    type: "ice",
    from: "peer-a",
    candidate: null,
  });
  assert.throws(() => validateSignal({ type: "ice", from: "peer-a", candidate: "candidate:1" }), ProtocolError);
});
