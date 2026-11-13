import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '@kashyap/contracts';
import { RedisService } from '../../../redis/redis.service';

/** Shared public-auth admission runs before validation, audit writes and credential work. */
@Injectable()
export class OtpIngressGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Isolated fixtures perform many synthetic logins on one loopback address.
    if (process.env.NODE_ENV === 'test') return true;
    const request = context.switchToHttp().getRequest();
    // Express derives ip from the socket unless trusted proxies are explicitly
    // configured. Never read a caller-supplied X-Forwarded-For header here.
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    if (!this.redis.isReady()) throw this.unavailable();
    let count: number, retryAfter: number;
    try {
      const result = await this.redis.eval(`
        local attempts = redis.call('INCR', KEYS[1])
        local ttl = redis.call('TTL', KEYS[1])
        if attempts == 1 or ttl < 0 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
          ttl = tonumber(ARGV[1])
        end
        return {attempts, ttl}
      `, 1, `otp:ratelimit:ingress:${ip}`, 60) as [number, number];
      count = Number(result[0]); retryAfter = Number(result[1]);
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isInteger(retryAfter) || retryAfter < 0 || retryAfter > 60) throw new Error('Invalid limiter state');
    } catch { throw this.unavailable(); }
    if (count > 60) {
      context.switchToHttp().getResponse().setHeader('Retry-After', String(Math.max(1, retryAfter)));
      throw new HttpException({
        errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many authentication attempts from this network. Please wait and try again.',
        messageNepali: 'यस नेटवर्कबाट धेरै प्रमाणीकरण प्रयास भएका छन्। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private unavailable() {
    return new ServiceUnavailableException({
      errorCode: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Authentication admission is temporarily unavailable. Please try again later.',
      messageNepali: 'प्रमाणीकरण सेवा हाल अनुपलब्ध छ। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।',
    });
  }
}
