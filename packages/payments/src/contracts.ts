export type PaymentMode = "pay_on_site" | "online";
export type PaymentMethod = "cash_or_card" | "provider";
export type PaymentStatus = "due_on_site" | "pending" | "authorized" | "paid" | "failed" | "refunded";

export interface PaymentSnapshot {
  mode: PaymentMode;
  method: PaymentMethod;
  status: PaymentStatus;
  currency: string;
  amountCents: number;
  providerReference?: string | null;
}

export interface PreparePaymentInput {
  /** Raw external input is accepted as string so the policy validates runtime payloads fail-closed. */
  requestedMode?: PaymentMode | string;
  amountCents: number;
  currency?: string;
}

export interface PaymentPolicy {
  prepare(input: PreparePaymentInput): Promise<PaymentSnapshot>;
}

export interface OnlinePaymentProvider {
  createCheckout(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    returnUrl: string;
  }): Promise<{
    providerReference: string;
    redirectUrl: string;
  }>;
}

export class PaymentBoundaryError extends Error {
  readonly code:
    | "ONLINE_PAYMENT_DISABLED"
    | "UNSUPPORTED_PAYMENT_MODE"
    | "INVALID_PAYMENT_AMOUNT"
    | "UNSUPPORTED_CURRENCY";

  constructor(
    code:
      | "ONLINE_PAYMENT_DISABLED"
      | "UNSUPPORTED_PAYMENT_MODE"
      | "INVALID_PAYMENT_AMOUNT"
      | "UNSUPPORTED_CURRENCY",
    message: string,
  ) {
    super(message);
    this.name = "PaymentBoundaryError";
    this.code = code;
  }
}

/**
 * Mcello V1 deliberately accepts payment only at pickup. The interface is
 * provider-neutral so a future online provider can replace this policy without
 * moving payment concerns into ordering or the browser.
 */
export class PayOnSiteOnlyPaymentPolicy implements PaymentPolicy {
  async prepare(input: PreparePaymentInput): Promise<PaymentSnapshot> {
    if (input.requestedMode === "online") {
      throw new PaymentBoundaryError(
        "ONLINE_PAYMENT_DISABLED",
        "Online-Zahlung ist in Mcello V1 nicht verfügbar.",
      );
    }
    if (input.requestedMode !== undefined && input.requestedMode !== "pay_on_site") {
      throw new PaymentBoundaryError(
        "UNSUPPORTED_PAYMENT_MODE",
        "Die angeforderte Zahlungsart wird nicht unterstützt.",
      );
    }
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
      throw new PaymentBoundaryError("INVALID_PAYMENT_AMOUNT", "Zahlungsbetrag ist ungültig.");
    }

    const currency = (input.currency || "EUR").toUpperCase();
    if (currency !== "EUR") {
      throw new PaymentBoundaryError("UNSUPPORTED_CURRENCY", "Mcello V1 unterstützt nur EUR.");
    }

    return {
      mode: "pay_on_site",
      method: "cash_or_card",
      status: "due_on_site",
      currency,
      amountCents: input.amountCents,
      providerReference: null,
    };
  }
}
