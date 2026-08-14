import type { OrderWriter } from "../../ordering/src/checkout.ts";
import type { Order, OrderState } from "../../ordering/src/model.ts";
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
  };
}

export class SupabaseOrderWriter implements OrderWriter {
  constructor(private readonly rpcClient: RpcClient) {}

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
  items: PublicOrderStatusItem[];
}

export class SupabasePublicOrderStatusReader {
  constructor(private readonly rpcClient: RpcClient) {}

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
