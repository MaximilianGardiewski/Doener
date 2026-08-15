import type { AnalyticsEventInput, OrderAnalyticsContext } from "../../analytics/src/events.ts";
import type { RpcClient } from "./rest-rpc.ts";

export class SupabaseAnalyticsRecorder {
  private readonly rpcClient: RpcClient;

  constructor(rpcClient: RpcClient) {
    this.rpcClient = rpcClient;
  }

  async record(event: AnalyticsEventInput): Promise<void> {
    await this.rpcClient.rpc("server_record_analytics_event", {
      _payload: event,
      _order_id: null,
    });
  }

  async recordOrderSubmitted(
    locationId: string,
    orderId: string,
    context: OrderAnalyticsContext,
  ): Promise<void> {
    await this.rpcClient.rpc("server_record_analytics_event", {
      _payload: {
        ...context,
        locationId,
        eventName: "order_submitted",
      },
      _order_id: orderId,
    });
  }
}
