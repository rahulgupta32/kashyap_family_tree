import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { newDb, IMemoryDb } from 'pg-mem';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private memDb: IMemoryDb | null = null;
  private isMemoryDb = false;

  async onModuleInit() {
    const dbUrl = process.env.DATABASE_URL;
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
    const dbUser = process.env.DB_USER || 'kashyap_user';
    const dbPassword = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    const dbName = process.env.DB_NAME || 'kashyap_db';

    if (process.env.USE_REAL_POSTGRES === 'true' || process.env.NODE_ENV === 'production') {
      this.logger.log(`Connecting to PostgreSQL at ${dbHost}:${dbPort}/${dbName}...`);
      this.pool = new Pool({
        connectionString: dbUrl,
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      try {
        const client = await this.pool.connect();
        this.logger.log(' Connected to PostgreSQL database successfully.');
        client.release();
        this.isMemoryDb = false;
      } catch (err: any) {
        this.logger.warn(`Could not connect to live PostgreSQL (${err.message}). Falling back to in-process SQL engine.`);
        this.initMemoryDb();
      }
    } else {
      this.logger.log('Initializing in-process PostgreSQL SQL engine (pg-mem) for automated testing...');
      this.initMemoryDb();
    }
  }

  private initMemoryDb() {
    this.memDb = newDb();
    this.isMemoryDb = true;

    // Register PostgreSQL extensions & custom functions in pg-mem
    this.memDb.public.registerFunction({
      name: 'uuid_generate_v4',
      returns: this.memDb.public.getType('text' as any) || (null as any),
      implementation: () => 'uuid-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now(),
    });

    const pgAdapter = this.memDb.adapters.createPg();
    this.pool = new pgAdapter.Pool() as unknown as Pool;
    this.logger.log('In-process PostgreSQL SQL engine initialized.');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database pool disconnected.');
    }
  }

  async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    text: string,
    params?: I,
  ): Promise<QueryResult<R>> {
    if (!this.pool) {
      throw new Error('Database pool is not initialized');
    }
    const start = Date.now();
    try {
      const res = await this.pool.query<R>(text, params);
      const duration = Date.now() - start;
      if (duration > 100) {
        this.logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}...`);
      }
      return res;
    } catch (err: any) {
      this.logger.error(`Database Query Error: ${err.message} | Query: ${text}`, err.stack);
      throw err;
    }
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database pool is not initialized');
    }
    return this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  getIsMemoryDb(): boolean {
    return this.isMemoryDb;
  }
}
