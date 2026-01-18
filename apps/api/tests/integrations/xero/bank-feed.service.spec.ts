/**
 * BankFeedService Tests
 * TASK-RECON-038: Fix Xero Bank Feed Fee Sign Preservation
 *
 * Tests for BankFeedService covering:
 * - Fee sign preservation (CRITICAL: negative amounts must stay negative)
 * - Transaction import with correct sign conventions
 * - Credit vs debit classification
 * - Catch-all account detection
 * - Fee transaction detection
 *
 * Sign Convention Standard:
 * - Fees/Charges: amountCents=NEGATIVE, isCredit=false (DEBIT)
 * - Income: amountCents=POSITIVE, isCredit=true (CREDIT)
 *
 * South African context: All amounts in ZAR cents
 */

// Set required environment variables before importing modules
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-32-chars-min';
process.env.XERO_CLIENT_ID = 'test-client-id';
process.env.XERO_CLIENT_SECRET = 'test-client-secret';
process.env.XERO_REDIRECT_URI = 'http://localhost:3000/callback';

import { Test, TestingModule } from '@nestjs/testing';
import { BankConnectionStatus } from '@prisma/client';
import { BankFeedService } from '../../../src/integrations/xero/bank-feed.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import {
  XeroBankTransaction,
  XeroStatementLine,
} from '../../../src/integrations/xero/types/bank-feed.types';

