export type PaymentMethod = "pay_on_site" | "online";

export interface PaymentProvider {
  createPayment(input: {
    orderId: string;
    amountCents: number;
    currency: "EUR";
  }): Promise<{ paymentId: string; redirectUrl?: string }>;
}
