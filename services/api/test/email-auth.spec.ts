import { BrevoEmailProvider, CaptureEmailProvider } from '../src/modules/auth/email/email-provider';
import { normalizeEmail } from '../src/modules/auth/email/email-auth.service';

describe('Email identity and delivery boundaries', () => {
  afterEach(() => { jest.restoreAllMocks(); delete process.env.EMAIL_API_KEY; delete process.env.EMAIL_SENDER; });

  it('normalizes case and whitespace, preserving plus and dotted mailbox identity', () => {
    expect(normalizeEmail('  Member.Name+tree@EXAMPLE.ORG ')).toBe('member.name+tree@example.org');
    expect(normalizeEmail('membername@example.org')).not.toBe(normalizeEmail('member.name@example.org'));
  });

  it.each(['a@', 'a\nb@example.org', 'é@example.org', 'a@example.org\r\nBcc: victim@example.org'])('rejects invalid mailbox %p', email => {
    expect(() => normalizeEmail(email)).toThrow();
  });

  it('does not send with absent provider configuration', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    await expect(new BrevoEmailProvider().sendCode('member@example.org', '123456', 'test')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the official provider endpoint with a bounded timeout and masks failure details', async () => {
    process.env.EMAIL_API_KEY = 'synthetic-api-key';
    process.env.EMAIL_SENDER = 'login@example.org';
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    await expect(new BrevoEmailProvider().sendCode('member@example.org', '123456', 'test')).rejects.toThrow('Email delivery is unavailable');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect(fetcher.mock.calls[0][1]?.signal).toBeDefined();
  });

  it('disables capture in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(new CaptureEmailProvider().sendCode('member@example.org', '123456')).rejects.toThrow();
    } finally { process.env.NODE_ENV = previous; }
  });
});
