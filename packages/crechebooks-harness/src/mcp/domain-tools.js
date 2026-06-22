// SPDX-License-Identifier: MIT
// The `crechebooks` MCP toolset — the product surface. Read-only domain data
// (dashboard, invoices, payments, arrears, reconciliation, tenant) over the
// CrecheBooks API, via a thin zero-dependency HTTPS client.
//
// Safety model (mirrors the repo's staging-comms rule + cb-api.sh auth):
//   - GET only. `planRequest` refuses any non-GET method.
//   - Side-effecting paths (/send, /generate, /match, /broadcast, /reminder,
//     /push, /allocate) are hard-denied even under GET — no notification
//     pipeline can ever be triggered through this server.
//   - A read-prefix allowlist bounds what can be fetched.
//   - The API key is read from the environment, attached as an auth header, and
//     NEVER logged or returned in tool output.

import { resolveTarget, authHeaders, httpRequest } from './cb-client.js';
import { buildToolset } from './tool-factory.js';
import { DOMAIN_SPEC } from './domain-spec.js';

const READ_PREFIXES = [
  '/tenants', '/dashboard', '/invoices', '/payments', '/arrears', '/reconciliation',
  '/reports', '/banking', '/transactions', '/staff', '/parents', '/children',
  '/fee-structures', '/accounts', '/general-ledger', '/cash-flow',
];
// Defence in depth: never reach a side-effecting route even via GET.
const FORBIDDEN = /\/(send|generate|match|broadcast|reminder|reminders|push|allocate)(\/|\?|$)/i;

/**
 * Plan a request from the environment + path. Pure (no I/O) so it can be unit
 * tested. Returns `{ ok, url, headers }` or `{ ok:false, reason }`. The key
 * lives only in the returned headers — callers must not log it.
 */
export function planRequest({ env, method, pathname }) {
  if (method !== 'GET') return { ok: false, reason: `only GET is permitted (got ${method})` };
  const bare = pathname.split('?')[0];
  if (FORBIDDEN.test(pathname)) return { ok: false, reason: `refusing side-effecting path: ${bare}` };
  const allowed = READ_PREFIXES.some((p) => bare === p || bare.startsWith(p + '/'));
  if (!allowed) return { ok: false, reason: `path not in read allowlist: ${bare}` };

  const { staging, base, key, tenant } = resolveTarget(env);
  if (!key) {
    return { ok: false, reason: 'no API key — export CRECHEBOOKS_API_KEY (or CB_STAGING_API_KEY for staging)' };
  }
  return { ok: true, url: `${base}/api/v1${pathname}`, headers: authHeaders(key, tenant), env: staging ? 'staging' : 'production' };
}

/** Read-only GET against the CrecheBooks API. Returns parsed JSON or a message. */
async function cbApi(pathname, { query } = {}) {
  const qs = query && Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const plan = planRequest({ env: process.env, method: 'GET', pathname: pathname + qs });
  if (!plan.ok) return `denied: ${plan.reason}`;
  return httpRequest('GET', plan.url, plan.headers, null);
}


export const domainToolset = buildToolset(
  DOMAIN_SPEC.filter((s) => s.method === 'GET'),
  { cbApi },
);
