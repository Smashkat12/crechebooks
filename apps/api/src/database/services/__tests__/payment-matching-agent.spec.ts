/**
 * Payment Matching Agent Integration Tests
 * TASK-PAY-016: Invoke PaymentMatcherAgent in PaymentMatchingService
 *
 * @module database/services/__tests__/payment-matching-agent.spec
 * @description Tests for PaymentMatcherAgent integration in PaymentMatchingService,
 * specifically testing ambiguous match resolution with agent decisions.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMatchingService } from '../payment-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentRepository } from '../../repositories/payment.repository';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { AuditLogService } from '../audit-log.service';
import { PaymentMatcherAgent } from '../../../agents/payment-matcher/matcher.agent';
import { MatchDecision } from '../../../agents/payment-matcher/interfaces/matcher.interface';
import { Transaction } from '@prisma/client';

describe('PaymentMatchingService - Agent Integration', () => {
  let service: PaymentMatchingService;
  let prisma: PrismaService;
  let paymentAgent: PaymentMatcherAgent;
  let auditLogService: AuditLogService;

  const mockTenantId = 'tenant-123';
  const mockTransactionId = 'txn-123';
  const mockInvoiceId1 = 'inv-001';
  const mockInvoiceId2 = 'inv-002';

  const mockTransaction: Transaction = {
    id: mockTransactionId,
    tenantId: mockTenantId,
    bankAccount: 'acc-123',
    xeroTransactionId: null,
    date: new Date('2024-01-15'),
    amountCents: 100000, // R1000
    description: 'Payment from John Smith',
    reference: 'INV-2024-001',
    payeeName: 'John Smith',
    isCredit: true,
    isDeleted: false,
    deletedAt: null,
    source: 'BANK_FEED',
    importBatchId: null,
    status: 'PENDING',
    isReconciled: false,
    reconciledAt: null,
    transactionHash: null,
    duplicateOfId: null,
    duplicateStatus: 'NONE',
    reversesTransactionId: null,
    isReversal: false,
    xeroAccountCode: null,
    supplierId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Invoice 1: Matches on amount and name, but reference is slightly different
  const mockInvoiceWithRelations1 = {
    id: mockInvoiceId1,
    invoiceNumber: 'INV-2024-002', // Different invoice number
    totalCents: 100000,
    amountPaidCents: 0,
    parentId: 'parent-001',
    status: 'SENT',
    tenantId: mockTenantId,
    isDeleted: false,
    billingPeriodStart: new Date('2024-01-01'),
    billingPeriodEnd: new Date('2024-01-31'),
    dueDate: new Date('2024-02-15'),
    parent: {
      id: 'parent-001',
      firstName: 'John',
      lastName: 'Smith',
    },
    child: {
      id: 'child-001',
      firstName: 'Alice',
      lastName: 'Smith',
    },
  };

  // Invoice 2: Also matches on amount and name
  const mockInvoiceWithRelations2 = {
    id: mockInvoiceId2,
    invoiceNumber: 'INV-2024-003', // Different invoice number
    totalCents: 100000,
    amountPaidCents: 0,
    parentId: 'parent-001',
    status: 'SENT',
    tenantId: mockTenantId,
    isDeleted: false,
    billingPeriodStart: new Date('2024-01-01'),
    billingPeriodEnd: new Date('2024-01-31'),
    dueDate: new Date('2024-02-15'),
    parent: {
      id: 'parent-001',
      firstName: 'John',
      lastName: 'Smith',
    },
    child: {
      id: 'child-002',
      firstName: 'Bob',
      lastName: 'Smith',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatchingService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            invoice: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            payment: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: PaymentRepository,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: InvoiceRepository,
          useValue: {
            recordPayment: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logAction: jest.fn(),
          },
        },
        {
          provide: PaymentMatcherAgent,
          useValue: {
            makeMatchDecision: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentMatchingService>(PaymentMatchingService);
    prisma = module.get<PrismaService>(PrismaService);
    paymentAgent = module.get<PaymentMatcherAgent>(PaymentMatcherAgent);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create a complete payment mock
  const createPaymentMock = (invoiceId: string) => ({
    id: 'payment-123',
    tenantId: mockTenantId,
    transactionId: mockTransactionId,
    invoiceId,
    amountCents: 100000,
    paymentDate: new Date(),
    matchType: 'PARTIAL' as const,
    matchConfidence: 90,
    matchedBy: 'AI_AUTO' as const,
    isReversed: false,
    reversedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('Agent Integration - Ambiguous Matches', () => {
    it('should invoke agent when multiple high-confidence matches exist', async () => {
      // Arrange: Setup 2 invoices with both having high confidence (>80%)
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      // Mock agent decision: AUTO_APPLY with high confidence
      const mockAgentDecision: MatchDecision = {
        transactionId: mockTransactionId,
        invoiceId: mockInvoiceId1,
        invoiceNumber: 'INV-2024-001',
        confidence: 90,
        action: 'AUTO_APPLY',
        reasoning: 'Exact reference and amount match for invoice 001',
        alternatives: [
          {
            invoiceId: mockInvoiceId2,
            invoiceNumber: 'INV-2024-002',
            confidence: 85,
          },
        ],
      };

      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockResolvedValue(mockAgentDecision);

      jest
        .spyOn(service['paymentRepo'], 'create')
        .mockResolvedValue(createPaymentMock(mockInvoiceId1) as any);
      jest
        .spyOn(service['invoiceRepo'], 'recordPayment')
        .mockResolvedValue({} as any);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(paymentAgent.makeMatchDecision).toHaveBeenCalledTimes(1);
      expect(paymentAgent.makeMatchDecision).toHaveBeenCalledWith(
        mockTransaction,
        expect.arrayContaining([
          expect.objectContaining({
            invoice: expect.objectContaining({
              id: mockInvoiceId1,
            }),
            confidence: expect.any(Number),
          }),
        ]),
        mockTenantId,
        85, // AGENT_CONFIDENCE_HIGH threshold
      );

      expect(result.autoApplied).toBe(1);
      expect(result.results[0].status).toBe('AUTO_APPLIED');
      expect(result.results[0].appliedMatch?.invoiceId).toBe(mockInvoiceId1);
    });

    it('should apply confidence thresholds correctly', async () => {
      // Arrange: Agent returns medium confidence (60-85%)
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      const mockAgentDecision: MatchDecision = {
        transactionId: mockTransactionId,
        invoiceId: mockInvoiceId1,
        invoiceNumber: 'INV-2024-001',
        confidence: 70, // Medium confidence
        action: 'REVIEW_REQUIRED',
        reasoning: 'Moderate confidence - review recommended',
        alternatives: [],
      };

      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockResolvedValue(mockAgentDecision);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(result.reviewRequired).toBe(1);
      expect(result.autoApplied).toBe(0);
      expect(result.results[0].status).toBe('REVIEW_REQUIRED');
      expect(result.results[0].reason).toContain('Agent suggests review');
    });

    it('should flag low confidence matches for manual review', async () => {
      // Arrange: Agent returns low confidence (<60%)
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      const mockAgentDecision: MatchDecision = {
        transactionId: mockTransactionId,
        invoiceId: mockInvoiceId1,
        invoiceNumber: 'INV-2024-001',
        confidence: 45, // Low confidence
        action: 'REVIEW_REQUIRED',
        reasoning: 'Low confidence - manual review required',
        alternatives: [],
      };

      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockResolvedValue(mockAgentDecision);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(result.reviewRequired).toBe(1);
      expect(result.autoApplied).toBe(0);
      expect(result.results[0].status).toBe('REVIEW_REQUIRED');
      expect(result.results[0].reason).toContain(
        'Agent flagged for manual review',
      );
    });
  });

  describe('Agent Retry and Fallback', () => {
    it('should retry agent call up to 3 times on failure', async () => {
      // Arrange
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      // Mock agent to fail twice then succeed
      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockRejectedValueOnce(new Error('Temporary failure 1'))
        .mockRejectedValueOnce(new Error('Temporary failure 2'))
        .mockResolvedValueOnce({
          transactionId: mockTransactionId,
          invoiceId: mockInvoiceId1,
          invoiceNumber: 'INV-2024-001',
          confidence: 90,
          action: 'AUTO_APPLY',
          reasoning: 'Recovered after retries',
          alternatives: [],
        });

      jest
        .spyOn(service['paymentRepo'], 'create')
        .mockResolvedValue(createPaymentMock(mockInvoiceId1) as any);
      jest
        .spyOn(service['invoiceRepo'], 'recordPayment')
        .mockResolvedValue({} as any);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(paymentAgent.makeMatchDecision).toHaveBeenCalledTimes(3);
      expect(result.autoApplied).toBe(1);
      expect(result.results[0].status).toBe('AUTO_APPLIED');
    });

    it('should fallback to manual review after 3 failed retries', async () => {
      // Arrange
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      // Mock agent to always fail
      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockRejectedValue(new Error('Persistent agent failure'));

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(paymentAgent.makeMatchDecision).toHaveBeenCalledTimes(3);
      expect(result.reviewRequired).toBe(1);
      expect(result.autoApplied).toBe(0);
      expect(result.results[0].status).toBe('REVIEW_REQUIRED');
      expect(result.results[0].reason).toContain('Agent resolution failed');

      // Verify audit log for failure
      expect(auditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            agentFailure: true,
            fallbackUsed: 'rule-based',
          }),
        }),
      );
    });
  });

  describe('Agent Decision Logging', () => {
    it('should log all agent decisions to audit log', async () => {
      // Arrange
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([
          mockInvoiceWithRelations1 as any,
          mockInvoiceWithRelations2 as any,
        ]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      const mockAgentDecision: MatchDecision = {
        transactionId: mockTransactionId,
        invoiceId: mockInvoiceId1,
        invoiceNumber: 'INV-2024-001',
        confidence: 90,
        action: 'AUTO_APPLY',
        reasoning: 'Strong match based on reference and amount',
        alternatives: [
          {
            invoiceId: mockInvoiceId2,
            invoiceNumber: 'INV-2024-002',
            confidence: 82,
          },
        ],
      };

      jest
        .spyOn(paymentAgent, 'makeMatchDecision')
        .mockResolvedValue(mockAgentDecision);

      jest
        .spyOn(service['paymentRepo'], 'create')
        .mockResolvedValue(createPaymentMock(mockInvoiceId1) as any);
      jest
        .spyOn(service['invoiceRepo'], 'recordPayment')
        .mockResolvedValue({} as any);

      // Act
      await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert - Check agent decision was logged
      expect(auditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            agentDecision: 'AUTO_APPLY',
            agentConfidence: 90,
            agentReasoning: 'Strong match based on reference and amount',
            selectedInvoice: mockInvoiceId1,
            alternativesCount: 1,
          }),
          changeSummary: expect.stringContaining(
            'Agent resolved ambiguous match',
          ),
        }),
      );

      // Should also log the payment creation
      expect(auditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Payment',
          action: 'CREATE',
        }),
      );
    });
  });

  describe('Agent NOT Invoked Scenarios', () => {
    it('should NOT invoke agent for single high-confidence match', async () => {
      // Arrange: Only one invoice matches with high confidence
      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([mockTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([mockInvoiceWithRelations1 as any]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      jest
        .spyOn(service['paymentRepo'], 'create')
        .mockResolvedValue(createPaymentMock(mockInvoiceId1) as any);
      jest
        .spyOn(service['invoiceRepo'], 'recordPayment')
        .mockResolvedValue({} as any);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(paymentAgent.makeMatchDecision).not.toHaveBeenCalled();
      expect(result.autoApplied).toBe(1);
      expect(result.results[0].status).toBe('AUTO_APPLIED');
    });

    it('should NOT invoke agent when no high-confidence matches exist', async () => {
      // Arrange: Transaction that matches poorly (low confidence)
      const poorMatchTransaction = {
        ...mockTransaction,
        reference: 'UNKNOWN-REF',
        amountCents: 50000, // Different amount
      };

      jest
        .spyOn(prisma.transaction, 'findMany')
        .mockResolvedValue([poorMatchTransaction]);
      jest
        .spyOn(prisma.invoice, 'findMany')
        .mockResolvedValue([mockInvoiceWithRelations1 as any]);
      jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

      // Act
      const result = await service.matchPayments({
        tenantId: mockTenantId,
      });

      // Assert
      expect(paymentAgent.makeMatchDecision).not.toHaveBeenCalled();
      expect(result.reviewRequired).toBe(1);
      expect(result.results[0].status).toBe('REVIEW_REQUIRED');
    });
  });
});
