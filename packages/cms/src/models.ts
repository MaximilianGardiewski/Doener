export type PublicationStatus = "draft" | "scheduled" | "published" | "archived";

export interface PublicationWindow {
  status: PublicationStatus;
  publishAt?: string | null;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
}

export function isPublishedAt(item: PublicationWindow, nowIso: string): boolean {
  if (item.status !== "published") return false;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return false;

  const publishAt = item.publishAt ? Date.parse(item.publishAt) : -Infinity;
  const visibleFrom = item.visibleFrom ? Date.parse(item.visibleFrom) : -Infinity;
  const visibleUntil = item.visibleUntil ? Date.parse(item.visibleUntil) : Infinity;

  return publishAt <= now && visibleFrom <= now && now <= visibleUntil;
}

export function filterPublishedAt<T extends PublicationWindow>(
  items: readonly T[],
  nowIso: string,
): T[] {
  return items.filter((item) => isPublishedAt(item, nowIso));
}

export type EditorialKind = "news" | "event" | "special" | "press";
export type GalleryCategory = "food" | "venue" | "team" | "events";

export interface EditorialPost {
  id: string;
  kind: EditorialKind;
  title: string;
  body: string;
  imageId?: string | null;
  pinned: boolean;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
}

export interface GalleryItem {
  id: string;
  mediaId: string;
  category: GalleryCategory;
  featured: boolean;
  caption?: string | null;
}

export interface HomepageSection {
  id: string;
  kind:
    | "hero"
    | "quick_order"
    | "news_events"
    | "story_team"
    | "gallery"
    | "contact";
  enabled: boolean;
  position: number;
}

export function visibleEditorialPosts(
  posts: readonly EditorialPost[],
  nowIso: string,
): EditorialPost[] {
  const now = Date.parse(nowIso);
  return posts
    .filter((post) => {
      const from = post.visibleFrom ? Date.parse(post.visibleFrom) : -Infinity;
      const until = post.visibleUntil ? Date.parse(post.visibleUntil) : Infinity;
      return from <= now && now <= until;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}
