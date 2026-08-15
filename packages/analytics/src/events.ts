export const publicAnalyticsEventNames = [
  "menu_view",
  "product_view",
  "recommendation_impression",
  "recommendation_select",
  "cart_add",
  "checkout_started",
] as const;

export type PublicAnalyticsEventName = typeof publicAnalyticsEventNames[number];
export type AnalyticsEventName = PublicAnalyticsEventName | "order_submitted";
export type AnalyticsSurface = "product_modal" | "cart";

export interface AnalyticsEventInput {
  clientEventId: string;
  anonymousSessionId: string;
  locationId: string;
  eventName: PublicAnalyticsEventName;
  occurredAt: string;
  productId?: string;
  sourceProductId?: string;
  crossSellRuleId?: string;
  surface?: AnalyticsSurface;
}

export interface OrderAnalyticsContext {
  clientEventId: string;
  anonymousSessionId: string;
  occurredAt: string;
}

export interface AnalyticsSink {
  record(event: AnalyticsEventInput): Promise<void>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicNames = new Set<string>(publicAnalyticsEventNames);
const surfaces = new Set<string>(["product_modal", "cart"]);

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${field} must be a UUID`);
  return value;
}

function optionalUuid(value: unknown, field: string): string | undefined {
  if (value == null || value === "") return undefined;
  return requiredUuid(value, field);
}

function occurredAt(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("occurredAt must be an ISO timestamp");
  }
  return new Date(value).toISOString();
}

function baseContext(value: unknown): OrderAnalyticsContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("analytics event must be an object");
  const input = value as Record<string, unknown>;
  return {
    clientEventId: requiredUuid(input.clientEventId, "clientEventId"),
    anonymousSessionId: requiredUuid(input.anonymousSessionId, "anonymousSessionId"),
    occurredAt: occurredAt(input.occurredAt),
  };
}

export function parseOrderAnalyticsContext(value: unknown): OrderAnalyticsContext {
  return baseContext(value);
}

export function parsePublicAnalyticsEvent(value: unknown): AnalyticsEventInput {
  const base = baseContext(value);
  const input = value as Record<string, unknown>;
  if (typeof input.eventName !== "string" || !publicNames.has(input.eventName)) {
    throw new Error("eventName is not public");
  }

  const eventName = input.eventName as PublicAnalyticsEventName;
  const productId = optionalUuid(input.productId, "productId");
  const sourceProductId = optionalUuid(input.sourceProductId, "sourceProductId");
  const crossSellRuleId = optionalUuid(input.crossSellRuleId, "crossSellRuleId");
  const surface = input.surface == null || input.surface === ""
    ? undefined
    : String(input.surface) as AnalyticsSurface;
  if (surface && !surfaces.has(surface)) throw new Error("surface is invalid");

  if (["product_view", "cart_add", "recommendation_impression", "recommendation_select"].includes(eventName)
      && !productId) {
    throw new Error(`${eventName} requires productId`);
  }
  const isRecommendation = eventName === "recommendation_impression" || eventName === "recommendation_select";
  if (isRecommendation && (!sourceProductId || !surface)) {
    throw new Error(`${eventName} requires sourceProductId and surface`);
  }
  if (!isRecommendation && (sourceProductId || crossSellRuleId || surface)) {
    throw new Error(`${eventName} cannot carry recommendation attribution`);
  }
  if (["menu_view", "checkout_started"].includes(eventName) && productId) {
    throw new Error(`${eventName} cannot carry productId`);
  }

  return {
    ...base,
    locationId: requiredUuid(input.locationId, "locationId"),
    eventName,
    productId,
    sourceProductId,
    crossSellRuleId,
    surface,
  };
}
