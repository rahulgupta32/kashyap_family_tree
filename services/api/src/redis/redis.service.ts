import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  async onModuleInit() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const isTest = process.env.NODE_ENV === 'test';

    this.logger.log(`Connecting to Redis at ${host}:${port}...`);

    this.client = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => {
        if (isTest && times > 3) {
          // In unit test mode without live Redis, stop retrying quickly
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
      maxRetriesPerRequest: isTest ? 2 : 20,
      enableOfflineQueue: !isTest,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log(`Connected to Redis successfully at ${host}:${port}.`);
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`Redis client error: ${err.message}`);
    });

    try {
      await this.client.connect();
    } catch (err: any) {
      this.isConnected = false;
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`FATAL: Redis connection failed in production: ${err.message}`, err.stack);
        throw new Error(`Production Redis connection failed: ${err.message}`);
      } else {
        this.logger.warn(`Redis connection failed in non-production: ${err.message}. Degraded mode.`);
      }
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.isConnected = false;
      this.logger.log('Redis client disconnected.');
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null && this.client.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    if (ttlSeconds && ttlSeconds > 0) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    let result: number;
    if (ttlSeconds && ttlSeconds > 0) {
      const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } else {
      result = await this.client.setnx(key, value);
      return result === 1;
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.client || !this.isConnected || keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    if (!this.client || !this.isConnected) return 0;
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client || !this.isConnected) return 0;
    return this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) return -2;
    return this.client.ttl(key);
  }

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis is not connected for eval script execution');
    }
    return (this.client as any).eval(script, numKeys, ...args);
  }

  async flushall(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FLUSHALL is strictly forbidden in production');
    }
    if (this.client && this.isConnected) {
      await this.client.flushall();
    }
  }
}
