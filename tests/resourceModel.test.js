import { test } from "node:test";
import assert from "node:assert/strict";
import { computeContentId, countChunks, createResourceFromFile } from "../web/resourceModel.js";

test("computeContentId matches the SHA-256 of known bytes", async () => {
  assert.equal(
    await computeContentId(new Blob(["abc"])),
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("countChunks rounds up and handles empty resources", () => {
  assert.equal(countChunks(0, 16384), 0);
  assert.equal(countChunks(16384, 16384), 1);
  assert.equal(countChunks(16385, 16384), 2);
});

test("createResourceFromFile describes the file without changing its bytes", async () => {
  const file = new File(["a".repeat(40000)], "lesson.pdf", { type: "application/pdf" });
  const { resource, file: kept } = await createResourceFromFile(file);

  assert.equal(kept, file);
  assert.equal(resource.title, "lesson.pdf");
  assert.equal(resource.mimeType, "application/pdf");
  assert.equal(resource.size, 40000);
  assert.equal(resource.totalChunks, 3);
  assert.equal(resource.hashAlgorithm, "sha256");
  assert.match(resource.contentId, /^sha256:[0-9a-f]{64}$/);
  assert.equal(resource.contentId, await computeContentId(file));
});

test("createResourceFromFile normalizes unusual MIME types", async () => {
  const withParams = await createResourceFromFile(new File(["x"], "a.txt", { type: "Text/Plain; charset=utf-8" }));
  const unknown = await createResourceFromFile(new File(["x"], "b.bin", { type: "" }));
  assert.equal(withParams.resource.mimeType, "text/plain");
  assert.equal(unknown.resource.mimeType, "application/octet-stream");
});

test("createResourceFromFile rejects files over the sharing limit", async () => {
  const oversized = { name: "huge.mkv", type: "video/x-matroska", size: 101 * 1024 * 1024 };
  await assert.rejects(() => createResourceFromFile(oversized), /sharing limit/);
});
