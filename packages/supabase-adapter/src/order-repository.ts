import type { PreparedPickupOrderDraft } from "../../ordering/src/checkout.ts";
import type { OrderWriter } from "../../ordering/src/checkout.ts";
import type { Order, OrderState } from "../../ordering/src/model.ts";
import type { PaymentMethod, PaymentMode, PaymentStatus } from "../../payments/src/contracts.ts";
import type { ProductSelection } from "../../menu-engine/src/model.ts";
import type { RpcClient } from "./rest-rpc.ts";

interface DbOrder {
  id: string;
  public_token: string;
  order_number: number | string;
  location_id: string;
  source: "web" | "counter" | "table";
  fulfillment: "pickup" | "delivery";
  state: OrderState;
  customer_first_name: string;
  mobile: string;
  comment?: string | null;
  requested_pickup_at?: string | null;
  accepted_pickup_at?: string | null;
  total_cents: number;
  payment_mode: PaymentMode;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_currency: string;
  payment_provider_reference?: string | null;
  submitted_at?: string | null;
  accepted_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  rejection_reason?: string | null;
}

function unwrapOne<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0]! : value;
}

export function mapDbOrder(row: DbOrder): Order {
  return {
    id: row.id,
    publicToken: row.public_token,
    orderNumber: Number(row.order_number),
    locationId: row.location_id,
    source: row.source,
    fulfillmentType: row.fulfillment,
    state: row.state,
    customerFirstName: row.customer_first_name,
    mobile: row.mobile,
    comment: row.comment ?? undefined,
    requestedPickupAt: row.requested_pickup_at ?? null,
    acceptedPickupAt: row.accepted_pickup_at ?? null,
    submittedAt: row.submitted_at ?? null,
    acceptedAt: row.accepted_at ?? null,
    readyAt: row.ready_at ?? null,
    completedAt: row.completed_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    totalCents: row.total_cents,
    payment: {
      mode: row.payment_mode,
      method: row.payment_method,
      status: row.payment_status,
      currency: row.payment_currency,
      amountCents: row.total_cents,
      providerReference: row.payment_provider_reference ?? null,
    },
  };
}

export class SupabaseOrderWriter implements OrderWriter {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async create(input: Parameters<OrderWriter["create"]>[0]): Promise<Order> {
    const response = await this.rpcClient.rpc<DbOrder | DbOrder[]>("server_create_verified_order", {
      _payload: input,
    });
    return mapDbOrder(unwrapOne(response));
  }
}

export interface PublicOrderStatusItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  comment?: string | null;
  options: Array<{
    group: string;
    option: string;
    priceDeltaCents: number;
  }>;
}

export interface PublicOrderPaymentStatus {
  mode: PaymentMode;
  method: PaymentMethod;
  status: PaymentStatus;
  currency: string;
}

export interface PublicOrderStatus {
  id: string;
  orderNumber: number;
  state: OrderState;
  customerFirstName: string;
  requestedPickupAt?: string | null;
  acceptedPickupAt?: string | null;
  submittedAt?: string | null;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  rejectionReason?: string | null;
  totalCents: number;
  payment: PublicOrderPaymentStatus;
  items: PublicOrderStatusItem[];
}

export interface PendingOrderEditItem {
  productId: string;
  quantity: number;
  comment?: string | null;
  selections: ProductSelection[];
}

/** Server-only context. Do not forward orderId/locationId to the browser. */
export interface PendingOrderEditContext {
  orderId: string;
  orderNumber: number;
  state: "waiting_for_acceptance";
  locationId: string;
  customerFirstName: string;
  comment?: string | null;
  requestedPickupAt?: string | null;
  items: PendingOrderEditItem[];
}

export interface PublicPendingOrderEditDraft {
  orderNumber: number;
  state: "waiting_for_acceptance";
  customerFirstName: string;
  comment?: string | null;
  requestedPickupAt?: string | null;
  items: PendingOrderEditItem[];
}

export class SupabasePublicOrderStatusReader {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async get(publicToken: string): Promise<PublicOrderStatus | null> {
    const data = await this.rpcClient.rpc<PublicOrderStatus | null>("get_public_order_status", {
      _public_token: publicToken,
    });
    return data ?? null;
  }

  async cancelPending(publicToken: string): Promise<PublicOrderStatus> {
    return this.rpcClient.rpc<PublicOrderStatus>("customer_cancel_pending_order", {
      _public_token: publicToken,
    });
  }
}

export class SupabasePendingOrderEditor {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async getContext(publicToken: string): Promise<PendingOrderEditContext> {
    return this.rpcClient.rpc<PendingOrderEditContext>("server_get_pending_order_edit_context", {
      _public_token: publicToken,
    });
  }

  async replace(publicToken: string, prepared: PreparedPickupOrderDraft): Promise<PublicOrderStatus> {
    return this.rpcClient.rpc<PublicOrderStatus>("server_replace_pending_order", {
      _public_token: publicToken,
      _payload: {
        comment: prepared.comment,
        requestedPickupAt: prepared.requestedPickupAt,
        items: prepared.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selections: item.selections,
          comment: item.comment,
        })),
      },
    });
  }
}
