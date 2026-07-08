import { test as base, expect } from '@playwright/test';

// E2E test credentials - sourced from environment variables only
// Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in your .env.test file
// SECURITY: No fallback values - credentials must come from environment
const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

if (!E2E_TEST_EMAIL || !E2E_TEST_PASSWORD) {
  console.warn(
    'WARNING: E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test or tests will fail.',
  );
}

/**
 * Auth fixture that provides a properly authenticated page.
 *
 * IMPORTANT: with `globalSetup` + `storageState`, most tests already start
 * authenticated. `login()` here is now a "get me to the dashboard" helper —
 * if the shared storage state is present the browser just navigates there;
 * only when a spec runs with cleared storage (e.g. auth.spec.ts) does it fall
 * back to filling the login form. This avoids hammering the dev-login
 * endpoint's rate limit (5/15min per IP) once per test.
 *
 * Credentials are sourced from environment variables (E2E_TEST_EMAIL, E2E_TEST_PASSWORD).
 */
// Strict match: only the /dashboard route, not `/login?callbackUrl=/dashboard`
// (which contains the substring "dashboard" and used to satisfy the loose
// /.*dashboard/ pattern, making failed logins look like successes).
const ON_DASHBOARD = /\/dashboard(?:$|[/?#])/;

export async function login(page: any) {
  // Fast path — the shared storageState from globalSetup means we're already
  // authenticated. Just go to the dashboard.
  await page.goto('/dashboard');

  // If we land on the dashboard, we're done.
  try {
    await page.waitForURL(ON_DASHBOARD, { timeout: 3000 });
    return;
  } catch {
    // Fall through to full login flow (spec cleared storageState, or the
    // storage-state cookie was rejected by middleware in this build).
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(E2E_TEST_EMAIL);
  await page.getByLabel(/password/i).fill(E2E_TEST_PASSWORD);
  // The login page has two buttons matching /sign in/i — "Sign in" (form
  // submit) and "Sign in with SSO instead". Use exact match on the submit
  // button to avoid strict-mode selector violations.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Wait for login to complete - dashboard should be loaded
  await page.waitForURL(ON_DASHBOARD, { timeout: 15000 });
  await expect(page).toHaveURL(ON_DASHBOARD);
}

/**
 * Extended test with auth helpers
 */
export const test = base.extend<{ authenticatedPage: void }>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use();
  },
});

export { expect };
