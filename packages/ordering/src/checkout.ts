import { resolveShopCapabilities, type ShopStatusInput } from "../../core/src/shop-status.ts";
import {
  calculateConfiguredPriceCents,
  validateConfiguration,
  type MenuProduct,
  type ProductSelection,
} from "../../menu-engine/src/model.ts";
import type { OtpProvider, OrderNotificationProvider } from "../../notifications/src/contracts.ts";
import {
  PayOnSiteOnlyPaymentPolicy,
  PaymentBoundaryError,
  type PaymentMode,
  type PaymentPolicy,
  type PaymentSnapshot,
} from "../../payments/src/contracts.ts";
import { hasSlotCapacity } from "./capacity.ts";
import {
  FulfillmentBoundaryError,
  PickupOnlyFulfillmentPolicy,
  type FulfillmentPolicy,
} from "./fulfillment.ts";
import type { FulfillmentType, Order } from "./model.ts";

export interface CheckoutCartLine {
  productId: string;
  quantity: number;
  selections: ProductSelection[];
  comment?: string;
  /** Client value is informational only. The server must never trust it. */
  clientPriceCents?: number;
}

export interface CheckoutRequest {
  locationId: string;
  firstName: string;
  mobile: string;
  comment?: string;
  requestedPickupAt?: string | null;
  /** Optional future-facing preference. Mcello V1 accepts pickup only. */
  fulfillmentType?: FulfillmentType;
  /** Optional client preference. Mcello V1 accepts only pay_on_site. */
  paymentMode?: PaymentMode;
  otpChallengeId: string;
  otpCode: string;
  cart: CheckoutCartLine[];
}

export interface PickupDraftRequest {
  locationId: string;
  comment?: string;
  requestedPickupAt?: string | null;
  cart: CheckoutCartLine[];
  /** Pending-order edits exclude the order itself from application slot occupancy. */
  excludeOrderId?: string;
}

export interface PreparedPickupOrderItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCentsSnapshot: number;
  lineTotalCents: number;
  /** Reserved snapshot for future weighted capacity. V1 does not consume it. */
  effortWeightSnapshot?: number;
  selections: ProductSelection[];
  comment?: string;
}

export interface PreparedPickupOrderDraft {
  locationId: string;
  comment?: string;
  requestedPickupAt: string | null;
  totalCents: number;
  items: PreparedPickupOrderItem[];
}

export interface CatalogReader {
  getProduct(productId: string, at: string): Promise<MenuProduct | null>;
  isProductAvailable(productId: string, at: string): Promise<boolean>;
}

export interface ShopStateReader {
  getShopState(locationId: string, at: string): Promise<ShopStatusInput>;
}

export interface SlotReader {
  getSlotCapacity(locationId: string, pickupAt: string, excludeOrderId?: string): Promise<{
    capacity: number;
    acceptedOrderCount: number;
  }>;
}

export interface PickupPreparationDependencies {
  catalog: CatalogReader;
  shop: ShopStateReader;
  slots: SlotReader;
}

export interface OrderWriter {
  create(input: {
    locationId: string;
    source: "web";
    fulfillmentType: FulfillmentType;
    state: "waiting_for_acceptance";
    customerFirstName: string;
    mobile: string;
    comment?: string;
    requestedPickupAt?: string | null;
    totalCents: number;
    submittedAt: string;
    payment: PaymentSnapshot;
    items: PreparedPickupOrderItem[];
  }): Promise<Order>;
}

export interface CheckoutDependencies extends PickupPreparationDependencies {
  otp: OtpProvider;
  orders: OrderWriter;
  fulfillment?: FulfillmentPolicy;
  payments?: PaymentPolicy;
  notifications?: OrderNotificationProvider;
  statusUrlFor(order: Order): string;
}

export class CheckoutError extends Error {
  readonly code:
    | "INVALID_CUSTOMER"
    | "EMPTY_CART"
    | "FULFILLMENT_NOT_AVAILABLE"
    | "OTP_FAILED"
    | "SHOP_NOT_ACCEPTING"
    | "INVALID_PICKUP_TIME"
    | "PRODUCT_NOT_FOUND"
    | "PRODUCT_UNAVAILABLE"
    | "INVALID_CONFIGURATION"
    | "SLOT_FULL"
    | "PAYMENT_NOT_AVAILABLE";

