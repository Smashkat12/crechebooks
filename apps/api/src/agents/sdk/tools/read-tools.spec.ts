/**
 * Read-tool handler unit tests.
 *
 * Each read tool is driven against a mocked Prisma client. Covers happy-path
 * shape, tenant scoping (the tool must pass ctx.tenantId to Prisma), and
 * invalid input rejection.
 */

import { Logger } from '@nestjs/common';
import type { AgentToolContext } from './interfaces/agent-tool.interface';
import { AgentToolError } from './interfaces/agent-tool.interface';
import { listInvoicesTool } from './read/list-invoices.tool';
import { listPaymentsTool } from './read/list-payments.tool';
import { listTransactionsTool } from './read/list-transactions.tool';
import { getArrearsSummaryTool } from './read/get-arrears-summary.tool';
import { getDashboardMetricsTool } from './read/get-dashboard-metrics.tool';
import { listChildrenTool } from './read/list-children.tool';
import { listParentsTool } from './read/list-parents.tool';
import { listStaffTool } from './read/list-staff.tool';
import { getTenantTool } from './read/get-tenant.tool';

const TENANT = 'tenant-abc';

function makeCtx(prisma: unknown): AgentToolContext {
  return {
    tenantId: TENANT,
    prisma: prisma as AgentToolContext['prisma'],
    logger: new Logger('test'),
  };
}

describe('list_invoices', () => {
  it('scopes by tenantId and maps rows', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'i1',
        invoiceNumber: 'INV-001',
        parentId: 'p1',
        childId: 'c1',
        issueDate: new Date('2026-06-01'),
        dueDate: new Date('2026-06-15'),
        totalCents: 100000,
        amountPaidCents: 40000,
        status: 'PARTIALLY_PAID',
      },
    ]);
    const ctx = makeCtx({ invoice: { findMany } });

    const res = (await listInvoicesTool.handler(
      { status: 'PARTIALLY_PAID' },
      ctx,
    )) as {
      count: number;
      invoices: Array<{ outstandingCents: number }>;
      tenantId: string;
    };

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          status: 'PARTIALLY_PAID',
          isDeleted: false,
        }),
        take: 25,
      }),
    );
    expect(res.tenantId).toBe(TENANT);
    expect(res.count).toBe(1);
    expect(res.invoices[0].outstandingCents).toBe(60000);
  });

  it('rejects an invalid status', async () => {
    const ctx = makeCtx({ invoice: { findMany: jest.fn() } });
    await expect(
      listInvoicesTool.handler({ status: 'BOGUS' }, ctx),
    ).rejects.toBeInstanceOf(AgentToolError);
  });

  it('caps limit to 100', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ invoice: { findMany } });
    await listInvoicesTool.handler({ limit: 999 }, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe('list_payments', () => {
  it('filters by matchedBy when supplied', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ payment: { findMany } });
    await listPaymentsTool.handler({ matchedBy: 'AI_AUTO' }, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          matchedBy: 'AI_AUTO',
        }),
      }),
    );
  });

  it('rejects unknown matchedBy', async () => {
    const ctx = makeCtx({ payment: { findMany: jest.fn() } });
    await expect(
      listPaymentsTool.handler({ matchedBy: 'GHOST' }, ctx),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe('list_transactions', () => {
  it('filters by status when supplied', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ transaction: { findMany } });
    await listTransactionsTool.handler({ status: 'pending' }, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, status: 'PENDING' }),
      }),
    );
  });
});

