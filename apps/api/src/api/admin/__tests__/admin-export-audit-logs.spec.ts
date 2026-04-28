/**
 * AdminService.exportAuditLogsCsv — streaming CSV export tests
 *
 * Verifies:
 *  - Header row is emitted first
 *  - Cursor-based pagination: Prisma is called once per 500-row page
 *  - All rows across pages appear in the output (no data loss)
 *  - Memory ceiling: at most PAGE_SIZE (500) model objects per findMany call
 *  - Tenant / filter predicates are forwarded correctly to Prisma
 *  - Stream closes cleanly (null-push) after last page
 *  - Prisma errors are surfaced via stream.destroy()
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditAction } from '@prisma/client';
import { AuditLogExportQueryDto } from '../dto/audit-logs.dto';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Read a Readable stream to completion and return collected string. */
function collectStream(readable: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    readable.on('data', (chunk: Buffer | string) =>
      chunks.push(chunk.toString()),
    );
    readable.on('end', () => resolve(chunks.join('')));
    readable.on('error', reject);
  });
}

/**
 * Build a minimal mock AuditLog row.
 * Matches the `select` block in AdminService.exportAuditLogsCsv.
 */
function makeRow(n: number) {
  return {
    id: `row-${n}`,
    createdAt: new Date('2025-01-15T10:00:00.000Z'),
    userId: `user-${n % 3}`,
    agentId: null as string | null,
    action: AuditAction.CREATE,
    entityType: 'Transaction',
    entityId: `entity-${n}`,
    changeSummary: null as string | null,
    beforeValue: null,
    afterValue: null,
    ipAddress: null as string | null,
    userAgent: null as string | null,
  };
}

/**
 * Returns a jest.fn() that simulates cursor-based pagination over `totalRows`
 * rows with the given PAGE_SIZE, matching Prisma's cursor+skip+take contract.
 */
