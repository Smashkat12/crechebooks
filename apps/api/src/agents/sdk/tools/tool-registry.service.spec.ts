/**
 * AgentToolRegistry unit tests.
 *
 * Confirms the registry:
 *   - Registers every canonical tool.
 *   - Emits Anthropic-shaped definitions for a given agent type.
 *   - Enforces the per-agent allowlist via {@link executeForAgent}.
 *   - Rejects an execute call without a tenantId.
 *   - Rejects an unknown tool.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import { AgentToolError } from './interfaces/agent-tool.interface';
import { AgentToolRegistry } from './tool-registry.service';

describe('AgentToolRegistry', () => {
  const mkPrisma = () =>
    ({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Test',
          tradingName: 'Test',
        }),
      },
    }) as unknown as PrismaService;

  it('registers all canonical tools', () => {
    const registry = new AgentToolRegistry(mkPrisma());
    const names = registry.getAllToolNames();
    // Read + mutation set.
    expect(names).toEqual(
      expect.arrayContaining([
        'list_invoices',
        'list_payments',
        'list_transactions',
        'get_arrears_summary',
        'get_dashboard_metrics',
        'list_children',
        'list_parents',
        'list_staff',
        'get_tenant',
        'generate_invoices',
        'allocate_payment',
        'run_payment_matching',
        'categorize_transactions',
      ]),
    );
  });

  it('categorizer gets categorization + tx read tools', () => {
    const registry = new AgentToolRegistry(mkPrisma());
    expect(registry.getToolNamesForAgent('categorizer')).toEqual([
      'list_transactions',
      'get_tenant',
      'categorize_transactions',
    ]);
  });

  it('matcher gets invoice/payment/tx tools + allocate + run_matching', () => {
    const registry = new AgentToolRegistry(mkPrisma());
    expect(registry.getToolNamesForAgent('matcher')).toEqual([
      'list_invoices',
      'list_payments',
      'list_transactions',
      'allocate_payment',
      'run_payment_matching',
    ]);
  });

  it('conversational agent is read-only', () => {
    const registry = new AgentToolRegistry(mkPrisma());
    const tools = registry.getToolNamesForAgent('conversational');
    const mutations = tools.filter((n) => {
      const t = registry.get(n);
      return t?.mutation === true;
    });
    expect(mutations).toEqual([]);
  });

  it('emits Anthropic tool definitions with input_schema for the chosen agent', () => {
    const registry = new AgentToolRegistry(mkPrisma());
    const defs = registry.getToolDefinitionsForAgent('conversational');
    expect(defs.length).toBeGreaterThan(0);
    for (const d of defs) {
      expect(d).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
          input_schema: expect.objectContaining({ type: 'object' }),
        }),
      );
    }
  });

  it('execute() enforces tenantId presence', async () => {
    const registry = new AgentToolRegistry(mkPrisma());
    await expect(
      registry.execute('get_tenant', {}, { tenantId: '' }),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it('execute() rejects unknown tools', async () => {
    const registry = new AgentToolRegistry(mkPrisma());
    await expect(
      registry.execute('teleport', {}, { tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
  });

  it('executeForAgent() rejects tools outside the agent allowlist', async () => {
    const registry = new AgentToolRegistry(mkPrisma());
    // conversational is not allowed to allocate_payment
    await expect(
      registry.executeForAgent(
        'conversational',
        'allocate_payment',
        { transactionId: 'x', invoiceId: 'y', amountCents: 1 },
        { tenantId: 'tenant-1' },
      ),
    ).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
  });

  it('executeForAgent() runs the handler and returns its data when allowed', async () => {
    const prisma = mkPrisma();
    const registry = new AgentToolRegistry(prisma);
    const res = await registry.executeForAgent(
      'conversational',
      'get_tenant',
      {},
      { tenantId: 'tenant-1' },
    );
    expect(res).toMatchObject({ id: 'tenant-1', name: 'Test' });
  });
});
