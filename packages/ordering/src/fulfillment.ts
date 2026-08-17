import type { FulfillmentType } from "./model.ts";

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Future delivery eligibility input. Exact street-address handling belongs to
 * the eventual delivery feature; D006 only requires PLZ/radius zone capability.
 */
export interface DeliveryDestination {
  postalCode?: string;
  point?: GeoPoint;
}

export type DeliveryZoneRule =
  | {
      id: string;
      kind: "postal_code";
      postalCodes: readonly string[];
    }
  | {
      id: string;
      kind: "radius";
      center: GeoPoint;
      radiusMeters: number;
    };

export interface DeliveryEligibility {
  eligible: boolean;
  matchedZoneId?: string;
}

/** Provider-neutral boundary for a later PLZ/radius delivery-zone engine. */
export interface DeliveryZoneResolver {
  resolve(input: {
    locationId: string;
    destination: DeliveryDestination;
  }): Promise<DeliveryEligibility>;
}

export interface PreparedFulfillment {
  type: FulfillmentType;
}

export interface FulfillmentPolicy {
  prepare(input: { requestedType?: FulfillmentType }): Promise<PreparedFulfillment>;
}

export class FulfillmentBoundaryError extends Error {
  readonly code: "DELIVERY_DISABLED";

  constructor() {
    super("Lieferung ist in Mcello V1 nicht verfügbar.");
    this.name = "FulfillmentBoundaryError";
    this.code = "DELIVERY_DISABLED";
  }
}

/**
 * Mcello V1 is pickup-only. A future delivery policy can replace this boundary
 * and use DeliveryZoneResolver without changing the order state model.
 */
export class PickupOnlyFulfillmentPolicy implements FulfillmentPolicy {
  async prepare(input: { requestedType?: FulfillmentType }): Promise<PreparedFulfillment> {
    if (input.requestedType === "delivery") throw new FulfillmentBoundaryError();
    return { type: "pickup" };
  }
}
