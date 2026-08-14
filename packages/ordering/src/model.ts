export type OrderState =
  | "draft"
  | "awaiting_verification"
  | "waiting_for_acceptance"
  | "scheduled"
  | "preparing"
  | "ready"
  | "completed"
  | "rejected"
  | "cancelled";

export type FulfillmentType = "pickup" | "delivery";
export type OrderSource = "web" | "counter" | "table";

export interface Order {
  id: string;
  locationId: string;
  source: OrderSource;
  fulfillmentType: FulfillmentType;
  state: OrderState;
  customerFirstName?: string;
  mobile?: string;
  comment?: string;
  requestedPickupAt?: string | null;
  acceptedPickupAt?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  rejectionReason?: string | null;
  totalCents: number;
}

export interface OrderEvent {
  orderId: string;
  type: string;
  at: string;
  metadata?: Record<string, unknown>;
}

export interface TransitionResult {
  order: Order;
  event: OrderEvent;
}

function transition(
  order: Order,
  next: OrderState,
  type: string,
  at: string,
  patch: Partial<Order> = {},
  metadata?: Record<string, unknown>,
): TransitionResult {
  return {
    order: { ...order, ...patch, state: next },
    event: { orderId: order.id, type, at, metadata },
  };
}

export function requestVerification(order: Order, at: string): TransitionResult {
  if (order.state !== "draft") throw new Error("Only draft orders can request verification");
  return transition(order, "awaiting_verification", "verification_requested", at);
}

export function verifyOrder(order: Order, at: string): TransitionResult {
  if (order.state !== "awaiting_verification") throw new Error("Order is not awaiting verification");
  return transition(order, "waiting_for_acceptance", "order_submitted", at, {
    verifiedAt: at,
    submittedAt: at,
  });
}

export function acceptOrder(
  order: Order,
  at: string,
  acceptedPickupAt: string,
): TransitionResult {
  if (order.state !== "waiting_for_acceptance") throw new Error("Order cannot be accepted from current state");
  const scheduled = Boolean(order.requestedPickupAt);
  return transition(
    order,
    scheduled ? "scheduled" : "preparing",
    "order_accepted",
    at,
    { acceptedAt: at, acceptedPickupAt },
    { acceptedPickupAt },
  );
}

export function customerCancel(order: Order, at: string): TransitionResult {
  if (order.state !== "waiting_for_acceptance") {
    throw new Error("Customer cancellation is only allowed before acceptance");
  }
  return transition(order, "cancelled", "customer_cancelled", at, { cancelledAt: at });
}

export function rejectOrder(
  order: Order,
  at: string,
  reason: string,
): TransitionResult {
  if (order.state !== "waiting_for_acceptance") throw new Error("Only pending orders can be rejected");
  return transition(order, "rejected", "order_rejected", at, {
    rejectedAt: at,
    rejectionReason: reason,
  });
}

export function activateScheduledOrder(order: Order, at: string): TransitionResult {
  if (order.state !== "scheduled") throw new Error("Order is not scheduled");
  return transition(order, "preparing", "scheduled_order_activated", at);
}

export function delayOrder(
  order: Order,
  at: string,
  minutes: number,
): TransitionResult {
  if (!["scheduled", "preparing"].includes(order.state)) {
    throw new Error("Only accepted active/scheduled orders can be delayed");
  }
  if (!order.acceptedPickupAt) throw new Error("Accepted pickup time is missing");
  const nextTime = new Date(Date.parse(order.acceptedPickupAt) + minutes * 60_000).toISOString();
  return transition(order, order.state, "pickup_eta_delayed", at, {
    acceptedPickupAt: nextTime,
  }, { minutes, acceptedPickupAt: nextTime });
}

export function markReady(order: Order, at: string): TransitionResult {
  if (order.state !== "preparing") throw new Error("Only preparing orders can become ready");
  return transition(order, "ready", "order_ready", at, { readyAt: at });
}

export function completeOrder(order: Order, at: string): TransitionResult {
  if (order.state !== "ready") throw new Error("Only ready orders can be completed");
  return transition(order, "completed", "order_completed", at, { completedAt: at });
}

export function isCustomerEditable(order: Order): boolean {
  return order.state === "waiting_for_acceptance";
}

export function hasAcceptanceTimedOut(
  order: Order,
  now: string,
  timeoutMinutes = 5,
): boolean {
  if (order.state !== "waiting_for_acceptance" || !order.submittedAt) return false;
  return Date.parse(now) - Date.parse(order.submittedAt) >= timeoutMinutes * 60_000;
}
