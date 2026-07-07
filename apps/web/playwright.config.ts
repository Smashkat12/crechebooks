import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * CrecheBooks Web Application - Playwright E2E Configuration
 * Comprehensive testing for all application pages and functionality
 *
 * Two run modes:
 *  - Local dev (default): starts `pnpm dev` on port 3003, baseURL http://localhost:3003
 *  - CI / prebuilt: set PLAYWRIGHT_BASE_URL (e.g. http://localhost:3001) to point
 *    at an already-running server. When PLAYWRIGHT_BASE_URL is set, this config
 *    skips the built-in webServer entirely — the CI job is responsible for
 *    starting API+Web and waiting for them to be ready.
 *
 * Authentication strategy:
 *  - `globalSetup` logs in once against the dev-login endpoint and writes
 *    storage state to `e2e/.auth/user.json`.
 *  - All tests inherit that state via `use.storageState`. The dev-login rate
 *    limit (5/15min per IP) is only hit once per full run.
 *  - Specs that need a clean/unauthenticated state (e.g. auth.spec.ts) override
 *    per-test with `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3003';
const skipWebServer = !!process.env.PLAYWRIGHT_BASE_URL;
const authFile = path.resolve(__dirname, 'e2e', '.auth', 'user.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : 'html',
  globalSetup: require.resolve('./e2e/global-setup.ts'),

  use: {
    baseURL,
    storageState: authFile,
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

  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command:
            'PORT=3003 NEXTAUTH_URL=http://localhost:3003 NEXT_PUBLIC_ENABLE_DEV_LOGIN=true pnpm dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120 * 1000,
        },
      }),
});
