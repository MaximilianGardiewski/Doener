export const COMMON_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type CommonImageMimeType = (typeof COMMON_IMAGE_MIME_TYPES)[number];

export interface MediaFocalPoint {
  x: number;
  y: number;
}

export interface CmsImageMetadata {
  id: string;
  url: string;
  altText: string;
  title?: string | null;
  caption?: string | null;
  focalPoint?: MediaFocalPoint | null;
}

export interface ImageUploadCandidate {
  mimeType: string;
  byteSize: number;
  altText: string;
}

export interface ImageUploadPolicy {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  requireAltText?: boolean;
  maxAltTextLength?: number;
}

export interface ImageUploadValidation {
  valid: boolean;
  errors: string[];
}

export function validateImageUpload(
  candidate: ImageUploadCandidate,
  policy: ImageUploadPolicy,
): ImageUploadValidation {
  const errors: string[] = [];
  if (!policy.allowedMimeTypes.includes(candidate.mimeType)) {
    errors.push("unsupported_mime_type");
  }
  if (!Number.isSafeInteger(candidate.byteSize) || candidate.byteSize < 1 || candidate.byteSize > policy.maxBytes) {
    errors.push("invalid_byte_size");
  }
  const altText = candidate.altText.trim();
  if (policy.requireAltText !== false && altText.length === 0) {
    errors.push("alt_text_required");
  }
  if (policy.maxAltTextLength && altText.length > policy.maxAltTextLength) {
    errors.push("alt_text_too_long");
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeFocalPoint(input: MediaFocalPoint): MediaFocalPoint {
  const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
  return { x: clamp(input.x), y: clamp(input.y) };
}
