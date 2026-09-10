import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ISmsProvider, SmsSendResult } from './sms-provider.interface';

@Injectable()
export class SparrowSmsProviderAdapter implements ISmsProvider {
  private readonly logger = new Logger(SparrowSmsProviderAdapter.name);

  async sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult> {
    const token = process.env.SPARROW_SMS_TOKEN;
    const identity = process.env.SPARROW_SMS_IDENTITY || 'Kashyap';

    if (!token) {
      const blockerMsg =
        'SMS Gateway Activation Blocker: SPARROW_SMS_TOKEN is not configured. Live SMS dispatch is blocked pending commercial gateway contract and credentials (HG-007 Gate).';
      this.logger.error(blockerMsg);

      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(blockerMsg);
      }

      return {
        success: false,
        provider: 'SparrowSMS',
        error: blockerMsg,
      };
    }

    const messageText = `Your Kashyap Adhikari Family Tree verification code is ${otp}. Valid for 5 minutes. Do not share.`;

    try {
      const params = new URLSearchParams({
        token,
        from: identity,
        to: phoneNumber.replace(/^\+/, ''),
        text: messageText,
      });

      const response = await fetch('http://api.sparrowsms.com/v2/sms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = (await response.json()) as any;

      if (response.ok && data.response_code === 200) {
        return {
          success: true,
          messageId: data.message_id || `sparrow_${Date.now()}`,
          provider: 'SparrowSMS',
        };
      } else {
        this.logger.error(`Sparrow SMS API error: ${JSON.stringify(data)}`);
        return {
          success: false,
          provider: 'SparrowSMS',
          error: data.response || 'SMS Gateway error',
        };
      }
    } catch (err: any) {
      this.logger.error(`Failed to send SMS via Sparrow SMS: ${err.message}`, err.stack);
      return {
        success: false,
        provider: 'SparrowSMS',
        error: err.message,
      };
    }
  }
}