function buildPaginatedFindMany(totalRows: number, PAGE_SIZE = 500) {
  const allRows = Array.from({ length: totalRows }, (_, i) => makeRow(i + 1));
  return jest
    .fn()
    .mockImplementation(
      (args: { take: number; cursor?: { id: string }; skip?: number }) => {
        const startIdx = args.cursor
          ? allRows.findIndex((r) => r.id === args.cursor!.id) + 1
          : 0;
        return Promise.resolve(allRows.slice(startIdx, startIdx + args.take));
      },
    );
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('AdminService.exportAuditLogsCsv', () => {
  let service: AdminService;
  let mockFindMany: jest.Mock;

  const mockPrisma = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    contactSubmission: { findMany: jest.fn(), count: jest.fn() },
    demoRequest: { findMany: jest.fn(), count: jest.fn() },
    tenant: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn() },
    invoice: { aggregate: jest.fn() },
    transaction: { count: jest.fn() },
    child: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks(); // reset implementations + call history

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    mockFindMany = mockPrisma.auditLog.findMany;
  });

  // ── returns Readable synchronously ─────────────────────────────────────────

  it('returns a Node.js Readable stream synchronously', () => {
    mockFindMany.mockResolvedValue([]);
    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    expect(stream).toBeInstanceOf(Readable);
  });

  // ── header ──────────────────────────────────────────────────────────────────

  it('emits the CSV header as the first row', async () => {
    mockFindMany.mockResolvedValueOnce([]); // empty result — only header

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    const firstLine = output.split('\n')[0];
    // Column names defined in AdminService.exportAuditLogsCsv
    expect(firstLine).toContain('timestamp');
    expect(firstLine).toContain('actor_id');
    expect(firstLine).toContain('action');
    expect(firstLine).toContain('entity_type');
    expect(firstLine).toContain('entity_id');
    expect(firstLine).toContain('change_summary');
  });

  // ── single page (< PAGE_SIZE) ───────────────────────────────────────────────

  it('emits all rows when total < PAGE_SIZE', async () => {
    mockFindMany.mockImplementation(buildPaginatedFindMany(3));

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(4); // 1 header + 3 data rows
    // single findMany returning <PAGE_SIZE rows terminates the loop
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  // ── multi-page (5 000 rows = 10 pages of 500) ───────────────────────────────

  it('pages through 5000 rows — 11 findMany calls (10 full + 1 empty sentinel)', async () => {
    const TOTAL = 5000;
    mockFindMany.mockImplementation(buildPaginatedFindMany(TOTAL));

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-12-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    // 1 header + 5000 data rows
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(TOTAL + 1);

    // 10 full pages + 1 empty page to detect end-of-results
    expect(mockFindMany).toHaveBeenCalledTimes(11);
  });

  it('emits data for every row across pages — spot-check entity_id fields', async () => {
    const TOTAL = 5000;
    mockFindMany.mockImplementation(buildPaginatedFindMany(TOTAL));

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-12-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    // Each data row contains its entity-N value
    expect(output).toContain('entity-1');
    expect(output).toContain('entity-500');
    expect(output).toContain('entity-501'); // crosses page boundary
    expect(output).toContain('entity-5000');
  });

  it('each findMany call fetches at most 500 rows', async () => {
    mockFindMany.mockImplementation(buildPaginatedFindMany(5000));

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-12-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    for (const call of mockFindMany.mock.calls) {
      const args = call[0] as { take: number };
      expect(args.take).toBeLessThanOrEqual(500);
    }
  });

  // ── cursor forwarding ───────────────────────────────────────────────────────

  it('passes cursor+skip from last row of page 1 into page 2 call', async () => {
    // Page 1: exactly 500 rows (triggers the cursor path)
    const page1 = Array.from({ length: 500 }, (_, i) => makeRow(i + 1));
    // Page 2: partial page (3 rows) → loop terminates
    const page2 = [makeRow(501), makeRow(502), makeRow(503)];

    mockFindMany
      .mockResolvedValueOnce(page1) // first call — no cursor
      .mockResolvedValueOnce(page2); // second call — with cursor

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    // First call: no cursor
    const firstCallArgs = mockFindMany.mock.calls[0][0];
    expect(firstCallArgs).not.toHaveProperty('cursor');

    // Second call: cursor points to last id of page 1 (row-500)
    const secondCallArgs = mockFindMany.mock.calls[1][0];
    expect(secondCallArgs).toMatchObject({
      cursor: { id: 'row-500' },
      skip: 1,
    });

    // Two calls total — partial page 2 terminates the loop
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  // ── filter forwarding ───────────────────────────────────────────────────────

  it('forwards tenantId filter to every findMany call', async () => {
    mockFindMany.mockResolvedValue([]);

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
      tenantId: 'tenant-abc',
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-abc' }),
      }),
    );
  });

  it('forwards action filter to Prisma where clause', async () => {
    mockFindMany.mockResolvedValue([]);

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
      action: AuditAction.UPDATE,
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: AuditAction.UPDATE }),
      }),
    );
  });

  it('forwards resourceType as entityType filter', async () => {
    mockFindMany.mockResolvedValue([]);

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
      resourceType: 'Invoice',
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: 'Invoice' }),
      }),
    );
  });

  // ── date bounds ─────────────────────────────────────────────────────────────

  it('sets createdAt gte/lte from from+to query params', async () => {
    mockFindMany.mockResolvedValue([]);

    const query: AuditLogExportQueryDto = {
      from: '2025-03-01',
      to: '2025-03-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    await collectStream(stream);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: new Date('2025-03-01T00:00:00.000Z'),
            lte: new Date('2025-03-31T23:59:59.999Z'),
          }),
        }),
      }),
    );
  });

  // ── error surfacing ─────────────────────────────────────────────────────────

  it('destroys the stream if Prisma throws', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);

    await expect(collectStream(stream)).rejects.toThrow('DB connection lost');
  });

  // ── RFC 4180 escaping ───────────────────────────────────────────────────────

  it('quotes CSV cells that contain a comma', async () => {
    const rowWithComma = { ...makeRow(1), changeSummary: 'fee, updated' };
    mockFindMany.mockResolvedValueOnce([rowWithComma]);
    // second call returns empty → terminates loop
    mockFindMany.mockResolvedValueOnce([]);

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    expect(output).toContain('"fee, updated"');
  });

  it('doubles double-quotes inside a CSV cell', async () => {
    const rowWithQuote = { ...makeRow(1), changeSummary: 'he said "hello"' };
    // First call returns 1 row (< 500), loop terminates after that
    mockFindMany.mockResolvedValueOnce([rowWithQuote]);

    const query: AuditLogExportQueryDto = {
      from: '2025-01-01',
      to: '2025-01-31',
    };
    const stream = service.exportAuditLogsCsv(query);
    const output = await collectStream(stream);

    expect(output).toContain('"he said ""hello"""');
  });
});
