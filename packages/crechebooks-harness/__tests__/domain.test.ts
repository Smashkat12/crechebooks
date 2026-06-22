// SPDX-License-Identifier: MIT
// Tests for the `crechebooks` domain MCP server (product surface). Pure/offline:
// planRequest is exercised directly and tool calls run with no API key so they
// short-circuit before any network I/O — nothing here touches the live API.

import { describe, it, expect } from 'vitest';
import { createRegistry, handleRpc } from '../src/mcp/server.js';
import { domainToolset, planRequest } from '../src/mcp/domain-tools.js';

const SERVER = 'crechebooks';
const info = { name: SERVER, version: '0.1.0' };
const reg = createRegistry(SERVER, domainToolset);

describe('crechebooks domain server — surface', () => {
  it('exposes only read-only tools (no send/generate/match/allocate)', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, reg, info);
    const names: string[] = r?.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['tenant_info', 'dashboard_metrics', 'list_invoices', 'list_payments', 'arrears_report', 'reconciliation_summary']),
    );
    for (const n of names) expect(n).not.toMatch(/send|generate|match|allocate|broadcast|reminder|create|delete|push/i);
    for (const t of r?.result.tools) expect(t.inputSchema.type).toBe('object');
  });
});

describe('planRequest — security guards', () => {
  const env = { CB_ENVIRONMENT: 'staging', CRECHEBOOKS_API_KEY: 'cb_test_key' };

  it('builds a GET with x-api-key + tenant header for a cb_ key', () => {
    const p = planRequest({ env, method: 'GET', pathname: '/invoices?status=DRAFT' });
    expect(p.ok).toBe(true);
    expect(p.url).toContain('/api/v1/invoices?status=DRAFT');
    expect(p.headers['x-api-key']).toBe('cb_test_key');
    expect(p.headers['x-tenant-id']).toBeTruthy();
  });

  it('uses Bearer auth for a non-cb_ key', () => {
    const p = planRequest({ env: { ...env, CRECHEBOOKS_API_KEY: 'jwt.token.here' }, method: 'GET', pathname: '/tenants/me' });
    expect(p.headers.Authorization).toBe('Bearer jwt.token.here');
    expect(p.headers['x-api-key']).toBeUndefined();
  });

  it('refuses non-GET methods', () => {
    expect(planRequest({ env, method: 'POST', pathname: '/invoices' }).ok).toBe(false);
  });

  it('hard-denies side-effecting paths even under GET', () => {
    for (const path of ['/invoices/send', '/invoices/generate', '/payments/match', '/communications/broadcast']) {
      const p = planRequest({ env, method: 'GET', pathname: path });
      expect(p.ok, path).toBe(false);
      expect(p.reason).toMatch(/side-effecting|allowlist/);
    }
  });

  it('rejects paths outside the read allowlist', () => {
    expect(planRequest({ env, method: 'GET', pathname: '/admin/secrets' }).ok).toBe(false);
  });

  it('fails closed when no API key is set (no network attempted)', () => {
    const p = planRequest({ env: { CB_ENVIRONMENT: 'staging' }, method: 'GET', pathname: '/tenants/me' });
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/no API key/);
  });

  it('selects staging vs production base URL by CB_ENVIRONMENT', () => {
    const staging = planRequest({ env, method: 'GET', pathname: '/dashboard/metrics' });
    expect(staging.url).toContain('staging');
    const prod = planRequest({ env: { CB_ENVIRONMENT: 'production', CRECHEBOOKS_API_KEY: 'cb_k' }, method: 'GET', pathname: '/dashboard/metrics' });
    expect(prod.url).toContain('elleelephant');
  });
});

describe('domain tool dispatch — fails closed, never leaks the key', () => {
  it('a tool call with no key returns a denial, not a crash or the key', async () => {
    // ensure no key in env for this assertion
    const saved = { ...process.env };
    delete process.env.CRECHEBOOKS_API_KEY;
    delete process.env.CB_STAGING_API_KEY;
    try {
      const r = await handleRpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'tenant_info', arguments: {} } },
        reg,
        info,
      );
      const text = r?.result.content[0].text;
      expect(text).toContain('denied');
      expect(text).not.toMatch(/cb_|Bearer/); // never echoes credential material
    } finally {
      Object.assign(process.env, saved);
    }
  });
});
