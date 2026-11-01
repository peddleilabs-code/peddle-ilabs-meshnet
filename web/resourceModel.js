export const DEFAULT_CHUNK_SIZE = 16 * 1024;
export const MAX_CHUNK_SIZE = 1024 * 1024;
export const MAX_RESOURCE_BYTES = 100 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 255;
export const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;

const FALLBACK_MIME_TYPE = "application/octet-stream";
const UNDETERMINED_LANGUAGE = "und";

export function countChunks(size, chunkSize) {
  return Math.ceil(size / chunkSize);
}

export async function computeContentId(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function normalizeMimeType(type) {
  const base = String(type || "").split(";")[0].trim().toLowerCase();
  return MIME_TYPE_PATTERN.test(base) ? base : FALLBACK_MIME_TYPE;
}

export async function createResourceFromFile(file, now = new Date()) {
  if (file.size > MAX_RESOURCE_BYTES) {
    const limitMb = MAX_RESOURCE_BYTES / (1024 * 1024);
    throw new Error(`${file.name} is larger than the ${limitMb} MB sharing limit.`);
  }
  const contentId = await computeContentId(file);
  const timestamp = now.toISOString();
  const resource = {
    resourceId: crypto.randomUUID(),
    contentId,
    title: file.name.slice(0, MAX_TITLE_LENGTH),
    mimeType: normalizeMimeType(file.type),
    size: file.size,
    chunkSize: DEFAULT_CHUNK_SIZE,
    totalChunks: countChunks(file.size, DEFAULT_CHUNK_SIZE),
    version: 1,
    hashAlgorithm: "sha256",
    language: UNDETERMINED_LANGUAGE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { resource, file };
}
