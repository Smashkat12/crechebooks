// SPDX-License-Identifier: MIT
// Phase 2b — guarded WRITE tools for the `crechebooks` server. Every mutation is
// safe by construction:
//
//   1. Preview-default — without `confirm: true` a tool returns a dry preview of
//      exactly what it WOULD send, and makes no API call.
//   2. Parent-contacting operations (send / broadcast / reminder / notify /
//      whatsapp / email) are HARD-BLOCKED on staging — they can never fire
//      against the real parent data in the staging tenant, even with confirm.
//   3. Internal mutations (generate / match / charges / reconciliation) run only
//      with explicit confirm.
//
// This mirrors the repo's staging-comms safety rule: the harness can prepare and
// preview, but a human must consciously confirm any write, and parent contact is
// production-only.

import { resolveTarget, authHeaders, httpRequest } from './cb-client.js';
import { buildToolset } from './tool-factory.js';
import { DOMAIN_SPEC } from './domain-spec.js';

// Paths that cause a parent/guardian to be contacted — the dangerous set.
const PARENT_CONTACT = /\/(send|broadcast|remind|reminder|reminders|notify|whatsapp|email|message)(\/|\?|$)/i;
// Explicit allowlist of write paths this server may target.
const WRITE_ALLOWLIST = ['/invoices/generate', '/invoices/send', '/payments/match', '/payments'];

/**
 * Plan a mutation. Pure (no I/O) so it can be unit tested. Returns one of:
 *   { ok:true, method, url, headers, body }              → safe to execute
 *   { ok:false, blocked:true, reason }                   → refused (staging parent-contact)
 *   { ok:false, preview:true, reason, would:{…} }        → preview (no confirm)
 *   { ok:false, reason }                                 → bad request / no key
 */
export function planMutation({ env, method, pathname, body, confirm }) {
  if (!['POST', 'PATCH', 'PUT'].includes(method)) {
    return { ok: false, reason: `mutations use POST/PATCH/PUT (got ${method})` };
  }
  const bare = pathname.split('?')[0];
  if (!WRITE_ALLOWLIST.some((p) => bare === p || bare.startsWith(p + '/'))) {
    return { ok: false, reason: `path not in write allowlist: ${bare}` };
  }
  const { staging, base, key, tenant } = resolveTarget(env);
  const parentContact = PARENT_CONTACT.test(pathname);

  // Hard block: parent-contacting writes can never run against staging.
  if (parentContact && staging) {
    return {
      ok: false,
      blocked: true,
      reason: `refusing a parent-contacting operation on STAGING (real parent data): ${bare}. This is production-only.`,
    };
  }

  // Preview-default: nothing executes without an explicit confirm.
  if (!confirm) {
    return {
      ok: false,
      preview: true,
      reason: `preview only — set confirm=true to execute (${parentContact ? 'PARENT-CONTACTING' : 'internal'} write on ${staging ? 'staging' : 'production'})`,
      would: { method, path: `/api/v1${bare}`, body: body ?? {}, parentContact, environment: staging ? 'staging' : 'production' },
    };
  }

  if (!key) return { ok: false, reason: 'no API key — export CRECHEBOOKS_API_KEY (or CB_STAGING_API_KEY for staging)' };
  return { ok: true, method, url: `${base}/api/v1${pathname}`, headers: authHeaders(key, tenant), body: body ?? {} };
}

/** Execute a guarded mutation, or return the preview/block message. */
async function cbWrite(method, pathname, body, confirm) {
  const plan = planMutation({ env: process.env, method, pathname, body, confirm });
  if (plan.blocked) return `BLOCKED: ${plan.reason}`;
  if (plan.preview) return `PREVIEW (no change made): ${plan.reason}\n${JSON.stringify(plan.would, null, 2)}`;
  if (!plan.ok) return `denied: ${plan.reason}`;
  const res = await httpRequest(plan.method, plan.url, plan.headers, plan.body);
  return res;
}

export const mutationToolset = buildToolset(
  DOMAIN_SPEC.filter((s) => s.method !== 'GET'),
  { cbWrite },
);
