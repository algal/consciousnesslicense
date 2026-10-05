import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:8788',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run db:migrate -- --persist-to .wrangler/browser-tests && npm run dev -- --port 8788 --persist-to .wrangler/browser-tests',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: false,
    env: { WRANGLER_LOG_PATH: '/tmp/consciousness-browser-logs', WRANGLER_SEND_METRICS: 'false' },
    timeout: 30000,
  },
});
