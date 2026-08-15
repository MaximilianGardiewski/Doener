const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class LocationScopeError extends Error {
  readonly code = "LOCATION_SCOPE_MISMATCH";

  constructor() {
    super("Requested location does not match the configured application location");
    this.name = "LocationScopeError";
  }
}

/**
 * Provider-neutral location boundary for an application that intentionally
 * exposes exactly one location. A future location selector can replace this
 * resolver without changing ordering/catalog contracts that already carry a
 * locationId.
 */
export class SingleLocationContext {
  readonly locationId: string;

  constructor(locationId: string) {
    if (!uuidPattern.test(locationId)) throw new Error("Configured locationId must be a UUID");
    this.locationId = locationId;
  }

  resolve(requestedLocationId?: string | null): string {
    if (requestedLocationId != null && requestedLocationId !== this.locationId) {
      throw new LocationScopeError();
    }
    return this.locationId;
  }
}
