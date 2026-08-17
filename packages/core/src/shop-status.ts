export type ShopOverride =
  | "auto"
  | "rush"
  | "force_open"
  | "force_closed"
  | "pause"
  | "today_closed";

export type ShopStatus =
  | "open"
  | "rush"
  | "closed"
  | "paused"
  | "order_cutoff";

export interface ShopStatusInput {
  scheduledOpen: boolean;
  override?: ShopOverride;
  rushExtraMinutes?: number;
  minutesUntilScheduledClose?: number | null;
  orderCutoffMinutes: number;
  operatorMessage?: string | null;
}

export interface ShopCapabilities {
  status: ShopStatus;
  canBrowse: true;
  canConfigure: true;
  canBuildCart: true;
  canSubmitOrder: boolean;
  reason:
    | "open"
    | "rush"
    | "scheduled_closed"
    | "forced_closed"
    | "today_closed"
    | "paused"
    | "order_cutoff";
  rushExtraMinutes?: number;
  operatorMessage?: string | null;
}

export function resolveShopCapabilities(
  input: ShopStatusInput,
): ShopCapabilities {
  const override = input.override ?? "auto";

  if (override === "pause") {
    return {
      status: "paused",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: false,
      reason: "paused",
      operatorMessage: input.operatorMessage,
    };
  }

  if (override === "force_closed") {
    return {
      status: "closed",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: false,
      reason: "forced_closed",
      operatorMessage: input.operatorMessage,
    };
  }

  if (override === "today_closed") {
    return {
      status: "closed",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: false,
      reason: "today_closed",
      operatorMessage: input.operatorMessage,
    };
  }

  const effectivelyOpen =
    override === "force_open" ? true : input.scheduledOpen;

  if (!effectivelyOpen) {
    return {
      status: "closed",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: false,
      reason: "scheduled_closed",
      operatorMessage: input.operatorMessage,
    };
  }

  if (
    override !== "force_open" &&
    input.minutesUntilScheduledClose != null &&
    input.minutesUntilScheduledClose <= input.orderCutoffMinutes
  ) {
    return {
      status: "order_cutoff",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: false,
      reason: "order_cutoff",
      operatorMessage: input.operatorMessage,
    };
  }

  if (override === "rush") {
    return {
      status: "rush",
      canBrowse: true,
      canConfigure: true,
      canBuildCart: true,
      canSubmitOrder: true,
      reason: "rush",
      rushExtraMinutes: input.rushExtraMinutes ?? 0,
      operatorMessage: input.operatorMessage,
    };
  }

  return {
    status: "open",
    canBrowse: true,
    canConfigure: true,
    canBuildCart: true,
    canSubmitOrder: true,
    reason: "open",
    operatorMessage: input.operatorMessage,
  };
}
