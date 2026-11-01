import {
  countChunks,
  MAX_CHUNK_SIZE,
  MAX_RESOURCE_BYTES,
  MAX_TITLE_LENGTH,
  MIME_TYPE_PATTERN,
} from "./resourceModel.js";

export const PROTOCOL_VERSION = 1;
export const MESSAGE_TYPES = Object.freeze({
  MANIFEST: "manifest",
  LOCATION: "location",
  CHUNK_REQUEST: "chunk-request",
  CHUNK: "chunk",
  CHUNK_UNAVAILABLE: "chunk-unavailable",
});
export const MAX_DATA_MESSAGE_BYTES = 256 * 1024;

const MAX_RESOURCES_PER_MANIFEST = 500;
export const MAX_ACCURACY_METERS = 100_000;
const MAX_ID_LENGTH = 128;
const MAX_LANGUAGE_LENGTH = 35;
const MAX_SIGNAL_SDP_LENGTH = 64 * 1024;
const MAX_CANDIDATE_LENGTH = 2048;
const MAX_SDP_MID_LENGTH = 32;
const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class ProtocolError extends Error {
  name = "ProtocolError";
}

function fail(message) {
  throw new ProtocolError(message);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(source, key, maxLength, minLength = 1) {
  const value = source[key];
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    fail(`${key} must be text of ${minLength} to ${maxLength} characters`);
  }
  return value;
}

function requireInteger(source, key, min, max) {
  const value = source[key];
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${key} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function requireNumber(source, key, min, max) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`${key} must be a number from ${min} to ${max}`);
  }
  return value;
}

function requireTimestamp(source, key) {
  const value = requireString(source, key, 64);
  if (Number.isNaN(Date.parse(value))) fail(`${key} must be a valid timestamp`);
  return value;
}

export function encodeMessage(type, payload, now = new Date()) {
  return JSON.stringify({
    type,
    messageId: crypto.randomUUID(),
    timestamp: now.toISOString(),
    payload,
  });
}

export function decodeMessage(raw) {
  if (typeof raw !== "string") fail("Message must be text");
  if (new TextEncoder().encode(raw).byteLength > MAX_DATA_MESSAGE_BYTES) fail("Message is too large");

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    fail("Message is not valid JSON");
  }
  if (!isPlainObject(envelope)) fail("Message must be an object");
  if (!Object.values(MESSAGE_TYPES).includes(envelope.type)) fail("Unknown message type");

  const messageId = requireString(envelope, "messageId", MAX_ID_LENGTH);
  const timestamp = requireTimestamp(envelope, "timestamp");
  if (!isPlainObject(envelope.payload)) fail("payload must be an object");

  return {
    type: envelope.type,
    messageId,
    timestamp,
    payload: validatePayload(envelope.type, envelope.payload),
  };
}

function validatePayload(type, payload) {
  switch (type) {
    case MESSAGE_TYPES.MANIFEST:
      return validateManifestPayload(payload);
    case MESSAGE_TYPES.LOCATION:
      return validateLocationPayload(payload);
    case MESSAGE_TYPES.CHUNK_REQUEST:
    case MESSAGE_TYPES.CHUNK_UNAVAILABLE:
      return validateChunkReferencePayload(payload);
    case MESSAGE_TYPES.CHUNK:
      return validateChunkPayload(payload);
    default:
      return fail("Unknown message type");
  }
}

function validateManifestPayload(payload) {
  if (payload.protocolVersion !== PROTOCOL_VERSION) fail("Unsupported protocol version");
  if (!Array.isArray(payload.resources) || payload.resources.length > MAX_RESOURCES_PER_MANIFEST) {
    fail(`resources must be a list of at most ${MAX_RESOURCES_PER_MANIFEST} items`);
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    resources: payload.resources.map(validateResource),
  };
}

