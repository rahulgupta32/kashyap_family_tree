import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, SmsSendResult } from './sms-provider.interface';

interface SentMessageRecord {
  phoneNumber: string;
  otp: string;
  sentAt: number;
}

@Injectable()
export class TestSmsProviderAdapter implements ISmsProvider {
  private readonly logger = new Logger(TestSmsProviderAdapter.name);
  private static sentMessages: SentMessageRecord[] = [];

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY CONFIGURATION: TestSmsProviderAdapter is strictly prohibited in production mode.');
    }
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY CONFIGURATION: TestSmsProviderAdapter cannot execute in production.');
    }

    const record: SentMessageRecord = {
      phoneNumber,
      otp,
      sentAt: Date.now(),
    };

    // Keep up to 100 recent messages for test inspection
    TestSmsProviderAdapter.sentMessages.push(record);
    if (TestSmsProviderAdapter.sentMessages.length > 100) {
      TestSmsProviderAdapter.sentMessages.shift();
    }

    // Do NOT log the OTP value in production; in test mode, debug log without exposing plain credentials in high-level logs
    this.logger.debug(`[TEST_SMS] Simulated OTP delivery to ${phoneNumber.slice(0, 7)}*** (Length: ${otp.length})`);

    return {
      success: true,
      messageId: `test_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'TestSmsProviderAdapter',
    };
  }

  /**
   * Accessible ONLY to test harnesses for automated assertions.
   * Never exposed to external HTTP callers or normal API payloads.
   */
  getLastOtp(phoneNumber: string): string | null {
    return TestSmsProviderAdapter.getLastOtpStatic(phoneNumber);
  }

  static getLastOtpStatic(phoneNumber: string): string | null {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test OTP extraction is forbidden in production');
    }
    const matching = TestSmsProviderAdapter.sentMessages.filter((m) => m.phoneNumber === phoneNumber);
    if (matching.length === 0) return null;
    return matching[matching.length - 1].otp;
  }

  clear(): void {
    TestSmsProviderAdapter.sentMessages = [];
  }
}
