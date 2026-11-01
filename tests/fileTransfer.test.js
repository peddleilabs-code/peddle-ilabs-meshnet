import { test } from "node:test";
import assert from "node:assert/strict";
import { base64ToBytes, bytesToBase64, createDownload, readChunk } from "../web/fileTransfer.js";
import { computeContentId, countChunks } from "../web/resourceModel.js";
import { decodeMessage, encodeMessage, MESSAGE_TYPES, ProtocolError } from "../web/protocol.js";

async function fixture(size, chunkSize = 16) {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
  const contentId = await computeContentId(new Blob([bytes]));
  const resource = {
    contentId,
    size,
    chunkSize,
    totalChunks: countChunks(size, chunkSize),
    title: "notes.txt",
    mimeType: "text/plain",
  };
  return { bytes, resource };
}

function chunkOf(bytes, chunkSize, index) {
  return bytes.subarray(index * chunkSize, Math.min(bytes.length, (index + 1) * chunkSize));
}

function createTransport() {
  const requests = [];
  const urls = [];
  return {
    requests,
    urls,
    requestChunk(index) {
      requests.push(index);
      return true;
    },
    createObjectUrl(blob) {
      urls.push(blob);
      return `blob:test-${urls.length}`;
    },
    revokeObjectUrl() {},
  };
}

async function settle(download) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { status } = download.state;
    if (status === "complete" || status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

test("base64 encoding round-trips bytes of any length", () => {
  const bytes = Uint8Array.from({ length: 70_001 }, (_, index) => (index * 7) % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test("readChunk returns the requested slice, including a short final chunk", async () => {
  const { bytes } = await fixture(40);
  const blob = new Blob([bytes]);
  assert.deepEqual(await readChunk(blob, 16, 2), chunkOf(bytes, 16, 2));
  assert.equal((await readChunk(blob, 16, 2)).length, 8);
});

test("a download requests a window of chunks, then completes once the file verifies", async () => {
  const { bytes, resource } = await fixture(320);
  const transport = createTransport();
  const download = createDownload({ resource, ...transport });

  download.start();
  assert.deepEqual(transport.requests, [0, 1, 2, 3, 4, 5, 6, 7]);

  for (let index = 0; index < resource.totalChunks; index += 1) {
    download.receiveChunk(index, bytesToBase64(chunkOf(bytes, resource.chunkSize, index)));
  }
  await settle(download);

  assert.equal(download.state.status, "complete");
  assert.equal(download.state.url, "blob:test-1");
  assert.equal(transport.urls[0].size, 320);
  assert.deepEqual(transport.requests.slice(0, 8), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(transport.requests.slice(8), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test("a file whose bytes do not match its fingerprint is discarded", async () => {
  const { bytes, resource } = await fixture(40);
  const transport = createTransport();
  const download = createDownload({ resource, ...transport });
  download.start();

  const tampered = bytesToBase64(chunkOf(bytes, 16, 1).map((byte) => byte ^ 0xff));
  download.receiveChunk(0, bytesToBase64(chunkOf(bytes, 16, 0)));
  download.receiveChunk(1, tampered);
  download.receiveChunk(2, bytesToBase64(chunkOf(bytes, 16, 2)));
  await settle(download);

  assert.equal(download.state.status, "failed");
  assert.match(download.state.error, /fingerprint/);
  assert.equal(download.state.url, null);
  assert.equal(transport.urls.length, 0);
});

test("a chunk with the wrong size fails the download", async () => {
  const { resource } = await fixture(40);
  const download = createDownload({ resource, ...createTransport() });
  download.start();

  download.receiveChunk(0, bytesToBase64(new Uint8Array(4)));

  assert.equal(download.state.status, "failed");
  assert.match(download.state.error, /wrong size/);
});

test("chunks that were not requested are ignored", async () => {
  const { bytes, resource } = await fixture(320);
  const download = createDownload({ resource, ...createTransport() });
  download.start();

  download.receiveChunk(15, bytesToBase64(chunkOf(bytes, 16, 15)));

  assert.equal(download.state.received, 0);
  assert.equal(download.state.status, "downloading");
});

test("a sender that no longer has the file aborts the download", async () => {
  const { resource } = await fixture(40);
  const download = createDownload({ resource, ...createTransport() });
  download.start();

  download.abort("The device no longer has this file.");

  assert.equal(download.state.status, "failed");
  assert.equal(download.state.error, "The device no longer has this file.");
});

test("losing the connection while requesting chunks fails the download", async () => {
  const { resource } = await fixture(40);
  const download = createDownload({ resource, requestChunk: () => false, createObjectUrl: () => "" });

  download.start();

  assert.equal(download.state.status, "failed");
  assert.match(download.state.error, /connection was lost/);
});

test("an empty file completes without requesting any chunks", async () => {
  const { resource } = await fixture(0);
  const transport = createTransport();
  const download = createDownload({ resource, ...transport });

  download.start();
  await settle(download);

  assert.equal(download.state.status, "complete");
  assert.deepEqual(transport.requests, []);
});

test("chunk requests and chunks survive encoding and decoding", () => {
  const contentId = `sha256:${"a".repeat(64)}`;
  const request = decodeMessage(encodeMessage(MESSAGE_TYPES.CHUNK_REQUEST, { contentId, index: 3 }));
  const chunk = decodeMessage(encodeMessage(MESSAGE_TYPES.CHUNK, { contentId, index: 3, data: "AAEC" }));

  assert.deepEqual(request.payload, { contentId, index: 3 });
  assert.deepEqual(chunk.payload, { contentId, index: 3, data: "AAEC" });
});

test("malformed chunk messages are rejected", () => {
  const contentId = `sha256:${"a".repeat(64)}`;

  assert.throws(
    () => decodeMessage(encodeMessage(MESSAGE_TYPES.CHUNK, { contentId, index: 0, data: "AAE" })),
    ProtocolError,
  );
  assert.throws(
    () => decodeMessage(encodeMessage(MESSAGE_TYPES.CHUNK_REQUEST, { contentId: "sha256:short", index: 0 })),
    ProtocolError,
  );
  assert.throws(
    () => decodeMessage(encodeMessage(MESSAGE_TYPES.CHUNK_REQUEST, { contentId, index: -1 })),
    ProtocolError,
  );
});
