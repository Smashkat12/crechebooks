/**
 * Playwright global setup — authenticate ONCE and persist storage state.
 *
 * Why: the API's dev-login endpoint is rate-limited to ~5 attempts / 15 minutes
 * per IP. Running the suite (150+ tests) with a `login()` call in every
 * `beforeEach` blows through that budget in seconds. Instead, we log in a
 * single time here, save the browser storage state to `.auth/user.json`, and
 * every project reuses that state via `use.storageState` in playwright.config.ts.
 *
 * Specs that need to exercise the login/logout flow itself (auth.spec.ts)
 * override this with `test.use({ storageState: { cookies: [], origins: [] } })`.
 */

import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '.auth', 'user.json');

async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    config.projects[0]?.use?.baseURL ||
    'http://localhost:3003';
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    // No credentials — nothing to pre-authenticate. Tests that need auth will
    // fail loudly with a clearer message than a silent rate-limit lockout.
    console.warn(
      '[global-setup] E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set; skipping pre-auth.',
    );
    return;
  }

  console.log(`[global-setup] Pre-authenticating at ${baseURL} as ${email}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    // Exact match — the page has both "Sign in" (submit) and
    // "Sign in with SSO instead".
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/.*dashboard/, { timeout: 20000 });
    await context.storageState({ path: AUTH_FILE });
    console.log(`[global-setup] Storage state written to ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
