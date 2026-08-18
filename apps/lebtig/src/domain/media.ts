import {
  COMMON_IMAGE_MIME_TYPES,
  normalizeFocalPoint,
  validateImageUpload,
  type CmsImageMetadata,
} from "@business-web/cms";

export const LEBTIG_MEDIA_BUCKET = "media";
export const LEBTIG_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const LEBTIG_MEDIA_ALT_MAX_LENGTH = 180;
export const LEBTIG_MEDIA_MIME_TYPES = COMMON_IMAGE_MIME_TYPES;

export interface LebtigMediaItem {
  id: string;
  url: string;
  storage_path: string | null;
  alt: string;
  title: string | null;
  caption: string | null;
  focal_x: number;
  focal_y: number;
  created_at: string;
}

export interface LebtigMediaUploadCandidate {
  mimeType: string;
  byteSize: number;
  altText: string;
}

export function validateLebtigMediaUpload(candidate: LebtigMediaUploadCandidate) {
  return validateImageUpload(candidate, {
    allowedMimeTypes: LEBTIG_MEDIA_MIME_TYPES,
    maxBytes: LEBTIG_MEDIA_MAX_BYTES,
    requireAltText: true,
    maxAltTextLength: LEBTIG_MEDIA_ALT_MAX_LENGTH,
  });
}

export function mediaUrlFor(id: string): string {
  return `/media/${encodeURIComponent(id)}`;
}

export function mediaUsageKey(url: string): string {
  return url.split("?")[0] || url;
}

export function safeMediaObjectName(originalName: string, nowMs = Date.now()): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "jpg";
  const base = originalName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${nowMs}-${base || "bild"}.${ext}`;
}

export function toCmsImageMetadata(item: LebtigMediaItem): CmsImageMetadata {
  return {
    id: item.id,
    url: item.url,
    altText: item.alt.trim(),
    title: item.title,
    caption: item.caption,
    focalPoint: normalizeFocalPoint({
      x: item.focal_x / 100,
      y: item.focal_y / 100,
    }),
  };
}
