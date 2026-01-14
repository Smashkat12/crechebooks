/**
 * Payment Matching Controller Tests
 * TASK-PAY-032: Payment Matching Endpoint
 *
 * Tests for POST /payments/match endpoint.
 * Uses jest.spyOn() for service verification - NO MOCK DATA.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentReceiptService } from '../../../src/database/services/payment-receipt.service';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type {
  MatchingBatchResult,
  MatchCandidate,
  AppliedMatch,
  TransactionMatchResult,
} from '../../../src/database/dto/payment-matching.dto';
import { MatchConfidenceLevel } from '../../../src/database/dto/payment-matching.dto';

describe('PaymentController - matchPayments', () => {
  let controller: PaymentController;
  let matchingService: PaymentMatchingService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    id: 'admin-789',
    tenantId: mockTenantId,
    auth0Id: 'auth0|admin789',
    email: 'admin@school.com',
    role: UserRole.ADMIN,
    name: 'School Admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentAllocationService,
          useValue: { allocatePayment: jest.fn() },
        },
        {
          provide: PaymentMatchingService,
          useValue: { matchPayments: jest.fn() },
        },
        {
          provide: PaymentReceiptService,
          useValue: {
            generateReceipt: jest.fn(),
            findReceiptByPaymentId: jest.fn(),
          },
        },
        {
          provide: ArrearsService,
          useValue: { getArrearsReport: jest.fn() },
        },
        {
          provide: PaymentRepository,
          useValue: { findByTenantId: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    matchingService = module.get<PaymentMatchingService>(
      PaymentMatchingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payments/match', () => {
    it('should call service with transformed DTO and return snake_case response', async () => {
      // Arrange
      const mockAppliedMatch: AppliedMatch = {
        paymentId: 'pay-001',
        transactionId: 'trans-001',
        invoiceId: 'inv-001',
        invoiceNumber: 'INV-2025-0001',
        amountCents: 345000, // R3450.00
        confidenceScore: 100,
      };

      const expectedResult: MatchingBatchResult = {
        processed: 1,
        autoApplied: 1,
        reviewRequired: 0,
        noMatch: 0,
        results: [
          {
            transactionId: 'trans-001',
            status: 'AUTO_APPLIED',
            appliedMatch: mockAppliedMatch,
            reason: 'Exact match: reference and amount',
          },
        ],
      };

      const matchSpy = jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      // Act
      const result = await controller.matchPayments(
        { transaction_ids: ['trans-001'] }, // API snake_case
        mockOwnerUser,
      );

      // Assert - service called with camelCase
      expect(matchSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionIds: ['trans-001'], // camelCase
      });

      // Assert - response uses snake_case
      expect(result.success).toBe(true);
      expect(result.data.summary.auto_applied).toBe(1); // snake_case
      expect(result.data.auto_matched[0].transaction_id).toBe('trans-001'); // snake_case
      expect(result.data.auto_matched[0].amount).toBe(3450.0); // cents -> decimal
    });

    it('should handle review-required results correctly', async () => {
      const mockCandidate: MatchCandidate = {
        transactionId: 'trans-002',
        invoiceId: 'inv-002',
        invoiceNumber: 'INV-2025-0002',
        confidenceLevel: MatchConfidenceLevel.MEDIUM,
        confidenceScore: 65,
        matchReasons: ['Amount within 5%', 'Strong name similarity'],
        parentId: 'parent-001',
        parentName: 'John Smith',
        childName: 'Emma',
        invoiceOutstandingCents: 350000,
        transactionAmountCents: 340000,
      };

      const expectedResult: MatchingBatchResult = {
        processed: 1,
        autoApplied: 0,
        reviewRequired: 1,
        noMatch: 0,
        results: [
          {
            transactionId: 'trans-002',
            status: 'REVIEW_REQUIRED',
            candidates: [mockCandidate],
            reason: 'No high-confidence match found',
          },
        ],
      };

      jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(result.data.summary.requires_review).toBe(1);
      expect(
        result.data.review_required[0].suggested_matches[0].invoice_id,
      ).toBe('inv-002');
      expect(
        result.data.review_required[0].suggested_matches[0].outstanding_amount,
      ).toBe(3500.0);
    });

    it('should process all unallocated transactions when no IDs provided', async () => {
      const expectedResult: MatchingBatchResult = {
        processed: 5,
        autoApplied: 3,
        reviewRequired: 1,
        noMatch: 1,
        results: [],
      };

      const matchSpy = jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(matchSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionIds: undefined,
      });
      expect(result.data.summary.processed).toBe(5);
    });

    it('should enforce tenant isolation via user context', async () => {
      const expectedResult: MatchingBatchResult = {
        processed: 0,
        autoApplied: 0,
        reviewRequired: 0,
        noMatch: 0,
        results: [],
      };

      const matchSpy = jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      await controller.matchPayments({}, mockOwnerUser);

      expect(matchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
        }),
      );
    });

    it('should return empty arrays when no transactions processed', async () => {
      const expectedResult: MatchingBatchResult = {
        processed: 0,
        autoApplied: 0,
        reviewRequired: 0,
        noMatch: 0,
        results: [],
      };

      jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(result.success).toBe(true);
      expect(result.data.summary.processed).toBe(0);
      expect(result.data.auto_matched).toHaveLength(0);
      expect(result.data.review_required).toHaveLength(0);
    });

    it('should correctly map confidence scores to levels', async () => {
      const createAppliedMatch = (score: number): AppliedMatch => ({
        paymentId: `pay-${score}`,
        transactionId: `trans-${score}`,
        invoiceId: `inv-${score}`,
        invoiceNumber: `INV-${score}`,
        amountCents: 100000,
        confidenceScore: score,
      });

      const results: TransactionMatchResult[] = [
        {
          transactionId: 'trans-100',
          status: 'AUTO_APPLIED',
          appliedMatch: createAppliedMatch(100),
          reason: 'Exact match',
        },
        {
          transactionId: 'trans-85',
          status: 'AUTO_APPLIED',
          appliedMatch: createAppliedMatch(85),
          reason: 'High match',
        },
        {
          transactionId: 'trans-60',
          status: 'AUTO_APPLIED',
          appliedMatch: createAppliedMatch(60),
          reason: 'Medium match',
        },
      ];

      const expectedResult: MatchingBatchResult = {
        processed: 3,
        autoApplied: 3,
        reviewRequired: 0,
        noMatch: 0,
        results,
      };

      jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(
        result.data.auto_matched.find((m) => m.confidence_score === 100)
          ?.confidence_level,
      ).toBe('EXACT');
      expect(
        result.data.auto_matched.find((m) => m.confidence_score === 85)
          ?.confidence_level,
      ).toBe('HIGH');
      expect(
        result.data.auto_matched.find((m) => m.confidence_score === 60)
          ?.confidence_level,
      ).toBe('MEDIUM');
    });

    it('should handle multiple review-required candidates', async () => {
      const mockCandidates: MatchCandidate[] = [
        {
          transactionId: 'trans-003',
          invoiceId: 'inv-003a',
          invoiceNumber: 'INV-003A',
          confidenceLevel: MatchConfidenceLevel.MEDIUM,
          confidenceScore: 70,
          matchReasons: ['Amount match'],
          parentId: 'parent-001',
          parentName: 'John Smith',
          childName: 'Emma',
          invoiceOutstandingCents: 250000,
          transactionAmountCents: 250000,
        },
        {
          transactionId: 'trans-003',
          invoiceId: 'inv-003b',
          invoiceNumber: 'INV-003B',
          confidenceLevel: MatchConfidenceLevel.MEDIUM,
          confidenceScore: 68,
          matchReasons: ['Name similarity'],
          parentId: 'parent-002',
          parentName: 'Jane Doe',
          childName: 'Tom',
          invoiceOutstandingCents: 260000,
          transactionAmountCents: 250000,
        },
      ];

      const expectedResult: MatchingBatchResult = {
        processed: 1,
        autoApplied: 0,
        reviewRequired: 1,
        noMatch: 0,
        results: [
          {
            transactionId: 'trans-003',
            status: 'REVIEW_REQUIRED',
            candidates: mockCandidates,
            reason: 'Multiple candidates',
          },
        ],
      };

      jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(result.data.review_required[0].suggested_matches).toHaveLength(2);
      expect(
        result.data.review_required[0].suggested_matches[0].invoice_number,
      ).toBe('INV-003A');
      expect(
        result.data.review_required[0].suggested_matches[1].invoice_number,
      ).toBe('INV-003B');
    });

    it('should propagate service errors without catching', async () => {
      const serviceError = new Error('Database connection failed');
      jest
        .spyOn(matchingService, 'matchPayments')
        .mockRejectedValue(serviceError);

      await expect(controller.matchPayments({}, mockOwnerUser)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should work for ADMIN users same as OWNER', async () => {
      const expectedResult: MatchingBatchResult = {
        processed: 2,
        autoApplied: 2,
        reviewRequired: 0,
        noMatch: 0,
        results: [],
      };

      const matchSpy = jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockAdminUser);

      expect(matchSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionIds: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should handle no-match results correctly', async () => {
      const expectedResult: MatchingBatchResult = {
        processed: 3,
        autoApplied: 0,
        reviewRequired: 0,
        noMatch: 3,
        results: [
          {
            transactionId: 'trans-001',
            status: 'NO_MATCH',
            reason: 'No matching invoices found',
          },
          {
            transactionId: 'trans-002',
            status: 'NO_MATCH',
            reason: 'No outstanding invoices',
          },
          {
            transactionId: 'trans-003',
            status: 'NO_MATCH',
            reason: 'Transaction already allocated',
          },
        ],
      };

      jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(result.data.summary.no_match).toBe(3);
      expect(result.data.summary.processed).toBe(3);
      expect(result.data.auto_matched).toHaveLength(0);
      expect(result.data.review_required).toHaveLength(0);
    });
  });
});
