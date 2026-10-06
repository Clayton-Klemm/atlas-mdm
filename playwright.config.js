import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8092',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/dev.js',
    url: 'http://127.0.0.1:8092/health/ready',
    reuseExistingServer: false,
    env: {
      PORT: '8092',
      ERP_PORT: '8093',
      ERP_URL: 'http://127.0.0.1:8093',
      DB_PATH: ':memory:',
      ERP_DB_PATH: ':memory:',
    },
    timeout: 20000,
  },
});
