import {
  isPublishedAt,
  type PublicationStatus,
} from "@business-web/cms";

export type LunchItem = {
  id: string;
  week_id: string;
  weekday: number;
  dish: string;
  description: string | null;
  price: number | null;
  allergens: string | null;
  image_url: string | null;
  sort: number;
};

export type LunchWeek = {
  id: string;
  week_start: string;
  week_end: string;
  status: PublicationStatus;
  publish_at: string | null;
  note: string | null;
  updated_at: string;
  lunch_items?: LunchItem[];
};

export type OfferItem = {
  id: string;
  week_id: string;
  product: string;
  unit: string | null;
  price: number | null;
  old_price: number | null;
  highlight: boolean;
  image_url: string | null;
  sort: number;
};

export type OfferWeek = {
  id: string;
  week_start: string;
  week_end: string;
  status: PublicationStatus;
  publish_at: string | null;
  title: string | null;
  updated_at: string;
  offer_items?: OfferItem[];
};

export type NewsPost = {
  id: string;
  slug: string;
  title: string;
  teaser: string | null;
  content: string | null;
  image_url: string | null;
  tags: string[];
  status: PublicationStatus;
  publish_at: string | null;
  start_at: string | null;
  end_at: string | null;
  updated_at: string;
};

export type Recipe = {
  id: string;
  slug: string;
  title: string;
  image_url: string | null;
  servings: string | null;
  intro: string | null;
  ingredients: { amount?: string; item: string }[];
  steps: string[];
  tips: string | null;
  seo_description: string | null;
  status: PublicationStatus;
  publish_at: string | null;
  updated_at: string;
};

export type PageBlock = Record<string, unknown> & { type: string };

export type CmsPage = {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  seo_description: string | null;
  status: PublicationStatus;
  show_in_nav: boolean;
  nav_order: number;
  blocks: PageBlock[];
  publish_at: string | null;
  updated_at: string;
};

export function isLebtigPublished(
  item: {
    status: PublicationStatus;
    publish_at?: string | null;
    start_at?: string | null;
    end_at?: string | null;
  },
  nowIso: string,
): boolean {
  return isPublishedAt({
    status: item.status,
    publishAt: item.publish_at ?? null,
    visibleFrom: item.start_at ?? null,
    visibleUntil: item.end_at ?? null,
  }, nowIso);
}
