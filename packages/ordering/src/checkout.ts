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

export interface ShopReader {
  getShopState(locationId: string, at: string): Promise<ShopStatusInput>;
}

export interface SlotReader {
  getSlotCapacity(locationId: string, pickupAt: string, options?: { excludeOrderId?: string }): Promise<{
    capacity: number;
    acceptedOrderCount: number;
  }>;
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
    requestedPickupAt: string | null;
    totalCents: number;
    submittedAt: string;
    payment: PaymentSnapshot;
    items: PreparedPickupOrderItem[];
  }): Promise<Order>;
}

export interface CheckoutDependencies {
  otp: OtpProvider;
  catalog: CatalogReader;
  shop: ShopReader;
  slots: SlotReader;
  orders: OrderWriter;
  notifications?: OrderNotificationProvider;
  fulfillment?: FulfillmentPolicy;
  payments?: PaymentPolicy;
  statusUrlFor(order: Order): string;
}

export class CheckoutError extends Error {
  readonly code:
    | "INVALID_CUSTOMER"
    | "EMPTY_CART"
    | "OTP_FAILED"
    | "FULFILLMENT_NOT_AVAILABLE"
    | "PAYMENT_NOT_AVAILABLE"
    | "SHOP_NOT_ACCEPTING"
    | "PRODUCT_NOT_AVAILABLE"
    | "INVALID_CONFIGURATION"
    | "INVALID_QUANTITY"
    | "INVALID_PICKUP_TIME"
    | "SLOT_FULL";

  constructor(code: CheckoutError["code"], message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

function assertCustomer(firstName: string, mobile: string) {
  if (!firstName || firstName.length > 80) {
    throw new CheckoutError("INVALID_CUSTOMER", "Vorname fehlt oder ist zu lang.");
  }
  if (!/^\+?[0-9][0-9\s/-]{6,24}$/.test(mobile)) {
    throw new CheckoutError("INVALID_CUSTOMER", "Mobilnummer ist ungültig.");
  }
}

function assertCart(cart: CheckoutCartLine[]) {
  if (!cart.length) throw new CheckoutError("EMPTY_CART", "Warenkorb ist leer.");
}

function safePickupTime(requestedPickupAt: string | null | undefined, nowIso: string): string | null {
  if (!requestedPickupAt) return null;
  const pickup = Date.parse(requestedPickupAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(pickup) || pickup <= now) {
    throw new CheckoutError("INVALID_PICKUP_TIME", "Abholzeit muss in der Zukunft liegen.");
  }
  return new Date(pickup).toISOString();
}

function configuredShopAcceptsOrders(input: ShopStatusInput) {
  const state = resolveShopCapabilities(input);
  return state.canSubmitOrder;
}

export async function preparePickupOrderDraft(
  request: PickupDraftRequest,
  deps: Pick<CheckoutDependencies, "catalog" | "shop" | "slots">,
  nowIso = new Date().toISOString(),
): Promise<PreparedPickupOrderDraft> {
  assertCart(request.cart);
  const pickupAt = safePickupTime(request.requestedPickupAt, nowIso);
  const evaluationAt = pickupAt ?? nowIso;
  const shopState = await deps.shop.getShopState(request.locationId, evaluationAt);
  if (!configuredShopAcceptsOrders(shopState)) {
    throw new CheckoutError("SHOP_NOT_ACCEPTING", "Online-Bestellungen sind aktuell nicht möglich.");
  }

  if (pickupAt) {
    const slot = await deps.slots.getSlotCapacity(request.locationId, pickupAt, {
      excludeOrderId: request.excludeOrderId,
    });
    if (!hasSlotCapacity(slot.capacity, slot.acceptedOrderCount)) {
      throw new CheckoutError("SLOT_FULL", "Der gewünschte Abholslot ist voll.");
    }
  }

  let totalCents = 0;
  const items: PreparedPickupOrderItem[] = [];
  for (const line of request.cart) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      throw new CheckoutError("INVALID_QUANTITY", "Ungültige Menge.");
    }
    const product = await deps.catalog.getProduct(line.productId, evaluationAt);
    if (!product || !product.orderableOnline) {
      throw new CheckoutError("PRODUCT_NOT_AVAILABLE", "Produkt ist online nicht bestellbar.");
    }
    if (!(await deps.catalog.isProductAvailable(product.id, evaluationAt))) {
      throw new CheckoutError("PRODUCT_NOT_AVAILABLE", "Produkt ist aktuell nicht verfügbar.");
    }

    try {
      validateConfiguration(product, line.selections);
    } catch (error) {
      throw new CheckoutError(
        "INVALID_CONFIGURATION",
        error instanceof Error ? error.message : "Ungültige Konfiguration.",
      );
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
      comment: line.comment,
    });
  }

  return {
    locationId: request.locationId,
    comment: request.comment,
    requestedPickupAt: pickupAt,
    totalCents,
    items,
  };
}

export async function submitVerifiedPickupOrder(
  request: CheckoutRequest,
  deps: CheckoutDependencies,
  nowIso = new Date().toISOString(),
): Promise<Order> {
  const firstName = request.firstName.trim();
  const mobile = request.mobile.trim();
  assertCustomer(firstName, mobile);
  assertCart(request.cart);

  let fulfillment;
  try {
    fulfillment = await (deps.fulfillment ?? new PickupOnlyFulfillmentPolicy()).resolve({
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
