import type { Order, OrderState } from "../../ordering/src/model.ts";

export type KdsLane = "incoming" | "planned" | "preparing" | "ready" | "archive";

export function laneForState(state: OrderState): KdsLane {
  switch (state) {
    case "waiting_for_acceptance":
      return "incoming";
    case "scheduled":
      return "planned";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    default:
      return "archive";
  }
}

export function shouldAlarm(order: Order): boolean {
  return order.state === "waiting_for_acceptance";
}

export const quickRejectReasons = [
  "Aktuell zu hohe Auslastung",
  "Artikel oder Zutat ausverkauft",
  "Küche schließt",
] as const;

export const quickPreparationMinutes = [15, 20, 30] as const;
export const quickDelayMinutes = [5, 10, 15] as const;
