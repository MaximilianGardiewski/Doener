import { DevOrderNotificationProvider } from "../../packages/notifications/src/dev-order-notifications.ts";
import { SupabaseNotificationOutbox } from "../../packages/supabase-adapter/src/notification-outbox.ts";

export function startLocalNotificationWorker({ rpcFactory, publicBaseUrl }) {
  let running = false;
  const provider = new DevOrderNotificationProvider((record) => {
    console.log("[DEV NOTIFICATION]", {
      kind: record.kind,
      mobile: record.mobile,
      orderId: record.orderId,
      statusUrl: record.statusUrl,
    });
  });

  async function tick() {
    if (running) return;
    const rpc = rpcFactory();
    if (!rpc) return;
    running = true;
    try {
      const result = await new SupabaseNotificationOutbox(rpc).processBatch({
        provider,
        statusUrlForToken: (token) => `${publicBaseUrl}/status.html?token=${encodeURIComponent(token)}`,
      });
      if (result.sent || result.failed) console.log("[NOTIFICATION OUTBOX]", result);
    } catch (error) {
      console.error("Notification outbox worker failed", error);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, 2_000);
  timer.unref?.();
  setTimeout(tick, 2_000).unref?.();
  return () => clearInterval(timer);
}
