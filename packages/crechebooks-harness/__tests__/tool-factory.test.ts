// SPDX-License-Identifier: MIT
// Tests for the spec-driven tool generator. The domain tools are now generated
// from domain-spec.js — adding a tool is a spec entry, and these tests pin that
// the factory derives schema + handler + safety correctly (no hand-coding).

import { describe, it, expect } from 'vitest';
import { buildToolset } from '../src/mcp/tool-factory.js';
import { DOMAIN_SPEC } from '../src/mcp/domain-spec.js';
import { planMutation } from '../src/mcp/mutation-tools.js';

const pick = (name: string) => DOMAIN_SPEC.filter((s: { name: string }) => s.name === name);

describe('tool-factory — spec-driven generation', () => {
  it('the spec covers every shipped tool', () => {
    const names = DOMAIN_SPEC.map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tenant_info', 'dashboard_metrics', 'list_invoices', 'list_payments', 'arrears_report',
        'reconciliation_summary', 'list_transactions', 'banking_accounts', 'banking_summary',
        'reconciliation_discrepancies', 'income_statement',
        'generate_invoices', 'match_payments', 'allocate_payment', 'send_invoices',
      ]),
    );
  });

  it('generates a read tool: query schema, no confirm', () => {
    const [t] = buildToolset(pick('list_invoices'), { cbApi: async () => 'ok' });
    expect(t.name).toBe('list_invoices');
    expect(t.inputSchema.properties.limit.type).toBe('number');
    expect(t.inputSchema.properties.confirm).toBeUndefined();
  });

  it('generates a write tool: confirm + required derived from the spec', () => {
    const [t] = buildToolset(pick('allocate_payment'), { cbWrite: async () => 'ok' });
    expect(t.inputSchema.properties.confirm.type).toBe('boolean');
    expect(t.inputSchema.required).toEqual(expect.arrayContaining(['transaction_id', 'allocations']));
  });

  it('read handler calls cbApi with built query (default + cap applied)', async () => {
    let captured: any;
    const [t] = buildToolset(pick('list_invoices'), {
      cbApi: async (path: string, opts: any) => { captured = { path, opts }; return 'ok'; },
    });
    await t.handler({ limit: 500, status: 'PAID' });
    expect(captured.path).toBe('/invoices');
    expect(captured.opts.query).toEqual({ limit: '100', status: 'PAID' }); // 500 capped at 100
  });

  it('write handler routes through cbWrite with method + body + confirm', async () => {
    let captured: any;
    const [t] = buildToolset(pick('allocate_payment'), {
      cbWrite: async (method: string, path: string, body: any, confirm: boolean) => {
        captured = { method, path, body, confirm };
        return 'ok';
      },
    });
    await t.handler({ transaction_id: 'tx', allocations: [{ invoice_id: 'i', amount: 10 }], confirm: true });
    expect(captured).toEqual({ method: 'POST', path: '/payments', body: { transaction_id: 'tx', allocations: [{ invoice_id: 'i', amount: 10 }] }, confirm: true });
  });

  it('allocate_payment is internal — allowed on staging with confirm (not parent-contact)', () => {
    const p = planMutation({ env: { CB_ENVIRONMENT: 'staging', CRECHEBOOKS_API_KEY: 'cb_test' }, method: 'POST', pathname: '/payments', body: {}, confirm: true });
    expect(p.ok).toBe(true);
  });
});
