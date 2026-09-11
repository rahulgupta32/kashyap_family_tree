import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.API_PORT || '3000';
const ADMIN_PORT = process.env.ADMIN_PORT || '3002';
const DB_PORT = process.env.DB_PORT || '5434';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_USER = process.env.DB_USER || 'kashyap_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
const DB_NAME = process.env.DB_NAME || 'kashyap_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '6379';

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${ADMIN_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node services/api/dist/src/main.js',
      url: `http://localhost:${API_PORT}/api/docs`,
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      env: {
        PORT: API_PORT,
        NODE_ENV: 'test',
        USE_REAL_POSTGRES: 'true',
        DB_HOST,
        DB_PORT,
        DB_USER,
        DB_PASSWORD,
        DB_NAME,
        REDIS_HOST,
        REDIS_PORT,
        SEED_ADMINS: 'true',
        JWT_SECRET: 'test_jwt_secret_key_minimum_32_chars_long_12345',
        JWT_EXPIRY: '15m',
        REFRESH_EXPIRY: '30d',
        SPARROW_SMS_TOKEN: 'test_sparrow_token',
      },
    },
    {
      command: `pnpm --filter @kashyap/admin start -p ${ADMIN_PORT}`,
      url: `http://localhost:${ADMIN_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      env: {
        PORT: ADMIN_PORT,
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
