import type { OrderNotificationKind, OrderNotificationProvider } from "../../notifications/src/contracts.ts";
import type { RpcClient } from "./rest-rpc.ts";

export interface NotificationOutboxJob {
  id: string;
  order_id: string;
  kind: OrderNotificationKind;
  preferred_channel: "whatsapp" | "sms";
  fallback_channel?: "whatsapp" | "sms" | null;
  mobile_snapshot: string;
  public_token_snapshot: string;
  payload: Record<string, string | number | null>;
  dedupe_key: string;
  attempt_count: number;
}

export class SupabaseNotificationOutbox {
  readonly #rpc: RpcClient;

  constructor(rpc: RpcClient) {
    this.#rpc = rpc;
  }

  async processBatch(input: {
    provider: OrderNotificationProvider;
    statusUrlForToken: (token: string) => string;
    limit?: number;
  }): Promise<{ sent: number; failed: number }> {
    const jobs = await this.#rpc.rpc<NotificationOutboxJob[]>("server_claim_notification_outbox", {
      _limit: input.limit ?? 20,
    });
    let sent = 0;
    let failed = 0;

    for (const job of jobs ?? []) {
      try {
        await input.provider.sendOrderNotification({
          kind: job.kind,
          mobile: job.mobile_snapshot,
          orderId: job.order_id,
          statusUrl: input.statusUrlForToken(job.public_token_snapshot),
          idempotencyKey: job.dedupe_key,
          messageData: Object.fromEntries(
            Object.entries(job.payload ?? {}).filter(([, value]) => value !== null) as Array<
              [string, string | number]
            >,
          ),
        });
        await this.#rpc.rpc("server_mark_notification_sent", { _id: job.id });
        sent += 1;
      } catch (error) {
        await this.#rpc.rpc("server_mark_notification_failed", {
          _id: job.id,
          _error: error instanceof Error ? error.message : String(error),
        });
        failed += 1;
      }
    }

    return { sent, failed };
  }
}