describe('BankFeedService - Fee Sign Preservation (TASK-RECON-038)', () => {
  let service: BankFeedService;
  let mockPrisma: any;
  let mockTransactionRepo: any;
  let mockAuditLogService: any;

  // Test data
  const tenantId = 'tenant-123';

  const mockConnection = {
    id: 'conn-001',
    tenantId,
    xeroAccountId: 'xero-acc-001',
    accountName: 'Business Current Account',
    accountNumber: '1234567890',
    bankName: 'FNB',
    status: BankConnectionStatus.ACTIVE,
    connectedAt: new Date('2024-01-01'),
    lastSyncAt: null,
    errorMessage: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      bankConnection: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      xeroToken: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockTransactionRepo = {
      findByXeroId: jest.fn(),
      create: jest.fn(),
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankFeedService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TransactionRepository, useValue: mockTransactionRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<BankFeedService>(BankFeedService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('importTransaction - Fee Sign Preservation', () => {
    it('should preserve NEGATIVE sign for Cash Deposit Fee (-R6.36)', async () => {
      // Arrange: Xero sends fees with NEGATIVE amounts
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-fee-001',
        bankAccount: {
          accountID: 'xero-acc-001',
          name: 'Business Current Account',
          code: '090',
        },
        type: 'SPEND',
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Cash Deposit Fee',
            quantity: 1,
            unitAmount: 6.36,
            accountCode: '461',
            taxType: 'NONE',
          },
        ],
        subTotal: 6.36,
        totalTax: 0,
        total: -6.36, // NEGATIVE: fee reduces bank balance
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-tx-001' });

      // Act: Call the private method using reflection
      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, xeroTx);

      // Assert: Amount should be NEGATIVE (-636 cents), isCredit should be false
      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          xeroTransactionId: 'tx-fee-001',
          amountCents: -636, // MUST be negative!
          isCredit: false, // Fee is a DEBIT
          source: ImportSource.BANK_FEED,
        }),
      );
    });

    it('should preserve NEGATIVE sign for Monthly Service Fee (-R52.64)', async () => {
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-fee-002',
        bankAccount: {
          accountID: 'xero-acc-001',
          name: 'Business Current Account',
          code: '090',
        },
        type: 'SPEND',
        date: '2025-10-31',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Monthly Service Fee',
            quantity: 1,
            unitAmount: 52.64,
            accountCode: '461',
            taxType: 'NONE',
          },
        ],
        subTotal: 52.64,
        totalTax: 0,
        total: -52.64, // NEGATIVE
        isReconciled: false,
        updatedDateUTC: '2025-10-31T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-tx-002' });

      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, xeroTx);

      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: -5264, // MUST be negative! R52.64 = 5264 cents
          isCredit: false,
        }),
      );
    });

    it('should preserve NEGATIVE sign for Bank Charges (-R25.00)', async () => {
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-fee-003',
        bankAccount: {
          accountID: 'xero-acc-001',
          name: 'Business Current Account',
          code: '090',
        },
        type: 'SPEND',
        date: '2025-10-15',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Bank Charges',
            quantity: 1,
            unitAmount: 25.0,
            accountCode: '461',
            taxType: 'NONE',
          },
        ],
        subTotal: 25.0,
        totalTax: 0,
        total: -25.0, // NEGATIVE
        isReconciled: false,
        updatedDateUTC: '2025-10-15T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-tx-003' });

      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, xeroTx);

      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: -2500, // MUST be negative!
          isCredit: false,
        }),
      );
    });

    it('should preserve POSITIVE sign for credit transactions (income R3,500)', async () => {
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-income-001',
        bankAccount: {
          accountID: 'xero-acc-001',
          name: 'Business Current Account',
          code: '090',
        },
        type: 'RECEIVE',
        contact: {
          contactID: 'contact-001',
          name: 'Parent Payment',
        },
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Payment Received',
            quantity: 1,
            unitAmount: 3500.0,
            accountCode: '200',
            taxType: 'NONE',
          },
        ],
        subTotal: 3500.0,
        totalTax: 0,
        total: 3500.0, // POSITIVE: income increases bank balance
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-tx-004' });

      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, xeroTx);

      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 350000, // MUST be positive! R3500 = 350000 cents
          isCredit: true, // Income is a CREDIT
        }),
      );
    });

    it('should handle mixed deposit + fee correctly', async () => {
      // Simulate a real-world scenario: deposit and its fee
      const deposit: XeroBankTransaction = {
        bankTransactionID: 'tx-deposit',
        bankAccount: { accountID: 'acc', name: 'Test', code: '090' },
        type: 'RECEIVE',
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Cash Deposit',
            quantity: 1,
            unitAmount: 1000,
            accountCode: '200',
            taxType: 'NONE',
          },
        ],
        subTotal: 1000,
        totalTax: 0,
        total: 1000.0, // Positive
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      const depositFee: XeroBankTransaction = {
        bankTransactionID: 'tx-deposit-fee',
        bankAccount: { accountID: 'acc', name: 'Test', code: '090' },
        type: 'SPEND',
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Cash Deposit Fee',
            quantity: 1,
            unitAmount: 6.36,
            accountCode: '461',
            taxType: 'NONE',
          },
        ],
        subTotal: 6.36,
        totalTax: 0,
        total: -6.36, // Negative
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-tx' });

      const importMethod = (service as any).importTransaction.bind(service);

      // Import deposit
      await importMethod(tenantId, mockConnection, deposit);
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 100000, // +R1000.00
          isCredit: true,
        }),
      );

      // Import fee
      await importMethod(tenantId, mockConnection, depositFee);
      expect(mockTransactionRepo.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          amountCents: -636, // -R6.36 (NEGATIVE!)
          isCredit: false,
        }),
      );
    });

    it('should skip DELETED transactions', async () => {
      const deletedTx: XeroBankTransaction = {
        bankTransactionID: 'tx-deleted',
        bankAccount: { accountID: 'acc', name: 'Test', code: '090' },
        type: 'SPEND',
        date: '2025-10-17',
        status: 'DELETED',
        lineItems: [],
        subTotal: 0,
        totalTax: 0,
        total: -100,
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, deletedTx);

      expect(result).toBe('skipped');
      expect(mockTransactionRepo.create).not.toHaveBeenCalled();
    });

    it('should return duplicate for existing transactions', async () => {
      const existingTx: XeroBankTransaction = {
        bankTransactionID: 'tx-existing',
        bankAccount: { accountID: 'acc', name: 'Test', code: '090' },
        type: 'RECEIVE',
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Existing',
            quantity: 1,
            unitAmount: 100,
            accountCode: '200',
            taxType: 'NONE',
          },
        ],
        subTotal: 100,
        totalTax: 0,
        total: 100,
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue({ id: 'existing-id' });

      const importMethod = (service as any).importTransaction.bind(service);
      const result = await importMethod(tenantId, mockConnection, existingTx);

      expect(result).toBe('duplicate');
      expect(mockTransactionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('importStatementLine - Fee Sign Preservation', () => {
    it('should preserve NEGATIVE sign for fee statement lines', async () => {
      const feeLine: XeroStatementLine = {
        statementLineId: 'line-fee-001',
        postedDate: '2025-10-17',
        payee: 'Bank Fee',
        amount: -6.36, // NEGATIVE
        isReconciled: false,
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-line-001' });

      const importMethod = (service as any).importStatementLine.bind(service);
      const result = await importMethod(tenantId, mockConnection, feeLine);

      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: -636, // MUST be negative!
          isCredit: false,
        }),
      );
    });

    it('should preserve POSITIVE sign for credit statement lines', async () => {
      const creditLine: XeroStatementLine = {
        statementLineId: 'line-credit-001',
        postedDate: '2025-10-17',
        payee: 'Customer Payment',
        amount: 1000.0, // POSITIVE
        isReconciled: false,
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new-line-002' });

      const importMethod = (service as any).importStatementLine.bind(service);
      const result = await importMethod(tenantId, mockConnection, creditLine);

      expect(result).toBe('created');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 100000, // MUST be positive!
          isCredit: true,
        }),
      );
    });

    it('should skip statement lines without date', async () => {
      const noDateLine: XeroStatementLine = {
        statementLineId: 'line-no-date',
        postedDate: '', // Empty date
        payee: 'Unknown',
        amount: 100,
        isReconciled: false,
      };

      const importMethod = (service as any).importStatementLine.bind(service);
      const result = await importMethod(tenantId, mockConnection, noDateLine);

      expect(result).toBe('skipped');
      expect(mockTransactionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('isCatchAllAccount', () => {
    it('should detect catch-all account codes', () => {
      const isCatchAll = (service as any).isCatchAllAccount.bind(service);

      // Known catch-all codes
      expect(isCatchAll('9999', undefined)).toBe(true);
      expect(isCatchAll('9998', undefined)).toBe(true);
      expect(isCatchAll('999', undefined)).toBe(true);
      expect(isCatchAll('SUSPENSE', undefined)).toBe(true);
      expect(isCatchAll('CLEARING', undefined)).toBe(true);
      expect(isCatchAll('TBC', undefined)).toBe(true);

      // Normal account codes
      expect(isCatchAll('200', undefined)).toBe(false);
      expect(isCatchAll('461', undefined)).toBe(false);
      expect(isCatchAll('400', undefined)).toBe(false);
    });

    it('should detect catch-all account names by pattern', () => {
      const isCatchAll = (service as any).isCatchAllAccount.bind(service);

      // Catch-all patterns
      expect(isCatchAll(undefined, 'Suspense Account')).toBe(true);
      expect(isCatchAll(undefined, 'To Be Categorized')).toBe(true);
      expect(isCatchAll(undefined, 'Uncategorized')).toBe(true);
      expect(isCatchAll(undefined, 'Ask Me Later')).toBe(true);
      expect(isCatchAll(undefined, 'Unallocated Expenses')).toBe(true);

      // Normal account names
      expect(isCatchAll(undefined, 'Bank Fees')).toBe(false);
      expect(isCatchAll(undefined, 'Revenue')).toBe(false);
      expect(isCatchAll(undefined, 'Cost of Sales')).toBe(false);
    });
  });

  describe('isFeeTransaction', () => {
    it('should detect fee transaction descriptions', () => {
      const isFee = (service as any).isFeeTransaction.bind(service);

      // Fee patterns
      expect(isFee('Cash Deposit Fee')).toBe(true);
      expect(isFee('Monthly Service Fee')).toBe(true);
      expect(isFee('Bank Charges')).toBe(true);
      expect(isFee('Transaction Fee')).toBe(true);
      expect(isFee('Service Charge')).toBe(true);

      // Non-fee descriptions
      expect(isFee('Payment Received')).toBe(false);
      expect(isFee('Cash Deposit')).toBe(false);
      expect(isFee('Transfer In')).toBe(false);
      expect(isFee('Invoice INV-001')).toBe(false);
    });
  });

  describe('South African Business Context', () => {
    it('should handle ZAR cents correctly for small fees (R6.36)', async () => {
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-zar-small',
        bankAccount: { accountID: 'acc', name: 'FNB Business', code: '090' },
        type: 'SPEND',
        date: '2025-10-17',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Cash Deposit Fee',
            quantity: 1,
            unitAmount: 6.36,
            accountCode: '461',
            taxType: 'NONE',
          },
        ],
        subTotal: 6.36,
        totalTax: 0,
        total: -6.36,
        isReconciled: false,
        updatedDateUTC: '2025-10-17T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new' });

      const importMethod = (service as any).importTransaction.bind(service);
      await importMethod(tenantId, mockConnection, xeroTx);

      // R6.36 = 636 cents (negative)
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: -636,
        }),
      );
    });

    it('should handle ZAR cents correctly for typical childcare payment (R3,500)', async () => {
      const xeroTx: XeroBankTransaction = {
        bankTransactionID: 'tx-zar-payment',
        bankAccount: { accountID: 'acc', name: 'FNB Business', code: '090' },
        type: 'RECEIVE',
        contact: { contactID: 'parent-001', name: 'Parent Payment' },
        date: '2025-10-01',
        status: 'AUTHORISED',
        lineItems: [
          {
            description: 'Monthly Fee Payment',
            quantity: 1,
            unitAmount: 3500.0,
            accountCode: '200',
            taxType: 'NONE',
          },
        ],
        subTotal: 3500.0,
        totalTax: 0,
        total: 3500.0,
        isReconciled: false,
        updatedDateUTC: '2025-10-01T00:00:00',
      };

      mockTransactionRepo.findByXeroId.mockResolvedValue(null);
      mockTransactionRepo.create.mockResolvedValue({ id: 'new' });

      const importMethod = (service as any).importTransaction.bind(service);
      await importMethod(tenantId, mockConnection, xeroTx);

      // R3,500.00 = 350000 cents (positive)
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 350000,
          isCredit: true,
        }),
      );
    });
  });
});
