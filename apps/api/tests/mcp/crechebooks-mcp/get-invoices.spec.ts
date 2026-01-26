/**
 * Get Invoices Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests tenant filter, status filter, amount range, parent name join, outstanding calculation.
 * Uses mocked PrismaService.
 */

import { getInvoices } from '../../../src/mcp/crechebooks-mcp/tools/get-invoices';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type { InvoiceRecord, McpToolResult } from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockPrisma(
  findManyResult: unknown[] = [],
): { prisma: PrismaService; findManySpy: jest.Mock } {
  const findManySpy = jest.fn().mockResolvedValue(findManyResult);
  const prisma = {
    invoice: {
      findMany: findManySpy,
    },
  } as unknown as PrismaService;
  return { prisma, findManySpy };
}

function createMockInvoice(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2025-001',
    issueDate: new Date('2025-01-15'),
    dueDate: new Date('2025-02-15'),
    subtotalCents: 100000,
    vatCents: 15000,
    totalCents: 115000,
    amountPaidCents: 50000,
    status: 'SENT',
    pdfUrl: 'https://storage.example.com/inv-001.pdf',
    parent: {
      firstName: 'Jane',
      lastName: 'Smith',
    },
    lines: [
      {
        id: 'line-001',
        description: 'Monthly fee - January',
        quantity: 1,
        unitPriceCents: 100000,
        discountCents: 0,
        subtotalCents: 100000,
        vatCents: 15000,
        totalCents: 115000,
        lineType: 'MONTHLY_FEE',
        accountCode: '4100',
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe('get_invoices tool', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('should return tool definition with correct name and schema', () => {
    const { prisma } = createMockPrisma();
    const tool = getInvoices(prisma);

    expect(tool.name).toBe('get_invoices');
    expect(tool.inputSchema.required).toContain('tenantId');
  });

  it('should enforce tenant isolation in every query', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.tenantId).toBe(TENANT_ID);
    expect(callArgs.where.isDeleted).toBe(false);
  });

  it('should include parent and lines in query', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(callArgs.include.lines).toBeDefined();
    expect(callArgs.include.parent).toEqual({
      select: { firstName: true, lastName: true },
    });
  });

  it('should return invoices with calculated outstanding amount', async () => {
    const mockInv = createMockInvoice();
    const { prisma } = createMockPrisma([mockInv]);
    const tool = getInvoices(prisma);

    const result = await tool.handler({ tenantId: TENANT_ID }) as McpToolResult<InvoiceRecord[]>;

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    const inv = result.data![0];
    expect(inv.invoiceNumber).toBe('INV-2025-001');
    expect(inv.parentName).toBe('Jane Smith');
    expect(inv.totalCents).toBe(115000);
    expect(inv.amountPaidCents).toBe(50000);
    expect(inv.outstandingCents).toBe(65000); // 115000 - 50000
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].lineType).toBe('MONTHLY_FEE');
  });

  it('should filter by status', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({ tenantId: TENANT_ID, status: 'OVERDUE' });

    const callArgs = findManySpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.status).toBe('OVERDUE');
  });

  it('should filter by parentId', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({ tenantId: TENANT_ID, parentId: 'parent-001' });

    const callArgs = findManySpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.parentId).toBe('parent-001');
  });

  it('should filter by date range on issueDate', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({
      tenantId: TENANT_ID,
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
    });

    const callArgs = findManySpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.issueDate).toEqual({
      gte: new Date('2025-01-01'),
      lte: new Date('2025-01-31'),
    });
  });

  it('should filter by amount range on totalCents', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({
      tenantId: TENANT_ID,
      minAmountCents: 50000,
      maxAmountCents: 200000,
    });

    const callArgs = findManySpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where.totalCents).toEqual({
      gte: 50000,
      lte: 200000,
    });
  });

  it('should order by issueDate descending', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getInvoices(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as { orderBy: Record<string, string> };
    expect(callArgs.orderBy).toEqual({ issueDate: 'desc' });
  });

  it('should construct parentName from firstName and lastName', async () => {
    const mockInv = createMockInvoice({
      parent: { firstName: 'John', lastName: 'Doe' },
    });
    const { prisma } = createMockPrisma([mockInv]);
    const tool = getInvoices(prisma);

    const result = await tool.handler({ tenantId: TENANT_ID }) as McpToolResult<InvoiceRecord[]>;

    expect(result.data![0].parentName).toBe('John Doe');
  });

  it('should handle database errors gracefully', async () => {
    const findManySpy = jest.fn().mockRejectedValue(new Error('Timeout'));
    const prisma = {
      invoice: { findMany: findManySpy },
    } as unknown as PrismaService;
    const tool = getInvoices(prisma);

    const result = await tool.handler({ tenantId: TENANT_ID }) as McpToolResult<InvoiceRecord[]>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
  });

  it('should convert line quantity Decimal to number', async () => {
    const mockInv = createMockInvoice();
    const { prisma } = createMockPrisma([mockInv]);
    const tool = getInvoices(prisma);

    const result = await tool.handler({ tenantId: TENANT_ID }) as McpToolResult<InvoiceRecord[]>;

    expect(typeof result.data![0].lines[0].quantity).toBe('number');
  });
});
