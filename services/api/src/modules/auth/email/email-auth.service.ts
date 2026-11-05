import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { DatabaseService } from '../../../database/database.service';
import { UserRepository, UserAccountRecord } from '../../../database/repositories/user.repository';
import { SessionRepository } from '../../../database/repositories/session.repository';
import { AuditOutboxRepository } from '../../../database/repositories/audit-outbox.repository';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { EmailProvider } from './email-provider';
import { VerifyEmailOtpDto } from './email.dto';

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  // No Gmail dot/plus rewriting. Only conservative ASCII mailbox identities are supported.
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) {
    throw new BadRequestException('Enter a valid email address');
  }
  return email;
}

@Injectable()
export class EmailAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditOutboxRepository,
    private readonly auth: AuthService,
    private readonly provider: EmailProvider,
  ) {}

  private digest(value: string): string {
    const key = process.env.EMAIL_OTP_HASH_KEY || '';
    if (key.length < 32) throw new ServiceUnavailableException('Email authentication is unavailable');
    return createHmac('sha256', key).update(value).digest('hex');
  }

  private async freshOwner(owner: AuthenticatedUser): Promise<void> {
    const session = await this.sessions.findById(owner.sessionId);
    if (!session || session.user_id !== owner.id || session.revoked_at ||
        new Date(session.expires_at).getTime() <= Date.now() ||
        !session.authenticated_at || Date.now() - new Date(session.authenticated_at).getTime() > 300000) {
      throw new ForbiddenException('Sign in again before linking an email');
    }
  }

  async request(emailInput: string, ip: string, owner?: AuthenticatedUser) {
    if (!this.redis.isReady()) throw new ServiceUnavailableException('Email authentication is unavailable');
    if (owner) await this.freshOwner(owner);
    const email = normalizeEmail(emailInput);
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const destination = this.digest('destination:' + email);
    const challenge = {
      email, hash: this.digest(id + ':' + code), owner: owner?.id || '',
      session: owner?.sessionId || '', attempts: 0, ready: false,
    };
    // Destination and account budgets apply across challenge resends. The ingress
    // guard independently bounds requests by the trusted network address.
    const accepted = await this.redis.eval(`
      if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
      for i = 2,3 do
        local count = redis.call('INCR', KEYS[i])
        if count == 1 then redis.call('EXPIRE', KEYS[i], 3600) end
        if count > 10 then return 0 end
      end
      redis.call('SET', KEYS[1], '1', 'EX', 60)
      local previous = redis.call('GET', KEYS[4])
      if previous then redis.call('DEL', 'email:challenge:' .. previous) end
      redis.call('SET', KEYS[4], ARGV[1], 'EX', 300)
      redis.call('SET', KEYS[5], ARGV[2], 'EX', 300)
      return 1
    `, 5, 'email:cooldown:' + destination, 'email:budget:' + destination,
    'email:account-budget:' + (owner?.id || destination),
    'email:active:' + destination, 'email:challenge:' + id, id, JSON.stringify(challenge));
    const response = { otpSessionId: id, expiresInSeconds: 300, cooldownSeconds: 60,
      message: 'If delivery is available, a verification code will arrive shortly.' };
    if (Number(accepted) !== 1) return response;
    await this.audit.recordAuditIntent({
      action: 'EMAIL_OTP_REQUESTED', entityType: 'auth_challenge', entityId: id,
      actorId: owner?.id, ipAddress: ip,
    });
    try {
      await this.provider.sendCode(email, code, id);
      await this.redis.eval(`
        local value = redis.call('GET', KEYS[1])
        if not value then return 0 end
        local challenge = cjson.decode(value)
        challenge.ready = true
        redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
        return 1
      `, 1, 'email:challenge:' + id);
    } catch {
      await this.redis.eval("return redis.call('DEL', KEYS[1])", 1, 'email:challenge:' + id);
      await this.audit.recordAuditIntent({
        action: 'EMAIL_DELIVERY_FAILED', entityType: 'auth_challenge', entityId: id,
        actorId: owner?.id, ipAddress: ip,
      });
      // Same response as success. No account or provider details are exposed.
    }
    return response;
  }

  async verify(dto: VerifyEmailOtpDto, ip: string, agent: string, owner?: AuthenticatedUser) {
    if (!this.redis.isReady()) throw new ServiceUnavailableException('Email authentication is unavailable');
    if (owner) await this.freshOwner(owner);
    const result = await this.redis.eval(`
      local value = redis.call('GET', KEYS[1])
      if not value then return '' end
      local challenge = cjson.decode(value)
      if not challenge.ready or challenge.owner ~= ARGV[2] or challenge.session ~= ARGV[3] then return '' end
      challenge.attempts = challenge.attempts + 1
      if challenge.hash ~= ARGV[1] then
        if challenge.attempts >= 5 then redis.call('DEL', KEYS[1])
        else redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL') end
        return ''
      end
      redis.call('DEL', KEYS[1])
      return challenge.email
    `, 1, 'email:challenge:' + dto.otpSessionId, this.digest(dto.otpSessionId + ':' + dto.code),
    owner?.id || '', owner?.sessionId || '');
    if (typeof result !== 'string' || !result) {
      await this.audit.recordAuditIntent({ action: 'EMAIL_OTP_REJECTED', entityType: 'auth_challenge',
        entityId: dto.otpSessionId, actorId: owner?.id, ipAddress: ip });
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    const user = await this.db.transaction(async tx => {
      // Serialize identity creation/linking without allowing email matches to merge accounts.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [result]);
      const existing = await tx.query('SELECT user_id FROM account_email_identities WHERE email=$1', [result]);
      let accountId = existing.rows[0]?.user_id;
      if (owner) {
        const lockedSession = await tx.query('SELECT * FROM user_sessions WHERE id=$1 FOR UPDATE', [owner.sessionId]);
        const current = lockedSession.rows[0];
        if (!current || current.user_id !== owner.id || current.revoked_at ||
            new Date(current.expires_at).getTime() <= Date.now() || !current.authenticated_at ||
            Date.now() - new Date(current.authenticated_at).getTime() > 300000) {
          throw new ForbiddenException('Sign in again before linking an email');
        }
        await tx.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE', [owner.id]);
        const account = await this.users.findById(owner.id, tx);
        if (!account || !account.is_active || account.is_suspended) throw new ForbiddenException('Account unavailable');
        const linked = await tx.query('SELECT email FROM account_email_identities WHERE user_id=$1', [owner.id]);
        if ((accountId && accountId !== owner.id) || (linked.rows[0] && linked.rows[0].email !== result)) {
          throw new ForbiddenException('This email cannot be linked. Sign in using an existing method.');
        }
        accountId = owner.id;
      }
      if (!accountId) {
        const created = await tx.query('INSERT INTO user_accounts (phone_number) VALUES (NULL) RETURNING id');
        accountId = created.rows[0].id;
      }
      await tx.query(`INSERT INTO account_email_identities(email,user_id) VALUES ($1,$2)
        ON CONFLICT(email) DO NOTHING`, [result, accountId]);
      const account = await this.users.findById(accountId, tx);
      if (!account || !account.is_active || account.is_suspended) throw new ForbiddenException('Account unavailable');
      await this.audit.recordAuditIntent({
        action: owner ? 'EMAIL_IDENTITY_LINKED' : 'EMAIL_OTP_VERIFIED',
        entityType: 'user_accounts', entityId: accountId, actorId: accountId,
        newValue: { challengeId: dto.otpSessionId }, ipAddress: ip,
      }, tx);
      return account as UserAccountRecord;
    });
    if (owner) return { linked: true };
    return this.auth.createVerifiedSession(user, { otpSessionId: dto.otpSessionId, code: dto.code, deviceInfo: dto.deviceInfo },
      ip, agent, dto.otpSessionId);
  }
}
