export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface ISmsProvider {
  sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult>;
}
