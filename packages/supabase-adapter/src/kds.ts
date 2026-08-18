import type { Order } from "@business-web/ordering";
import { mapDbOrder } from "./order-repository.ts";
import type { RpcClient } from "./rest-rpc.ts";

export class SupabaseKdsOperations {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  accept(orderId: string, acceptedPickupAt: string): Promise<Order> {
    return this.orderRpc("staff_accept_order", {
      _order_id: orderId,
      _accepted_pickup_at: acceptedPickupAt,
    });
  }

  acceptRequestedSlot(orderId: string): Promise<Order> {
    return this.orderRpc("staff_accept_requested_slot", { _order_id: orderId });
  }

  activateScheduled(orderId: string): Promise<Order> {
    return this.orderRpc("staff_activate_scheduled_order", { _order_id: orderId });
  }

  markReady(orderId: string): Promise<Order> {
    return this.orderRpc("staff_mark_order_ready", { _order_id: orderId });
  }

  complete(orderId: string): Promise<Order> {
    return this.orderRpc("staff_complete_order", { _order_id: orderId });
  }

  reject(orderId: string, reason: string): Promise<Order> {
    return this.orderRpc("staff_reject_order", { _order_id: orderId, _reason: reason });
  }

  delay(orderId: string, minutes: number): Promise<Order> {
    return this.orderRpc("staff_delay_order", { _order_id: orderId, _minutes: minutes });
  }

  async setShopOverride(
    locationId: string,
    override: "auto" | "rush" | "force_closed" | "pause" | "today_closed",
    operatorMessage?: string,
  ): Promise<unknown> {
    return this.rpcClient.rpc("staff_set_shop_override", {
      _location_id: locationId,
      _override: override,
      _operator_message: operatorMessage ?? null,
    });
  }

  private async orderRpc(functionName: string, args: Record<string, unknown>): Promise<Order> {
    const response = await this.rpcClient.rpc<any>(functionName, args);
    const row = Array.isArray(response) ? response[0] : response;
    return mapDbOrder(row);
  }
}

export interface PostgresChangePayload<Row = Record<string, unknown>> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Row;
  old: Partial<Row>;
}

export interface RealtimeChannelLike {
  on(
    type: "postgres_changes",
    filter: {
      event: "*" | "INSERT" | "UPDATE" | "DELETE";
      schema: string;
      table: string;
      filter?: string;
    },
    callback: (payload: PostgresChangePayload) => void,
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string) => void): RealtimeChannelLike;
  unsubscribe(): Promise<unknown> | unknown;
}

export interface RealtimeClientLike {
  channel(name: string, config?: Record<string, unknown>): RealtimeChannelLike;
}

/**
 * KDS realtime stays behind this tiny port so the domain does not depend on
 * supabase-js. In the browser, pass an authenticated Supabase Realtime client.
 */
export function subscribeToKdsOrders(input: {
  client: RealtimeClientLike;
  locationId: string;
  onChange: (payload: PostgresChangePayload) => void;
  onStatus?: (status: string) => void;
}): () => Promise<void> {
  const channel = input.client
    .channel(`kds:${input.locationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `location_id=eq.${input.locationId}`,
      },
      input.onChange,
    )
    .subscribe(input.onStatus);

  return async () => {
    await channel.unsubscribe();
  };
}
