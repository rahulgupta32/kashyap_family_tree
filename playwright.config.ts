import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { execSync } from 'child_process';

function getDatabaseHost(): string {
  if (process.env.DB_HOST && process.env.DB_HOST !== '127.0.0.1' && process.env.DB_HOST !== 'localhost') {
    return process.env.DB_HOST;
  }
  if (process.platform === 'win32') {
    try {
      const wslIp = execSync('wsl hostname -I', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split(' ')[0];
      if (wslIp && /^\d+\.\d+\.\d+\.\d+$/.test(wslIp)) {
        return wslIp;
      }
    } catch (e) {}
  }
  return process.env.DB_HOST || '127.0.0.1';
}

const API_PORT = process.env.API_PORT || '3000';
const ADMIN_PORT = process.env.ADMIN_PORT || '3002';
const DB_PORT = process.env.DB_PORT || '5434';
const DB_HOST = getDatabaseHost();
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
    baseURL: `http://127.0.0.1:${ADMIN_PORT}`,
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
      command: fs.existsSync(path.resolve(__dirname, 'services/api/dist/src/main.js'))
        ? 'node services/api/dist/src/main.js'
        : 'node services/api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      reuseExistingServer: false,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
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
        CORS_ORIGINS: `http://localhost:${ADMIN_PORT},http://127.0.0.1:${ADMIN_PORT},http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002`,
      },
    },
    {
      command: `pnpm --filter @kashyap/admin start -p ${ADMIN_PORT}`,
      url: `http://127.0.0.1:${ADMIN_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: ADMIN_PORT,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
