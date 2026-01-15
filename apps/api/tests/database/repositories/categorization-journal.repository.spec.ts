import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { CategorizationJournalRepository } from '../../../src/database/repositories/categorization-journal.repository';
import {
  Tenant,
  Transaction,
  CategorizationJournalStatus,
  ImportSource,
  TransactionStatus,
} from '@prisma/client';
import {
  NotFoundException,
  DatabaseException,
} from '../../../src/shared/exceptions';

describe('CategorizationJournalRepository', () => {
  let repository: CategorizationJournalRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let transaction: Transaction;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, CategorizationJournalRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<CategorizationJournalRepository>(
      CategorizationJournalRepository,
    );

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.categorizationJournal.deleteMany({});
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

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@creche.co.za`,
      },
    });

    // Create test transaction
    transaction = await prisma.transaction.create({
      data: {
        tenantId: tenant.id,
        bankAccount: 'FNB-CHEQUE',
        date: new Date(),
        description: 'DEBIT ORDER PnP Insurance',
        payeeName: 'PnP Insurance',
        amountCents: 125000,
        isCredit: false,
        source: ImportSource.CSV_IMPORT,
        status: TransactionStatus.CATEGORIZED,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('should create a categorization journal', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration:
          'Categorization: PnP Insurance moved from Suspense to Expenses',
      });

      expect(journal.id).toBeDefined();
      expect(journal.tenantId).toBe(tenant.id);
      expect(journal.transactionId).toBe(transaction.id);
      expect(journal.fromAccountCode).toBe('9999');
      expect(journal.toAccountCode).toBe('6001');
      expect(journal.amountCents).toBe(125000);
      expect(journal.isCredit).toBe(false);
      expect(journal.status).toBe(CategorizationJournalStatus.PENDING);
      expect(journal.xeroJournalId).toBeNull();
    });

    it('should fail if journal already exists for transaction', async () => {
      // Create first journal
      await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'First journal',
      });

      // Attempt to create second journal for same transaction
      await expect(
        repository.create({
          tenantId: tenant.id,
          transactionId: transaction.id,
          fromAccountCode: '9999',
          toAccountCode: '6002',
          amountCents: 125000,
          isCredit: false,
          narration: 'Second journal',
        }),
      ).rejects.toThrow(DatabaseException);
    });
  });

  describe('findById', () => {
    it('should find a journal by ID', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      const found = await repository.findById(created.id, tenant.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent journal', async () => {
      const found = await repository.findById('non-existent-id', tenant.id);
      expect(found).toBeNull();
    });
  });

  describe('findByTransactionId', () => {
    it('should find a journal by transaction ID', async () => {
      await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      const found = await repository.findByTransactionId(transaction.id);

      expect(found).not.toBeNull();
      expect(found!.transactionId).toBe(transaction.id);
    });
  });

  describe('findByIdWithTransaction', () => {
    it('should return journal with transaction details', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      const found = await repository.findByIdWithTransaction(
        created.id,
        tenant.id,
      );

      expect(found).not.toBeNull();
      expect(found!.transaction).toBeDefined();
      expect(found!.transaction.id).toBe(transaction.id);
      expect(found!.transaction.description).toBe('DEBIT ORDER PnP Insurance');
    });
  });

  describe('findPendingByTenant', () => {
    it('should return only pending journals', async () => {
      // Create pending journal
      await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Pending journal',
      });

      const pending = await repository.findPendingByTenant(tenant.id);

      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe(CategorizationJournalStatus.PENDING);
    });
  });

  describe('markAsPosted', () => {
    it('should update journal status to POSTED', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      await repository.markAsPosted(journal.id, 'xero-journal-123', 'MJ-12345');

      const updated = await repository.findById(journal.id, tenant.id);

      expect(updated!.status).toBe(CategorizationJournalStatus.POSTED);
      expect(updated!.xeroJournalId).toBe('xero-journal-123');
      expect(updated!.journalNumber).toBe('MJ-12345');
      expect(updated!.postedAt).toBeDefined();
      expect(updated!.errorMessage).toBeNull();
    });

    it('should throw NotFoundException for non-existent journal', async () => {
      await expect(
        repository.markAsPosted('non-existent', 'xero-123', 'MJ-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsFailed', () => {
    it('should update journal status to FAILED and increment retry count', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      await repository.markAsFailed(journal.id, 'Xero API error');

      const updated = await repository.findById(journal.id, tenant.id);

      expect(updated!.status).toBe(CategorizationJournalStatus.FAILED);
      expect(updated!.errorMessage).toBe('Xero API error');
      expect(updated!.retryCount).toBe(1);

      // Mark as failed again
      await repository.markAsFailed(journal.id, 'Second attempt failed');

      const secondUpdate = await repository.findById(journal.id, tenant.id);
      expect(secondUpdate!.retryCount).toBe(2);
    });
  });

  describe('findFailedByTenant', () => {
    it('should return failed journals with retry count below max', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      // Mark as failed
      await repository.markAsFailed(journal.id, 'First failure');

      const failed = await repository.findFailedByTenant(tenant.id, 3);

      expect(failed.length).toBe(1);
      expect(failed[0].status).toBe(CategorizationJournalStatus.FAILED);
      expect(failed[0].retryCount).toBeLessThan(3);
    });
  });

  describe('resetForRetry', () => {
    it('should reset a failed journal to pending', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      await repository.markAsFailed(journal.id, 'API error');
      await repository.resetForRetry(journal.id);

      const updated = await repository.findById(journal.id, tenant.id);

      expect(updated!.status).toBe(CategorizationJournalStatus.PENDING);
      expect(updated!.errorMessage).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      // Create a transaction for a second journal
      const transaction2 = await prisma.transaction.create({
        data: {
          tenantId: tenant.id,
          bankAccount: 'FNB-CHEQUE',
          date: new Date(),
          description: 'Another transaction',
          amountCents: 50000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      // Create journals in different states
      const pendingJournal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Pending journal',
      });

      const postedJournal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction2.id,
        fromAccountCode: '9999',
        toAccountCode: '6002',
        amountCents: 50000,
        isCredit: false,
        narration: 'Posted journal',
      });

      await repository.markAsPosted(postedJournal.id, 'xero-123', 'MJ-123');

      const stats = await repository.getStats(tenant.id);

      expect(stats.pending).toBe(1);
      expect(stats.posted).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.totalAmountCents).toBe(175000);
    });
  });

  describe('delete', () => {
    it('TC-002: should delete a non-posted journal with correct tenant', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      await repository.delete(journal.id, tenant.id);

      const found = await repository.findById(journal.id, tenant.id);
      expect(found).toBeNull();
    });

    it('should throw error when deleting a posted journal', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      await repository.markAsPosted(journal.id, 'xero-123', 'MJ-123');

      await expect(repository.delete(journal.id, tenant.id)).rejects.toThrow(
        DatabaseException,
      );
    });

    it('TC-001: should throw NotFoundException when deleting with wrong tenant (cross-tenant deletion blocked)', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche Delete',
          addressLine1: '456 Delete Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27217654321',
          email: `other-delete-${Date.now()}@creche.co.za`,
        },
      });

      // Attempt cross-tenant deletion - should fail
      await expect(
        repository.delete(journal.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);

      // Verify original record still exists
      const found = await repository.findById(journal.id, tenant.id);
      expect(found).not.toBeNull();
    });

    it('TC-003: should throw NotFoundException for non-existent journal ID', async () => {
      await expect(
        repository.delete('non-existent-id', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('TC-004: error message should not leak tenant information', async () => {
      const journal = await repository.create({
        tenantId: tenant.id,
        transactionId: transaction.id,
        fromAccountCode: '9999',
        toAccountCode: '6001',
        amountCents: 125000,
        isCredit: false,
        narration: 'Test journal',
      });

      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Leak Test Creche',
          addressLine1: '789 Test Street',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4001',
          phone: '+27317654321',
          email: `leak-test-${Date.now()}@creche.co.za`,
        },
      });

      try {
        await repository.delete(journal.id, otherTenant.id);
        fail('Expected NotFoundException to be thrown');
      } catch (error) {
        // Error message should be generic "not found" - not reveal tenant ownership
        expect(error.message).not.toContain(tenant.id);
        expect(error.message).not.toContain(otherTenant.id);
        expect(error.message).not.toContain('wrong tenant');
        expect(error.message).not.toContain('different tenant');
      }
    });
  });
});
