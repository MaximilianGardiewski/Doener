import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_IMAGE_MIME_TYPES,
  normalizeFocalPoint,
  validateImageUpload,
} from "../src/media.ts";

const policy = {
  allowedMimeTypes: COMMON_IMAGE_MIME_TYPES,
  maxBytes: 5 * 1024 * 1024,
  maxAltTextLength: 250,
};

test("common image policy accepts the portable image formats", () => {
  for (const mimeType of COMMON_IMAGE_MIME_TYPES) {
    assert.deepEqual(validateImageUpload({
      mimeType,
      byteSize: 1024,
      altText: "Produktfoto",
    }, policy), { valid: true, errors: [] });
  }
});

test("image policy rejects unsupported types size violations and missing alt text", () => {
  const result = validateImageUpload({
    mimeType: "image/gif",
    byteSize: 6 * 1024 * 1024,
    altText: "   ",
  }, policy);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    "unsupported_mime_type",
    "invalid_byte_size",
    "alt_text_required",
  ]);
});

test("focal points are normalized to the portable 0..1 range", () => {
  assert.deepEqual(normalizeFocalPoint({ x: -0.2, y: 1.4 }), { x: 0, y: 1 });
  assert.deepEqual(normalizeFocalPoint({ x: Number.NaN, y: 0.25 }), { x: 0.5, y: 0.25 });
});
