export type OtpChannel = "whatsapp" | "sms";

export interface OtpChallenge {
  challengeId: string;
  channel: OtpChannel;
  expiresAt: string;
}

export interface OtpProvider {
  sendOtp(input: {
    mobile: string;
    preferredChannel: OtpChannel;
    fallbackChannel?: OtpChannel;
  }): Promise<OtpChallenge>;

  verifyOtp(input: {
    challengeId: string;
    code: string;
    /** Must match the number the challenge was originally issued for. */
    mobile: string;
  }): Promise<{ verified: boolean }>;
}

export type OrderNotificationKind =
  | "received"
  | "accepted"
  | "delayed"
  | "ready"
  | "rejected"
  | "cancelled";

export interface OrderNotificationProvider {
  sendOrderNotification(input: {
    kind: OrderNotificationKind;
    mobile: string;
    orderId: string;
    statusUrl: string;
    messageData?: Record<string, string | number>;
  }): Promise<void>;
}
