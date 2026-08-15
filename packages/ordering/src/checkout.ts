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
import type { Order } from "./model.ts";

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
  /** Optional client preference. Mcello V1 accepts only pay_on_site. */
  paymentMode?: PaymentMode;
  otpChallengeId: string;
  otpCode: string;
  cart: CheckoutCartLine[];
}

export interface CatalogReader {
  getProduct(productId: string, at: string): Promise<MenuProduct | null>;
  isProductAvailable(productId: string, at: string): Promise<boolean>;
}

export interface ShopStateReader {
  getShopState(locationId: string, at: string): Promise<ShopStatusInput>;
}

export interface SlotReader {
  getSlotCapacity(locationId: string, pickupAt: string): Promise<{
    capacity: number;
    acceptedOrderCount: number;
  }>;
}

export interface OrderWriter {
  create(input: {
    locationId: string;
    source: "web";
    fulfillmentType: "pickup";
    state: "waiting_for_acceptance";
    customerFirstName: string;
    mobile: string;
    comment?: string;
    requestedPickupAt?: string | null;
    totalCents: number;
    submittedAt: string;
    payment: PaymentSnapshot;
    items: Array<{
      productId: string;
      productNameSnapshot: string;
      quantity: number;
      unitPriceCentsSnapshot: number;
      lineTotalCents: number;
      selections: ProductSelection[];
      comment?: string;
    }>;
  }): Promise<Order>;
}

export interface CheckoutDependencies {
  otp: OtpProvider;
  catalog: CatalogReader;
  shop: ShopStateReader;
  slots: SlotReader;
  orders: OrderWriter;
  payments?: PaymentPolicy;
  notifications?: OrderNotificationProvider;
  statusUrlFor(order: Order): string;
}

export class CheckoutError extends Error {
  readonly code:
    | "INVALID_CUSTOMER"
    | "EMPTY_CART"
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

export async function submitVerifiedPickupOrder(
  request: CheckoutRequest,
  deps: CheckoutDependencies,
  nowIso = new Date().toISOString(),
): Promise<Order> {
  const firstName = normalizeName(request.firstName);
  const mobile = normalizeMobile(request.mobile);
  validateCustomer(firstName, mobile);

  if (request.cart.length === 0 || request.cart.some((line) => line.quantity < 1 || line.quantity > 99)) {
    throw new CheckoutError("EMPTY_CART", "Warenkorb ist leer oder ungültig.");
  }

  const otp = await deps.otp.verifyOtp({
    challengeId: request.otpChallengeId,
    code: request.otpCode,
    mobile,
  });
  if (!otp.verified) {
    throw new CheckoutError("OTP_FAILED", "OTP-Verifikation fehlgeschlagen.");
  }

  const shopInput = await deps.shop.getShopState(request.locationId, nowIso);
  const shop = resolveShopCapabilities(shopInput);
  if (!shop.canSubmitOrder) {
    throw new CheckoutError(
      "SHOP_NOT_ACCEPTING",
      `Online-Bestellungen sind aktuell nicht möglich (${shop.reason}).`,
    );
  }

  const availabilityAt = request.requestedPickupAt ?? nowIso;
  if (request.requestedPickupAt) {
    const pickupEpoch = Date.parse(request.requestedPickupAt);
    const nowEpoch = Date.parse(nowIso);
    if (!Number.isFinite(pickupEpoch) || pickupEpoch <= nowEpoch) {
      throw new CheckoutError("INVALID_PICKUP_TIME", "Der gewünschte Abholzeitpunkt muss in der Zukunft liegen.");
    }

    const futureShop = resolveShopCapabilities(
      await deps.shop.getShopState(request.locationId, request.requestedPickupAt),
    );
    if (!futureShop.canSubmitOrder) {
      throw new CheckoutError(
        "INVALID_PICKUP_TIME",
        "Der gewünschte Abholzeitpunkt liegt außerhalb der verfügbaren Bestellzeit.",
      );
    }

    const slot = await deps.slots.getSlotCapacity(request.locationId, request.requestedPickupAt);
    if (!hasSlotCapacity(slot)) {
      throw new CheckoutError("SLOT_FULL", "Der gewünschte Abholslot ist ausgelastet.");
    }
  }

  let totalCents = 0;
  const items: Parameters<OrderWriter["create"]>[0]["items"] = [];

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
      selections: line.selections,
      comment: line.comment?.trim() || undefined,
    });
  }

  let payment: PaymentSnapshot;
  try {
    payment = await (deps.payments ?? new PayOnSiteOnlyPaymentPolicy()).prepare({
      requestedMode: request.paymentMode,
      amountCents: totalCents,
      currency: "EUR",
    });
  } catch (error) {
    if (error instanceof PaymentBoundaryError) {
      throw new CheckoutError("PAYMENT_NOT_AVAILABLE", error.message);
    }
    throw error;
  }

  const order = await deps.orders.create({
    locationId: request.locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile,
    comment: request.comment?.trim() || undefined,
    requestedPickupAt: request.requestedPickupAt ?? null,
    totalCents,
    submittedAt: nowIso,
    payment,
    items,
  });

  if (deps.notifications) {
    await deps.notifications.sendOrderNotification({
      kind: "received",
      mobile,
      orderId: order.id,
      statusUrl: deps.statusUrlFor(order),
    }).catch(() => undefined);
  }

  return order;
}
