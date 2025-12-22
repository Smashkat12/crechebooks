import { defineConfig, devices } from '@playwright/test';

/**
 * CrecheBooks Web Application - Playwright E2E Configuration
 * Comprehensive testing for all application pages and functionality
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3003',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'PORT=3003 NEXTAUTH_URL=http://localhost:3003 NEXT_PUBLIC_ENABLE_DEV_LOGIN=true pnpm dev',
    url: 'http://localhost:3003',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