describe('get_arrears_summary', () => {
  it('groups outstanding into aging buckets', async () => {
    // asOf = 2026-06-30. Three invoices at various dueDates.
    const invoices = [
      {
        id: 'a',
        dueDate: new Date('2026-07-15'),
        totalCents: 10000,
        amountPaidCents: 0,
      }, // current
      {
        id: 'b',
        dueDate: new Date('2026-06-15'),
        totalCents: 20000,
        amountPaidCents: 5000,
      }, // 15 days -> 1-30 bucket
      {
        id: 'c',
        dueDate: new Date('2026-01-01'),
        totalCents: 50000,
        amountPaidCents: 0,
      }, // 180d -> 90+
      {
        id: 'd',
        dueDate: new Date('2026-06-30'),
        totalCents: 999,
        amountPaidCents: 999,
      }, // fully paid, skip
    ];
    const findMany = jest.fn().mockResolvedValue(invoices);
    const ctx = makeCtx({ invoice: { findMany } });

    const res = (await getArrearsSummaryTool.handler(
      { asOf: '2026-06-30' },
      ctx,
    )) as {
      totalInvoiceCount: number;
      totalOutstandingCents: number;
      buckets: Array<{ bucket: string; outstandingCents: number }>;
    };

    expect(res.totalInvoiceCount).toBe(3);
    expect(res.totalOutstandingCents).toBe(10000 + 15000 + 50000);
    const currentBucket = res.buckets.find((b) => b.bucket === 'current');
    const bucket1to30 = res.buckets.find((b) => b.bucket === '1-30');
    const bucket90 = res.buckets.find((b) => b.bucket === '90+');
    expect(currentBucket?.outstandingCents).toBe(10000);
    expect(bucket1to30?.outstandingCents).toBe(15000);
    expect(bucket90?.outstandingCents).toBe(50000);
  });
});

describe('get_dashboard_metrics', () => {
  it('rolls invoice aggregates + active enrollment count for current-month', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { totalCents: 200000, amountPaidCents: 120000 },
      _count: { _all: 12 },
    });
    const count = jest.fn().mockResolvedValue(48);
    const ctx = makeCtx({ invoice: { aggregate }, enrollment: { count } });

    const res = (await getDashboardMetricsTool.handler({}, ctx)) as {
      invoicedCents: number;
      collectedCents: number;
      outstandingCents: number;
      activeEnrollments: number;
      collectionRatePct: number;
    };

    expect(res.invoicedCents).toBe(200000);
    expect(res.collectedCents).toBe(120000);
    expect(res.outstandingCents).toBe(80000);
    expect(res.activeEnrollments).toBe(48);
    expect(res.collectionRatePct).toBe(60);
  });

  it('rejects an unknown period', async () => {
    const ctx = makeCtx({
      invoice: { aggregate: jest.fn() },
      enrollment: { count: jest.fn() },
    });
    await expect(
      getDashboardMetricsTool.handler({ period: 'forever' }, ctx),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe('list_children / list_parents / list_staff', () => {
  it('list_children applies status filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ child: { findMany } });
    await listChildrenTool.handler({ status: 'enrolled' }, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          status: 'ENROLLED',
        }),
      }),
    );
  });

  it('list_parents defaults to activeOnly=true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ parent: { findMany } });
    await listParentsTool.handler({}, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, isActive: true }),
      }),
    );
  });

  it('list_staff can include inactive when activeOnly=false', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ staff: { findMany } });
    await listStaffTool.handler({ activeOnly: false }, ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isActive: expect.anything() }),
      }),
    );
  });
});

describe('get_tenant', () => {
  it('fetches the tenant scoped to ctx.tenantId', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: TENANT,
      name: 'Test Creche',
      tradingName: 'Test',
      vatNumber: '4123456789',
      taxStatus: 'REGISTERED',
    });
    const ctx = makeCtx({ tenant: { findUnique } });
    const res = await getTenantTool.handler({}, ctx);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TENANT } }),
    );
    expect(res).toMatchObject({ id: TENANT, name: 'Test Creche' });
  });

  it('throws when the tenant is missing', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const ctx = makeCtx({ tenant: { findUnique } });
    await expect(getTenantTool.handler({}, ctx)).rejects.toBeInstanceOf(
      AgentToolError,
    );
  });
});
