// SPDX-License-Identifier: MIT
// Tests for phase-2b guarded mutations. Entirely offline: planMutation is pure,
// and every tool dispatch here is preview/blocked so NO write ever reaches the
// API. The staging hard-block + preview-default are the safety invariants.

import { describe, it, expect } from 'vitest';
import { createRegistry, handleRpc } from '../src/mcp/server.js';
import { domainToolset } from '../src/mcp/domain-tools.js';
import { mutationToolset, planMutation } from '../src/mcp/mutation-tools.js';

const SERVER = 'crechebooks';
const info = { name: SERVER, version: '0.1.0' };
const reg = createRegistry(SERVER, [...domainToolset, ...mutationToolset]);
const stagingKey = { CB_ENVIRONMENT: 'staging', CRECHEBOOKS_API_KEY: 'cb_test' };
const prodKey = { CB_ENVIRONMENT: 'production', CRECHEBOOKS_API_KEY: 'cb_test' };

describe('planMutation — safety invariants', () => {
  it('preview-default: no confirm → preview, no execution plan', () => {
    const p = planMutation({ env: stagingKey, method: 'POST', pathname: '/invoices/generate', body: { month: '2026-06' } });
    expect(p.ok).toBe(false);
    expect(p.preview).toBe(true);
    expect(p.would.path).toBe('/api/v1/invoices/generate');
  });

  it('parent-contacting writes are HARD-BLOCKED on staging, even with confirm', () => {
    const p = planMutation({ env: stagingKey, method: 'POST', pathname: '/invoices/send', body: {}, confirm: true });
    expect(p.ok).toBe(false);
    expect(p.blocked).toBe(true);
    expect(p.reason).toMatch(/STAGING/);
  });

  it('internal write with confirm + key on staging is allowed (no parent contact)', () => {
    const p = planMutation({ env: stagingKey, method: 'POST', pathname: '/invoices/generate', body: { month: '2026-06' }, confirm: true });
    expect(p.ok).toBe(true);
    expect(p.method).toBe('POST');
    expect(p.headers['x-api-key']).toBe('cb_test');
  });

  it('parent-contacting write on production requires confirm, then is allowed', () => {
    const preview = planMutation({ env: prodKey, method: 'POST', pathname: '/invoices/send', body: {} });
    expect(preview.preview).toBe(true);
    const go = planMutation({ env: prodKey, method: 'POST', pathname: '/invoices/send', body: {}, confirm: true });
    expect(go.ok).toBe(true);
  });

  it('rejects non-write methods and paths outside the write allowlist', () => {
    expect(planMutation({ env: prodKey, method: 'GET', pathname: '/invoices/generate' }).ok).toBe(false);
    expect(planMutation({ env: prodKey, method: 'POST', pathname: '/tenants/delete', confirm: true }).reason).toMatch(/write allowlist/);
  });

  it('confirm but no key → fails closed, no key leaked in the reason', () => {
    const p = planMutation({ env: { CB_ENVIRONMENT: 'production' }, method: 'POST', pathname: '/invoices/generate', confirm: true });
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/no API key/);
    expect(p.reason).not.toMatch(/cb_/);
  });
});

describe('mutation dispatch via MCP — preview/block paths only (no live write)', () => {
  it('tools/list includes the three guarded write tools', async () => {
    const r = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, reg, info);
    const names: string[] = r?.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['generate_invoices', 'match_payments', 'send_invoices']));
  });

  it('generate_invoices without confirm returns a PREVIEW', async () => {
    const r = await handleRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'generate_invoices', arguments: { month: '2026-06' } } },
      reg,
      info,
    );
    expect(r?.result.content[0].text).toMatch(/^PREVIEW/);
  });

  it('send_invoices on staging returns BLOCKED regardless of confirm', async () => {
    const saved = process.env.CB_ENVIRONMENT;
    process.env.CB_ENVIRONMENT = 'staging';
    try {
      const r = await handleRpc(
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'send_invoices', arguments: { confirm: true } } },
        reg,
        info,
      );
      expect(r?.result.content[0].text).toMatch(/^BLOCKED/);
    } finally {
      if (saved === undefined) delete process.env.CB_ENVIRONMENT;
      else process.env.CB_ENVIRONMENT = saved;
    }
  });
});
