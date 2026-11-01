import { computeContentId, countChunks } from "./resourceModel.js";

export const CHUNK_WINDOW = 8;
const BASE64_BLOCK_SIZE = 0x8000;

export function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_BLOCK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_BLOCK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function readChunk(file, chunkSize, index) {
  const start = index * chunkSize;
  const end = Math.min(file.size, start + chunkSize);
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function expectedChunkLength(resource, index) {
  const start = index * resource.chunkSize;
  return Math.min(resource.size, start + resource.chunkSize) - start;
}

export function createDownload({
  resource,
  requestChunk,
  onChange,
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
}) {
  const total = countChunks(resource.size, resource.chunkSize);
  const chunks = new Array(total);
  const requested = new Set();
  let nextIndex = 0;
  let finished = false;
  const state = { status: "idle", received: 0, total, url: null, error: null };

  function update(changes) {
    Object.assign(state, changes);
    onChange?.(state);
  }

  function fail(message) {
    if (finished) return;
    finished = true;
    chunks.length = 0;
    update({ status: "failed", error: message });
  }

  function requestMore() {
    while (requested.size < CHUNK_WINDOW && nextIndex < total) {
      if (!requestChunk(nextIndex)) {
        fail("The connection was lost before the file finished downloading.");
        return;
      }
      requested.add(nextIndex);
      nextIndex += 1;
    }
  }

  async function verify() {
    update({ status: "verifying" });
    const blob = new Blob(chunks, { type: resource.mimeType });
    const contentId = await computeContentId(blob);
    if (finished) return;
    if (contentId !== resource.contentId) {
      fail("The file did not match its fingerprint, so it was discarded.");
      return;
    }
    finished = true;
    chunks.length = 0;
    update({ status: "complete", url: createObjectUrl(blob) });
  }

  return {
    get state() {
      return state;
    },

    start() {
      if (total === 0) {
        void verify();
        return;
      }
      update({ status: "downloading" });
      requestMore();
    },

    receiveChunk(index, encoded) {
      if (finished || !requested.has(index)) return;
      let bytes;
      try {
        bytes = base64ToBytes(encoded);
      } catch {
        fail("A chunk arrived damaged.");
        return;
      }
      if (bytes.length !== expectedChunkLength(resource, index)) {
        fail("A chunk arrived with the wrong size.");
        return;
      }
      requested.delete(index);
      chunks[index] = bytes;
      update({ received: state.received + 1 });
      if (state.received === total) {
        void verify();
      } else {
        requestMore();
      }
    },

    abort(message) {
      fail(message);
    },

    dispose() {
      finished = true;
      chunks.length = 0;
      if (state.url) revokeObjectUrl(state.url);
      update({ url: null });
    },
  };
}
