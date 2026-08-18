import test from "node:test";
import assert from "node:assert/strict";
import {
  LEBTIG_MEDIA_ALT_MAX_LENGTH,
  LEBTIG_MEDIA_MAX_BYTES,
  LEBTIG_MEDIA_MIME_TYPES,
  mediaUsageKey,
  mediaUrlFor,
  safeMediaObjectName,
  toCmsImageMetadata,
  validateLebtigMediaUpload,
} from "../src/domain/media.ts";

test("Lebtig preserves the current 5MB four-format upload policy", () => {
  assert.equal(LEBTIG_MEDIA_MAX_BYTES, 5 * 1024 * 1024);
  assert.deepEqual([...LEBTIG_MEDIA_MIME_TYPES], [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ]);
  for (const mimeType of LEBTIG_MEDIA_MIME_TYPES) {
    assert.equal(validateLebtigMediaUpload({
      mimeType,
      byteSize: 2048,
      altText: "Handwerk an der Theke",
    }).valid, true);
  }
});

test("Lebtig keeps alt text mandatory and capped at the current UI limit", () => {
  assert.equal(LEBTIG_MEDIA_ALT_MAX_LENGTH, 180);
  assert.deepEqual(validateLebtigMediaUpload({
    mimeType: "image/jpeg",
    byteSize: 2048,
    altText: " ",
  }).errors, ["alt_text_required"]);
  assert.deepEqual(validateLebtigMediaUpload({
    mimeType: "image/jpeg",
    byteSize: 2048,
    altText: "x".repeat(181),
  }).errors, ["alt_text_too_long"]);
});

test("Lebtig stable media links filenames and usage keys remain deterministic", () => {
  assert.equal(mediaUrlFor("abc 123"), "/media/abc%20123");
  assert.equal(safeMediaObjectName("Meine Tolle Wurst.JPG", 1234), "1234-meine-tolle-wurst.jpg");
  assert.equal(safeMediaObjectName("???", 1234), "1234-bild.jpg");
  assert.equal(mediaUsageKey("/media/abc?width=800"), "/media/abc");
});

test("Lebtig percentage focal points map to the shared normalized metadata", () => {
  const metadata = toCmsImageMetadata({
    id: "media-1",
    url: "/media/media-1",
    storage_path: "1234-bild.jpg",
    alt: " Metzgerei-Theke ",
    title: "Theke",
    caption: null,
    focal_x: 25,
    focal_y: 75,
    created_at: "2026-08-18T00:00:00.000Z",
  });
  assert.deepEqual(metadata, {
    id: "media-1",
    url: "/media/media-1",
    altText: "Metzgerei-Theke",
    title: "Theke",
    caption: null,
    focalPoint: { x: 0.25, y: 0.75 },
  });
});
