/**
 * XeroSyncService Integration Tests
 * TASK-TRANS-014
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Mocks only external Xero API calls (we can't call real Xero in tests)
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { ConflictDetectionService } from '../../../src/database/services/conflict-detection.service';
import { ConflictResolutionService } from '../../../src/database/services/conflict-resolution.service';
import { XeroCircuitBreaker } from '../../../src/integrations/circuit-breaker';
import { PendingSyncQueueService } from '../../../src/database/services/pending-sync-queue.service';
import { ConfigService } from '@nestjs/config';
import { XeroAccountRepository } from '../../../src/database/repositories/xero-account.repository';
import { CategorizationJournalRepository } from '../../../src/database/repositories/categorization-journal.repository';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import {
  VatType,
  CategorizationSource,
} from '../../../src/database/entities/categorization.entity';
import { Tenant, User, Transaction } from '@prisma/client';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';

// Mock Xero MCP tools and TokenManager
jest.mock('../../../src/mcp/xero-mcp/tools', () => ({
  getAccounts: jest.fn(),
  getTransactions: jest.fn(),
  updateTransaction: jest.fn(),
}));

jest.mock('../../../src/mcp/xero-mcp/auth/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    hasValidConnection: jest.fn().mockResolvedValue(true),
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    getXeroTenantId: jest.fn().mockResolvedValue('mock-xero-tenant-id'),
  })),
}));

// Import mocked functions for manipulation
import * as xeroTools from '../../../src/mcp/xero-mcp/tools';
import { TokenManager } from '../../../src/mcp/xero-mcp/auth/token-manager';

describe('XeroSyncService', () => {
  let service: XeroSyncService;
  let transactionRepo: TransactionRepository;
  let categorizationRepo: CategorizationRepository;
  let prisma: PrismaService;
  let circuitBreaker: XeroCircuitBreaker;
  let testTenant: Tenant;
  let testUser: User;

  // Mock Xero data
  const mockXeroAccounts = [
    { code: '4100', name: 'Sales Income', type: 'REVENUE' },
    { code: '5100', name: 'Purchases', type: 'EXPENSE' },
    { code: '5200', name: 'Utilities', type: 'EXPENSE' },
  ];

  const mockXeroTransactions = [
    {
      transactionId: 'xero-tx-001',
      bankAccount: 'FNB Business',
      date: new Date('2024-01-15'),
      description: 'Payment from Parent A',
      payeeName: 'Parent A',
      reference: 'INV-001',
      amountCents: 150000,
      isCredit: true,
      accountCode: '4100',
    },
    {
      transactionId: 'xero-tx-002',
      bankAccount: 'FNB Business',
      date: new Date('2024-01-16'),
      description: 'Eskom Electricity',
      payeeName: 'ESKOM',
      reference: null,
      amountCents: 200000,
      isCredit: false,
      accountCode: null,
    },
  ];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        CategorizationRepository,
        PaymentRepository,
        XeroAccountRepository,
        CategorizationJournalRepository,
        AuditLogService,
        ConflictDetectionService,
        ConflictResolutionService,
        XeroCircuitBreaker,
        PendingSyncQueueService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue: number) => {
                switch (key) {
                  case 'XERO_CIRCUIT_BREAKER_TIMEOUT':
                    return 5000;
                  case 'XERO_CIRCUIT_BREAKER_ERROR_THRESHOLD':
                    return 50;
                  case 'XERO_CIRCUIT_BREAKER_RESET_TIMEOUT':
                    return 30000;
                  case 'XERO_CIRCUIT_BREAKER_VOLUME_THRESHOLD':
                    return 5;
                  default:
                    return defaultValue;
                }
              }),
          },
        },
        XeroSyncService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    categorizationRepo = module.get<CategorizationRepository>(
      CategorizationRepository,
    );
    service = module.get<XeroSyncService>(XeroSyncService);
    circuitBreaker = module.get<XeroCircuitBreaker>(XeroCircuitBreaker);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    // Cleanup circuit breaker to prevent resource leaks
    if (circuitBreaker) {
      circuitBreaker.onModuleDestroy();
    }
    if (prisma) {
      await prisma.onModuleDestroy();
    }
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    (xeroTools.getAccounts as jest.Mock).mockResolvedValue(mockXeroAccounts);
    (xeroTools.getTransactions as jest.Mock).mockResolvedValue(
      mockXeroTransactions,
    );
    (xeroTools.updateTransaction as jest.Mock).mockResolvedValue(undefined);

    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${Date.now()}@littlestars.co.za`,
        auth0Id: `auth0|test${Date.now()}`,
        name: 'Test User',
        role: 'ADMIN',
      },
    });
  });

  // Helper to create a test transaction
  async function createTransaction(
    overrides: Partial<Transaction> = {},
  ): Promise<Transaction> {
    return transactionRepo.create({
      tenantId: testTenant.id,
      bankAccount: 'FNB Cheque',
      date: new Date('2024-01-15'),
      description: 'Test Transaction',
      amountCents: 100000,
      isCredit: false,
      source: ImportSource.CSV_IMPORT,
      ...overrides,
    } as any);
  }

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('syncTransactions', () => {
    it('should sync multiple categorized transactions to Xero', async () => {
      // Create transactions with Xero IDs
      const tx1 = await createTransaction({
        xeroTransactionId: 'xero-001',
        description: 'Test TX 1',
      });
      const tx2 = await createTransaction({
        xeroTransactionId: 'xero-002',
        description: 'Test TX 2',
      });

      // Add categorizations
      await categorizationRepo.create({
        transactionId: tx1.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 95,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });
      await categorizationRepo.create({
        transactionId: tx2.id,
        accountCode: '5200',
        accountName: 'Utilities',
        confidenceScore: 90,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      const result = await service.syncTransactions(
        [tx1.id, tx2.id],
        testTenant.id,
      );

      expect(result.totalProcessed).toBe(2);
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);

      // Verify updateTransaction was called
      expect(xeroTools.updateTransaction).toHaveBeenCalledTimes(2);

      // Verify transactions marked as synced
      const updated1 = await transactionRepo.findById(testTenant.id, tx1.id);
      const updated2 = await transactionRepo.findById(testTenant.id, tx2.id);
      expect(updated1?.status).toBe(TransactionStatus.SYNCED);
      expect(updated2?.status).toBe(TransactionStatus.SYNCED);
    });

    it('should skip transactions without Xero ID', async () => {
      const tx = await createTransaction({
        description: 'No Xero ID',
        // No xeroTransactionId
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 90,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      const result = await service.syncTransactions([tx.id], testTenant.id);

      expect(result.totalProcessed).toBe(1);
      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should skip already synced transactions', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-already-synced',
        description: 'Already Synced',
      });

      // Set status to SYNCED
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.SYNCED },
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 90,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      const result = await service.syncTransactions([tx.id], testTenant.id);

      expect(result.skipped).toBe(1);
      expect(result.synced).toBe(0);
    });

    it('should fail for uncategorized transactions', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-uncategorized',
        description: 'Uncategorized TX',
      });

      const result = await service.syncTransactions([tx.id], testTenant.id);

      expect(result.failed).toBe(1);
      expect(result.errors[0].code).toBe('NOT_CATEGORIZED');
    });

    it('should handle empty transaction list', async () => {
      const result = await service.syncTransactions([], testTenant.id);

      expect(result.totalProcessed).toBe(0);
      expect(result.synced).toBe(0);
    });
  });

  describe('pushToXero', () => {
    it('should push single transaction to Xero', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-push-001',
        description: 'Push Test TX',
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 95,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      const synced = await service.pushToXero(tx.id, testTenant.id);

      expect(synced).toBe(true);
      expect(xeroTools.updateTransaction).toHaveBeenCalledWith(
        expect.anything(), // XeroClient
        'mock-xero-tenant-id',
        'xero-push-001',
        '5100',
      );
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        service.pushToXero('non-existent-id', testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException for uncategorized transaction', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-push-uncategorized',
        description: 'Uncategorized TX',
      });

      await expect(service.pushToXero(tx.id, testTenant.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('pullFromXero', () => {
    it('should pull transactions from Xero', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      const result = await service.pullFromXero(
        testTenant.id,
        dateFrom,
        dateTo,
      );

      expect(result.transactionsPulled).toBe(2);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify getTransactions was called with correct params
      expect(xeroTools.getTransactions).toHaveBeenCalledWith(
        expect.anything(), // XeroClient
        'mock-xero-tenant-id',
        {
          fromDate: '2024-01-01',
          toDate: '2024-01-31',
        },
      );

      // Verify transactions were created in database
      const transactions = await prisma.transaction.findMany({
        where: { tenantId: testTenant.id },
      });
      expect(transactions).toHaveLength(2);
    });

    it('should skip duplicate transactions', async () => {
      // First, create a transaction with the same Xero ID
      await createTransaction({
        xeroTransactionId: 'xero-tx-001',
        description: 'Existing TX',
      });

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      const result = await service.pullFromXero(
        testTenant.id,
        dateFrom,
        dateTo,
      );

      expect(result.transactionsPulled).toBe(1); // Only the second one
      expect(result.duplicatesSkipped).toBe(1);
    });

    it('should set correct import source for pulled transactions', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      await service.pullFromXero(testTenant.id, dateFrom, dateTo);

      const transactions = await prisma.transaction.findMany({
        where: { tenantId: testTenant.id },
      });

      transactions.forEach((tx) => {
        expect(tx.source).toBe(ImportSource.BANK_FEED);
      });
    });
  });

  describe('syncChartOfAccounts', () => {
    it('should fetch accounts from Xero', async () => {
      const result = await service.syncChartOfAccounts(testTenant.id);

      expect(result.accountsFetched).toBe(3);
      expect(result.newAccounts).toContain('4100: Sales Income');
      expect(result.newAccounts).toContain('5100: Purchases');
      expect(result.newAccounts).toContain('5200: Utilities');
      expect(result.errors).toHaveLength(0);

      // Verify getAccounts was called
      expect(xeroTools.getAccounts).toHaveBeenCalled();
    });

    it('should create audit log for Chart of Accounts sync', async () => {
      await service.syncChartOfAccounts(testTenant.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'ChartOfAccounts',
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hasValidConnection', () => {
    it('should return true when connection is valid', async () => {
      const result = await service.hasValidConnection(testTenant.id);
      expect(result).toBe(true);
    });

    it('should return false when hasValidConnection throws', async () => {
      // The service catches errors and returns false
      // We need to override the tokenManager on the service instance
      const mockTokenManagerInstance = {
        hasValidConnection: jest
          .fn()
          .mockRejectedValue(new Error('Connection error')),
        getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
        getXeroTenantId: jest.fn().mockResolvedValue('mock-xero-tenant-id'),
      };

      // Override tokenManager via any
      (service as any).tokenManager = mockTokenManagerInstance;

      const result = await service.hasValidConnection(testTenant.id);
      expect(result).toBe(false);

      // Restore the original mock
      (service as any).tokenManager = new TokenManager();
    });
  });

  describe('VAT mapping', () => {
    it('should map CrecheBooks VAT types to Xero tax types', () => {
      expect(service.mapVatToXeroTax('STANDARD')).toBe('OUTPUT2');
      expect(service.mapVatToXeroTax('ZERO_RATED')).toBe('ZERORATEDOUTPUT');
      expect(service.mapVatToXeroTax('EXEMPT')).toBe('EXEMPTOUTPUT');
      expect(service.mapVatToXeroTax('NO_VAT')).toBe('NONE');
      expect(service.mapVatToXeroTax('UNKNOWN')).toBe('NONE');
    });

    it('should map Xero tax types to CrecheBooks VAT types', () => {
      expect(service.mapXeroTaxToVat('OUTPUT2')).toBe('STANDARD');
      expect(service.mapXeroTaxToVat('ZERORATEDOUTPUT')).toBe('ZERO_RATED');
      expect(service.mapXeroTaxToVat('EXEMPTOUTPUT')).toBe('EXEMPT');
      expect(service.mapXeroTaxToVat('NONE')).toBe('NO_VAT');
      expect(service.mapXeroTaxToVat('UNKNOWN_TAX')).toBe('NO_VAT');
    });
  });

  describe('multi-tenant isolation', () => {
    it('should not sync transactions from other tenants', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@other.co.za`,
        },
      });

      // Create transaction in other tenant
      const otherTx = await transactionRepo.create({
        tenantId: otherTenant.id,
        bankAccount: 'FNB Cheque',
        date: new Date('2024-01-15'),
        description: 'Other Tenant TX',
        amountCents: 100000,
        isCredit: false,
        source: ImportSource.CSV_IMPORT,
        xeroTransactionId: 'xero-other-001',
      } as any);

      // Try to sync from wrong tenant
      const result = await service.syncTransactions(
        [otherTx.id],
        testTenant.id,
      );

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('not found');
    });
  });

  describe('audit trail', () => {
    it('should create audit log when syncing to Xero', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-audit-001',
        description: 'Audit Trail TX',
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 95,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      await service.pushToXero(tx.id, testTenant.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Transaction',
          entityId: tx.id,
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const syncLog = auditLogs.find((log) =>
        log.changeSummary?.includes('Synced to Xero'),
      );
      expect(syncLog).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle Xero API errors gracefully', async () => {
      const tx = await createTransaction({
        xeroTransactionId: 'xero-error-001',
        description: 'Error TX',
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 95,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      // Mock Xero API error
      (xeroTools.updateTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('Xero API Error: Rate limit exceeded'),
      );

      const result = await service.syncTransactions([tx.id], testTenant.id);

      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('Rate limit exceeded');
    });

    it('should throw BusinessException when no Xero connection', async () => {
      // Recreate service with mock that returns false for hasValidConnection
      const mockTokenManagerInstance = {
        hasValidConnection: jest.fn().mockResolvedValue(false),
        getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
        getXeroTenantId: jest.fn().mockResolvedValue('mock-xero-tenant-id'),
      };

      // Create a new service instance with overridden tokenManager
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PrismaService,
          TransactionRepository,
          CategorizationRepository,
          PaymentRepository,
          AuditLogService,
          ConflictDetectionService,
          ConflictResolutionService,
          XeroSyncService,
        ],
      }).compile();

      const testService = module.get<XeroSyncService>(XeroSyncService);
      // Access private tokenManager via any
      (testService as any).tokenManager = mockTokenManagerInstance;

      const tx = await createTransaction({
        xeroTransactionId: 'xero-no-connection',
        description: 'No Connection TX',
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: '5100',
        accountName: 'Purchases',
        confidenceScore: 95,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 13043,
      });

      await expect(
        testService.pushToXero(tx.id, testTenant.id),
      ).rejects.toThrow(BusinessException);
    });
  });
});
