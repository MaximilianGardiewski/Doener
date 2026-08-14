import type { OrderNotificationProvider, OrderNotificationKind } from "./contracts.ts";

export interface DevNotificationRecord {
  kind: OrderNotificationKind;
  mobile: string;
  orderId: string;
  statusUrl: string;
  messageData?: Record<string, string | number>;
}

export class DevOrderNotificationProvider implements OrderNotificationProvider {
  readonly #onNotification?: (record: DevNotificationRecord) => void;

  constructor(onNotification?: (record: DevNotificationRecord) => void) {
    this.#onNotification = onNotification;
  }

  async sendOrderNotification(input: DevNotificationRecord): Promise<void> {
    this.#onNotification?.(input);
  }
}