  constructor(
    code:
      | "INVALID_CUSTOMER"
      | "EMPTY_CART"
      | "FULFILLMENT_NOT_AVAILABLE"
      | "OTP_FAILED"
      | "SHOP_NOT_ACCEPTING"
      | "INVALID_PICKUP_TIME"
      | "PRODUCT_NOT_FOUND"
      | "PRODUCT_UNAVAILABLE"
      | "INVALID_CONFIGURATION"
      | "SLOT_FULL"
      | "PAYMENT_NOT_AVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeMobile(value: string): string {
  return value.replace(/[\s()-]/g, "").trim();
}

function validateCustomer(firstName: string, mobile: string): void {
  if (firstName.length < 1 || firstName.length > 80) {
    throw new CheckoutError("INVALID_CUSTOMER", "Vorname ist erforderlich.");
  }
  if (!/^\+?[0-9]{7,18}$/.test(mobile)) {
    throw new CheckoutError("INVALID_CUSTOMER", "Mobilnummer ist ungültig.");
  }
}

function validateCartShape(cart: readonly CheckoutCartLine[]): void {
  if (cart.length === 0 || cart.some((line) => line.quantity < 1 || line.quantity > 99)) {
    throw new CheckoutError("EMPTY_CART", "Warenkorb ist leer oder ungültig.");
  }
}

/**
 * Shared authoritative application preparation for both initial checkout and
 * token-scoped pre-accept edits. PostgreSQL independently revalidates the same
 * persistence invariants inside its transaction.
 */
export async function preparePickupOrderDraft(
  request: PickupDraftRequest,
  deps: PickupPreparationDependencies,
  nowIso = new Date().toISOString(),
): Promise<PreparedPickupOrderDraft> {
  validateCartShape(request.cart);

  const shopInput = await deps.shop.getShopState(request.locationId, nowIso);
  const shop = resolveShopCapabilities(shopInput);
  if (!shop.canSubmitOrder) {
    throw new CheckoutError(
      "SHOP_NOT_ACCEPTING",
      `Online-Bestellungen sind aktuell nicht möglich (${shop.reason}).`,
    );
  }

  const requestedPickupAt = request.requestedPickupAt ?? null;
  const availabilityAt = requestedPickupAt ?? nowIso;
  if (requestedPickupAt) {
    const pickupEpoch = Date.parse(requestedPickupAt);
    const nowEpoch = Date.parse(nowIso);
    if (!Number.isFinite(pickupEpoch) || pickupEpoch <= nowEpoch) {
      throw new CheckoutError("INVALID_PICKUP_TIME", "Der gewünschte Abholzeitpunkt muss in der Zukunft liegen.");
    }

    const futureShop = resolveShopCapabilities(
      await deps.shop.getShopState(request.locationId, requestedPickupAt),
    );
    if (!futureShop.canSubmitOrder) {
      throw new CheckoutError(
        "INVALID_PICKUP_TIME",
        "Der gewünschte Abholzeitpunkt liegt außerhalb der verfügbaren Bestellzeit.",
      );
    }

    const slot = await deps.slots.getSlotCapacity(
      request.locationId,
      requestedPickupAt,
      request.excludeOrderId,
    );
    if (!hasSlotCapacity(slot)) {
      throw new CheckoutError("SLOT_FULL", "Der gewünschte Abholslot ist ausgelastet.");
    }
  }

  let totalCents = 0;
  const items: PreparedPickupOrderItem[] = [];

  for (const line of request.cart) {
    const product = await deps.catalog.getProduct(line.productId, availabilityAt);
    if (!product) {
      throw new CheckoutError("PRODUCT_NOT_FOUND", `Produkt ${line.productId} wurde nicht gefunden.`);
    }
    if (product.soldOut || !(await deps.catalog.isProductAvailable(product.id, availabilityAt))) {
      throw new CheckoutError("PRODUCT_UNAVAILABLE", `${product.name} ist zum Abholzeitpunkt nicht verfügbar.`);
    }

    const config = validateConfiguration(product, line.selections);
    if (!config.valid) {
      throw new CheckoutError("INVALID_CONFIGURATION", config.errors.join(" "));
    }

    const unitPriceCents = calculateConfiguredPriceCents(product, line.selections);
    const lineTotalCents = unitPriceCents * line.quantity;
    totalCents += lineTotalCents;
    items.push({
      productId: product.id,
      productNameSnapshot: product.name,
      quantity: line.quantity,
      unitPriceCentsSnapshot: unitPriceCents,
      lineTotalCents,
      effortWeightSnapshot: product.effortWeight,
      selections: line.selections,
      comment: line.comment?.trim() || undefined,
    });
  }

  return {
    locationId: request.locationId,
    comment: request.comment?.trim() || undefined,
    requestedPickupAt,
    totalCents,
    items,
  };
}

export async function submitVerifiedPickupOrder(
  request: CheckoutRequest,
  deps: CheckoutDependencies,
  nowIso = new Date().toISOString(),
): Promise<Order> {
  const firstName = normalizeName(request.firstName);
  const mobile = normalizeMobile(request.mobile);
  validateCustomer(firstName, mobile);
  validateCartShape(request.cart);

  let fulfillment;
  try {
    fulfillment = await (deps.fulfillment ?? new PickupOnlyFulfillmentPolicy()).prepare({
      requestedType: request.fulfillmentType,
    });
  } catch (error) {
    if (error instanceof FulfillmentBoundaryError) {
      throw new CheckoutError("FULFILLMENT_NOT_AVAILABLE", error.message);
    }
    throw error;
  }

  const otp = await deps.otp.verifyOtp({
    challengeId: request.otpChallengeId,
    code: request.otpCode,
    mobile,
  });
  if (!otp.verified) {
    throw new CheckoutError("OTP_FAILED", "OTP-Verifikation fehlgeschlagen.");
  }

  const prepared = await preparePickupOrderDraft(request, deps, nowIso);

  let payment: PaymentSnapshot;
  try {
    payment = await (deps.payments ?? new PayOnSiteOnlyPaymentPolicy()).prepare({
      requestedMode: request.paymentMode,
      amountCents: prepared.totalCents,
      currency: "EUR",
    });
  } catch (error) {
    if (error instanceof PaymentBoundaryError) {
      throw new CheckoutError("PAYMENT_NOT_AVAILABLE", error.message);
    }
    throw error;
  }

  const order = await deps.orders.create({
    ...prepared,
    source: "web",
    fulfillmentType: fulfillment.type,
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile,
    submittedAt: nowIso,
    payment,
  });

  if (deps.notifications) {
    await deps.notifications.sendOrderNotification({
      kind: "received",
      mobile,
      orderId: order.id,
      statusUrl: deps.statusUrlFor(order),
      idempotencyKey: `order:${order.id}:received`,
    }).catch(() => undefined);
  }

  return order;
}