export function validateLocationPayload(payload) {
  if (payload.location === null) return { location: null };
  if (!isPlainObject(payload.location)) fail("location must be an object or null");
  return {
    location: {
      latitude: requireNumber(payload.location, "latitude", -90, 90),
      longitude: requireNumber(payload.location, "longitude", -180, 180),
      accuracy: requireNumber(payload.location, "accuracy", 0, MAX_ACCURACY_METERS),
      capturedAt: requireTimestamp(payload.location, "capturedAt"),
    },
  };
}

function requireContentId(source) {
  const contentId = requireString(source, "contentId", 80);
  if (!CONTENT_ID_PATTERN.test(contentId)) fail("contentId must be a sha256 content identifier");
  return contentId;
}

function validateChunkReferencePayload(payload) {
  return {
    contentId: requireContentId(payload),
    index: requireInteger(payload, "index", 0, Number.MAX_SAFE_INTEGER),
  };
}

function validateChunkPayload(payload) {
  const data = requireString(payload, "data", MAX_DATA_MESSAGE_BYTES);
  if (!BASE64_PATTERN.test(data)) fail("data must be base64");
  return { ...validateChunkReferencePayload(payload), data };
}

function validateResource(resource) {
  if (!isPlainObject(resource)) fail("Resource must be an object");

  const size = requireInteger(resource, "size", 0, MAX_RESOURCE_BYTES);
  const chunkSize = requireInteger(resource, "chunkSize", 1, MAX_CHUNK_SIZE);
  const totalChunks = requireInteger(resource, "totalChunks", 0, Number.MAX_SAFE_INTEGER);
  if (totalChunks !== countChunks(size, chunkSize)) {
    fail("totalChunks does not match size and chunkSize");
  }

  const contentId = requireContentId(resource);

  const mimeType = requireString(resource, "mimeType", 127);
  if (!MIME_TYPE_PATTERN.test(mimeType)) fail("mimeType is not a valid MIME type");

  if (resource.hashAlgorithm !== "sha256") fail("hashAlgorithm must be sha256");

  return {
    resourceId: requireString(resource, "resourceId", MAX_ID_LENGTH),
    contentId,
    title: requireString(resource, "title", MAX_TITLE_LENGTH),
    mimeType,
    size,
    chunkSize,
    totalChunks,
    version: requireInteger(resource, "version", 1, Number.MAX_SAFE_INTEGER),
    hashAlgorithm: "sha256",
    language: requireString(resource, "language", MAX_LANGUAGE_LENGTH, 2),
    createdAt: requireTimestamp(resource, "createdAt"),
    updatedAt: requireTimestamp(resource, "updatedAt"),
  };
}

export function validateSignal(message) {
  if (!isPlainObject(message)) fail("Signal must be an object");
  const from = requireString(message, "from", MAX_ID_LENGTH);

  if (message.type === "ice") {
    if (message.candidate === null) return { type: "ice", from, candidate: null };
    if (!isPlainObject(message.candidate)) fail("candidate must be an object or null");
    const { sdpMid = null, sdpMLineIndex = null } = message.candidate;
    if (sdpMid !== null && (typeof sdpMid !== "string" || sdpMid.length > MAX_SDP_MID_LENGTH)) {
      fail("sdpMid is invalid");
    }
    if (sdpMLineIndex !== null && !Number.isInteger(sdpMLineIndex)) fail("sdpMLineIndex is invalid");
    return {
      type: "ice",
      from,
      candidate: {
        candidate: requireString(message.candidate, "candidate", MAX_CANDIDATE_LENGTH, 0),
        sdpMid,
        sdpMLineIndex,
      },
    };
  }

  if (message.type === "offer" || message.type === "answer") {
    const description = message.description;
    if (!isPlainObject(description) || description.type !== message.type) {
      fail("description must match the signal type");
    }
    return {
      type: message.type,
      from,
      description: {
        type: message.type,
        sdp: requireString(description, "sdp", MAX_SIGNAL_SDP_LENGTH, 0),
      },
    };
  }

  return fail("Unknown signal type");
}
