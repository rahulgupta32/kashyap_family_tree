import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export abstract class EmailProvider {
  abstract sendCode(email: string, code: string, requestId: string): Promise<void>;
}

/** Only the secret store supplies EMAIL_API_KEY. No provider response is logged. */
@Injectable()
export class BrevoEmailProvider extends EmailProvider {
  async sendCode(email: string, code: string, requestId: string): Promise<void> {
    const key = process.env.EMAIL_API_KEY;
    const sender = process.env.EMAIL_SENDER;
    if (!key || !sender) throw new ServiceUnavailableException('Email delivery is unavailable');
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Nepali Bansawali', email: sender },
          to: [{ email }],
          subject: 'नेपाली वंशावली — Verification code',
          textContent: 'तपाईंको प्रमाणीकरण कोड / Your verification code: ' + code +
            '\n५ मिनेटमा म्याद सकिन्छ। / Expires in five minutes. Never share this code.',
          headers: { 'X-Mailin-custom': 'challenge:' + requestId },
        }),
      });
      if (!response.ok) throw new Error('Email rejected');
    } catch {
      throw new ServiceUnavailableException('Email delivery is unavailable');
    }
  }
}

/** Injectable capture for isolated tests. Never exposed through an HTTP endpoint. */
@Injectable()
export class CaptureEmailProvider extends EmailProvider {
  private readonly codes = new Map<string, string>();
  async sendCode(email: string, code: string): Promise<void> {
    if (!['development', 'test'].includes(process.env.NODE_ENV || '')) {
      throw new ServiceUnavailableException('Email capture is disabled');
    }
    if (this.codes.size >= 100) this.codes.delete(this.codes.keys().next().value!);
    this.codes.set(email, code);
  }
  takeCode(email: string): string | undefined {
    const code = this.codes.get(email);
    this.codes.delete(email);
    return code;
  }
}
