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

export const homepageSectionKinds = [
  "hero",
  "quick_order",
  "story_team",
  "news_events",
  "gallery",
  "contact",
] as const;

export type HomepageSectionKind = (typeof homepageSectionKinds)[number];

const requiredHomepageSections = new Set<HomepageSectionKind>(["hero", "quick_order"]);

export function normalizeHomepageSections(
  sections: readonly HomepageSection[],
): HomepageSection[] {
  const byKind = new Map(sections.map((section) => [section.kind, section]));

  return homepageSectionKinds
    .map((kind, index) => {
      const existing = byKind.get(kind);
      return {
        id: existing?.id ?? kind,
        kind,
        enabled: requiredHomepageSections.has(kind) ? true : existing?.enabled !== false,
        position: Number.isFinite(existing?.position) ? Number(existing?.position) : (index + 1) * 10,
      } satisfies HomepageSection;
    })
    .sort((a, b) => a.position - b.position || a.kind.localeCompare(b.kind));
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
