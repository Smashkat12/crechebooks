/**
 * Split Transaction Matcher Service Tests
 * TASK-RECON-035: Split Transaction Matching
 *
 * Tests for the split transaction matching service including
 * subset sum algorithm, match suggestion, confirmation, and rejection.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SplitTransactionMatcherService } from '../../../src/database/services/split-transaction-matcher.service';
import { PrismaService } from '../../../src/database/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SplitMatchStatus, SplitMatchType } from '@prisma/client';

describe('SplitTransactionMatcherService', () => {
  let service: SplitTransactionMatcherService;
  let prisma: jest.Mocked<PrismaService>;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockBankTransactionId = 'bank-tx-789';

  // Mock unpaid invoices for testing
  const mockUnpaidInvoices = [
    {
      id: 'inv-1',
      totalCents: 50000, // R500
      invoiceNumber: 'INV-001',
      description: 'Invoice 1',
    },
    {
      id: 'inv-2',
      totalCents: 30000, // R300
      invoiceNumber: 'INV-002',
      description: 'Invoice 2',
    },
    {
      id: 'inv-3',
      totalCents: 20000, // R200
      invoiceNumber: 'INV-003',
      description: 'Invoice 3',
    },
    {
      id: 'inv-4',
      totalCents: 15000, // R150
      invoiceNumber: 'INV-004',
      description: 'Invoice 4',
    },
    {
      id: 'inv-5',
      totalCents: 10000, // R100
      invoiceNumber: 'INV-005',
      description: 'Invoice 5',
    },
  ];

  // Mock split match for testing
  const mockSplitMatch = {
    id: 'split-match-1',
    tenantId: mockTenantId,
    bankTransactionId: mockBankTransactionId,
    matchType: SplitMatchType.ONE_TO_MANY,
    totalAmountCents: 80000,
    matchedAmountCents: 80000,
    remainderCents: 0,
    status: SplitMatchStatus.PENDING,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    components: [
      {
        id: 'comp-1',
        splitMatchId: 'split-match-1',
        invoiceId: 'inv-1',
        paymentId: null,
        amountCents: 50000,
        createdAt: new Date(),
        invoice: {
          invoiceNumber: 'INV-001',
          description: 'Invoice 1',
        },
      },
      {
        id: 'comp-2',
        splitMatchId: 'split-match-1',
        invoiceId: 'inv-2',
        paymentId: null,
        amountCents: 30000,
        createdAt: new Date(),
        invoice: {
          invoiceNumber: 'INV-002',
          description: 'Invoice 2',
        },
      },
    ],
  };

  beforeEach(async () => {
    const mockPrisma = {
      invoice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      splitMatch: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      splitMatchComponent: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitTransactionMatcherService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<SplitTransactionMatcherService>(
      SplitTransactionMatcherService,
    );
    prisma = module.get(PrismaService);
  });

  describe('suggestSplitMatches', () => {
    it('should return empty array when not enough unpaid invoices', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([
        mockUnpaidInvoices[0],
      ]);

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 80000,
      });

      expect(result).toEqual([]);
    });

    it('should find exact match combinations', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(
        mockUnpaidInvoices,
      );
      (prisma.splitMatch.create as jest.Mock).mockResolvedValue(mockSplitMatch);

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 80000, // R500 + R300 = R800
        tolerance_cents: 100,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(prisma.splitMatch.create).toHaveBeenCalled();
    });

    it('should find match within tolerance', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(
        mockUnpaidInvoices,
      );
      (prisma.splitMatch.create as jest.Mock).mockResolvedValue({
        ...mockSplitMatch,
        matchedAmountCents: 80000,
        remainderCents: 50,
      });

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 80050, // R500 + R300 + R0.50 tolerance
        tolerance_cents: 100,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect max_components limit', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(
        mockUnpaidInvoices,
      );
      (prisma.splitMatch.create as jest.Mock).mockResolvedValue(mockSplitMatch);

      await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 125000, // R1250 - would need 4+ invoices
        tolerance_cents: 100,
        max_components: 3,
      });

      // The create call should only have at most 3 components
      const createCall = (prisma.splitMatch.create as jest.Mock).mock.calls[0];
      if (createCall) {
        const data = createCall[0].data;
        expect(data.components?.create?.length || 0).toBeLessThanOrEqual(3);
      }
    });

    it('should return empty when no valid combinations found', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'inv-1',
          totalCents: 10000,
          invoiceNumber: 'INV-001',
          description: 'Small invoice',
        },
        {
          id: 'inv-2',
          totalCents: 10000,
          invoiceNumber: 'INV-002',
          description: 'Small invoice 2',
        },
      ]);

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 500000, // R5000 - too large for available invoices
        tolerance_cents: 100,
      });

      expect(result).toEqual([]);
    });
  });

  describe('confirmSplitMatch', () => {
    it('should throw NotFoundException for non-existent split match', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.confirmSplitMatch(
          mockTenantId,
          {
            split_match_id: 'non-existent',
          },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already confirmed', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue({
        ...mockSplitMatch,
        status: SplitMatchStatus.CONFIRMED,
      });

      await expect(
        service.confirmSplitMatch(
          mockTenantId,
          {
            split_match_id: mockSplitMatch.id,
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already rejected', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue({
        ...mockSplitMatch,
        status: SplitMatchStatus.REJECTED,
      });

      await expect(
        service.confirmSplitMatch(
          mockTenantId,
          {
            split_match_id: mockSplitMatch.id,
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should confirm split match and create payments', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(
        mockSplitMatch,
      );

      const confirmedMatch = {
        ...mockSplitMatch,
        status: SplitMatchStatus.CONFIRMED,
        confirmedBy: mockUserId,
        confirmedAt: new Date(),
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            splitMatchComponent: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            splitMatch: {
              update: jest.fn().mockResolvedValue(confirmedMatch),
            },
            payment: {
              create: jest.fn(),
              aggregate: jest
                .fn()
                .mockResolvedValue({ _sum: { amountCents: 50000 } }),
            },
            invoice: {
              findUnique: jest.fn().mockResolvedValue({ totalCents: 50000 }),
              update: jest.fn(),
            },
          };
          return callback(tx);
        },
      );

      const result = await service.confirmSplitMatch(
        mockTenantId,
        { split_match_id: mockSplitMatch.id },
        mockUserId,
      );

      expect(result.splitMatch.status).toBe('CONFIRMED');
      expect(result.paymentsCreated).toBeGreaterThanOrEqual(0);
    });

    it('should allow custom components override', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(
        mockSplitMatch,
      );

      const confirmedMatch = {
        ...mockSplitMatch,
        status: SplitMatchStatus.CONFIRMED,
        confirmedBy: mockUserId,
        confirmedAt: new Date(),
        matchedAmountCents: 70000,
        remainderCents: 10000,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            splitMatchComponent: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            splitMatch: {
              update: jest.fn().mockResolvedValue(confirmedMatch),
            },
            payment: {
              create: jest.fn(),
              aggregate: jest
                .fn()
                .mockResolvedValue({ _sum: { amountCents: 50000 } }),
            },
            invoice: {
              findUnique: jest.fn().mockResolvedValue({ totalCents: 50000 }),
              update: jest.fn(),
            },
          };
          return callback(tx);
        },
      );

      const result = await service.confirmSplitMatch(
        mockTenantId,
        {
          split_match_id: mockSplitMatch.id,
          components: [
            { invoice_id: 'inv-1', amount_cents: 50000 },
            { invoice_id: 'inv-3', amount_cents: 20000 },
          ],
        },
        mockUserId,
      );

      expect(result.splitMatch.matched_amount_cents).toBe(70000);
    });
  });

  describe('rejectSplitMatch', () => {
    it('should throw NotFoundException for non-existent split match', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.rejectSplitMatch(mockTenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already confirmed', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue({
        ...mockSplitMatch,
        status: SplitMatchStatus.CONFIRMED,
      });

      await expect(
        service.rejectSplitMatch(mockTenantId, mockSplitMatch.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject pending split match', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(
        mockSplitMatch,
      );
      (prisma.splitMatch.update as jest.Mock).mockResolvedValue({
        ...mockSplitMatch,
        status: SplitMatchStatus.REJECTED,
      });

      const result = await service.rejectSplitMatch(
        mockTenantId,
        mockSplitMatch.id,
        'Not the correct combination',
      );

      expect(result.status).toBe('REJECTED');
      expect(prisma.splitMatch.update).toHaveBeenCalledWith({
        where: { id: mockSplitMatch.id },
        data: { status: SplitMatchStatus.REJECTED },
        include: expect.any(Object),
      });
    });
  });

  describe('getSplitMatches', () => {
    it('should return paginated results', async () => {
      (prisma.splitMatch.findMany as jest.Mock).mockResolvedValue([
        mockSplitMatch,
      ]);
      (prisma.splitMatch.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getSplitMatches(mockTenantId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by status', async () => {
      (prisma.splitMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.splitMatch.count as jest.Mock).mockResolvedValue(0);

      await service.getSplitMatches(mockTenantId, {
        status: 'PENDING' as any,
      });

      expect(prisma.splitMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should filter by match_type', async () => {
      (prisma.splitMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.splitMatch.count as jest.Mock).mockResolvedValue(0);

      await service.getSplitMatches(mockTenantId, {
        match_type: 'ONE_TO_MANY' as any,
      });

      expect(prisma.splitMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            matchType: 'ONE_TO_MANY',
          }),
        }),
      );
    });
  });

  describe('getSplitMatchById', () => {
    it('should return split match by ID', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(
        mockSplitMatch,
      );

      const result = await service.getSplitMatchById(
        mockTenantId,
        mockSplitMatch.id,
      );

      expect(result.id).toBe(mockSplitMatch.id);
      expect(result.bank_transaction_id).toBe(mockBankTransactionId);
      expect(result.components).toHaveLength(2);
    });

    it('should throw NotFoundException for non-existent split match', async () => {
      (prisma.splitMatch.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getSplitMatchById(mockTenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('subset sum algorithm', () => {
    it('should find multiple valid combinations', async () => {
      // R500 + R300 = R800
      // R500 + R200 + R100 = R800
      // R300 + R200 + R150 + R100 = R750 (within R100 tolerance of R800)
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(
        mockUnpaidInvoices,
      );

      let createCallCount = 0;
      (prisma.splitMatch.create as jest.Mock).mockImplementation(() => {
        createCallCount++;
        return Promise.resolve({
          ...mockSplitMatch,
          id: `split-match-${createCallCount}`,
        });
      });

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 80000,
        tolerance_cents: 100,
      });

      // Should find at least one valid combination
      expect(result.length).toBeGreaterThan(0);
    });

    it('should prioritize exact matches over partial matches', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(
        mockUnpaidInvoices,
      );

      const createdMatches: any[] = [];
      (prisma.splitMatch.create as jest.Mock).mockImplementation((args) => {
        const match = {
          ...mockSplitMatch,
          id: `split-match-${createdMatches.length + 1}`,
          matchedAmountCents: args.data.matchedAmountCents,
          remainderCents: args.data.remainderCents,
        };
        createdMatches.push(match);
        return Promise.resolve(match);
      });

      const result = await service.suggestSplitMatches(mockTenantId, {
        bank_transaction_id: mockBankTransactionId,
        amount_cents: 80000,
        tolerance_cents: 100,
      });

      // First result should have smallest remainder
      if (result.length > 1) {
        expect(result[0].remainder_cents).toBeLessThanOrEqual(
          result[1].remainder_cents,
        );
      }
    });
  });
});
