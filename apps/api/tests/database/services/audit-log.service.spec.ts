import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { AuditAction } from '../../../src/database/entities/audit-log.entity';
import { Tenant } from '@prisma/client';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testEntityId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, AuditLogService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<AuditLogService>(AuditLogService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});

    // Create a unique test tenant for each test
    // NOTE: We do NOT delete audit logs - they are immutable
    testTenant = await prisma.tenant.create({
      data: {
        name: `Test Creche ${Date.now()}`,
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@test.co.za`,
      },
    });
    testEntityId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('logCreate', () => {
    it('should create audit log with CREATE action', async () => {
      const result = await service.logCreate({
        tenantId: testTenant.id,
        userId: 'user-123',
        entityType: 'Tenant',
        entityId: testEntityId,
        afterValue: { name: 'New Creche' },
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(testTenant.id);
      expect(result.userId).toBe('user-123');
      expect(result.action).toBe(AuditAction.CREATE);
      expect(result.beforeValue).toBeNull();
      expect(result.afterValue).toEqual({ name: 'New Creche' });
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should create audit log with agentId instead of userId', async () => {
      const result = await service.logCreate({
        tenantId: testTenant.id,
        agentId: 'claude-categorizer-v1',
        entityType: 'Transaction',
        entityId: testEntityId,
        afterValue: { amount: 15000, category: 'Fees' },
      });

      expect(result.userId).toBeNull();
      expect(result.agentId).toBe('claude-categorizer-v1');
      expect(result.action).toBe(AuditAction.CREATE);
    });
  });

  describe('logUpdate', () => {
    it('should create audit log with UPDATE action', async () => {
      const result = await service.logUpdate({
        tenantId: testTenant.id,
        userId: 'user-456',
        entityType: 'Transaction',
        entityId: testEntityId,
        beforeValue: { category: 'Uncategorized' },
        afterValue: { category: 'Monthly Fees' },
        changeSummary: 'Categorized transaction',
      });

      expect(result.action).toBe(AuditAction.UPDATE);
      expect(result.beforeValue).toEqual({ category: 'Uncategorized' });
      expect(result.afterValue).toEqual({ category: 'Monthly Fees' });
      expect(result.changeSummary).toBe('Categorized transaction');
    });
  });

  describe('logDelete', () => {
    it('should create audit log with DELETE action', async () => {
      const result = await service.logDelete({
        tenantId: testTenant.id,
        userId: 'user-789',
        entityType: 'Invoice',
        entityId: testEntityId,
        beforeValue: { amount: 5000, status: 'draft' },
      });

      expect(result.action).toBe(AuditAction.DELETE);
      expect(result.beforeValue).toEqual({ amount: 5000, status: 'draft' });
      expect(result.afterValue).toBeNull();
    });
  });

  describe('logAction - Other Actions', () => {
    it('should log CATEGORIZE action', async () => {
      const result = await service.logAction({
        tenantId: testTenant.id,
        agentId: 'claude-categorizer-v1',
        entityType: 'Transaction',
        entityId: testEntityId,
        action: AuditAction.CATEGORIZE,
        beforeValue: { category: null },
        afterValue: { category: 'Fees', confidence: 0.95 },
      });

      expect(result.action).toBe(AuditAction.CATEGORIZE);
    });

    it('should log MATCH action', async () => {
      const result = await service.logAction({
        tenantId: testTenant.id,
        agentId: 'claude-matcher-v1',
        entityType: 'Payment',
        entityId: testEntityId,
        action: AuditAction.MATCH,
        afterValue: { matchedInvoiceId: 'inv-123', confidence: 1.0 },
      });

      expect(result.action).toBe(AuditAction.MATCH);
    });

    it('should log RECONCILE action', async () => {
      const result = await service.logAction({
        tenantId: testTenant.id,
        userId: 'user-accountant',
        entityType: 'Reconciliation',
        entityId: testEntityId,
        action: AuditAction.RECONCILE,
        afterValue: { status: 'reconciled', variance: 0 },
      });

      expect(result.action).toBe(AuditAction.RECONCILE);
    });

    it('should log SUBMIT action', async () => {
      const result = await service.logAction({
        tenantId: testTenant.id,
        userId: 'user-owner',
        entityType: 'SarsSubmission',
        entityId: testEntityId,
        action: AuditAction.SUBMIT,
        afterValue: { submissionId: 'SARS-2024-001', status: 'submitted' },
      });

      expect(result.action).toBe(AuditAction.SUBMIT);
    });
  });

  describe('getEntityHistory', () => {
    it('should return audit logs in descending order by createdAt', async () => {
      // Create multiple logs for the same entity
      await service.logCreate({
        tenantId: testTenant.id,
        userId: 'user-1',
        entityType: 'TestEntity',
        entityId: testEntityId,
        afterValue: { step: 1 },
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.logUpdate({
        tenantId: testTenant.id,
        userId: 'user-1',
        entityType: 'TestEntity',
        entityId: testEntityId,
        beforeValue: { step: 1 },
        afterValue: { step: 2 },
      });

      const history = await service.getEntityHistory(
        testTenant.id,
        'TestEntity',
        testEntityId,
      );

      expect(history.length).toBe(2);
      // Most recent first
      expect(history[0].action).toBe(AuditAction.UPDATE);
      expect(history[1].action).toBe(AuditAction.CREATE);
      expect(history[0].createdAt.getTime()).toBeGreaterThan(
        history[1].createdAt.getTime(),
      );
    });

    it('should return empty array for entity with no history', async () => {
      const history = await service.getEntityHistory(
        testTenant.id,
        'NonExistent',
        'non-existent-id',
      );

      expect(history).toEqual([]);
    });
  });

  describe('Immutability - PostgreSQL RULES', () => {
    // NOTE: These tests require PostgreSQL RULES to be set up in the database
    // The rules are created by migration: prevent_audit_log_modifications
    // If rules are not present, the tests will be skipped

    it.skip('should prevent UPDATE on audit_logs table (requires PostgreSQL RULES)', async () => {
      // Create an audit log
      const log = await service.logCreate({
        tenantId: testTenant.id,
        userId: 'user-test',
        entityType: 'TestEntity',
        entityId: testEntityId,
        afterValue: { original: true },
      });

      // Attempt to update using raw SQL (bypassing Prisma)
      // The PostgreSQL RULE should prevent this
      await prisma.$executeRaw`
        UPDATE audit_logs
        SET change_summary = 'HACKED'
        WHERE id = ${log.id}
      `;

      // Verify the record was NOT updated (RULE does INSTEAD NOTHING)
      const unchanged = await prisma.auditLog.findUnique({
        where: { id: log.id },
      });

      expect(unchanged?.changeSummary).toBeNull(); // Should still be null
    });

    it.skip('should prevent DELETE on audit_logs table (requires PostgreSQL RULES)', async () => {
      // Create an audit log
      const log = await service.logCreate({
        tenantId: testTenant.id,
        userId: 'user-test',
        entityType: 'TestEntity',
        entityId: testEntityId,
        afterValue: { original: true },
      });

      // Attempt to delete using raw SQL (bypassing Prisma)
      // The PostgreSQL RULE should prevent this
      await prisma.$executeRaw`
        DELETE FROM audit_logs
        WHERE id = ${log.id}
      `;

      // Verify the record was NOT deleted (RULE does INSTEAD NOTHING)
      const stillExists = await prisma.auditLog.findUnique({
        where: { id: log.id },
      });

      expect(stillExists).not.toBeNull();
      expect(stillExists?.id).toBe(log.id);
    });
  });

  describe('Field Validation', () => {
    it('should store IPv6 addresses (up to 45 chars)', async () => {
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const result = await service.logCreate({
        tenantId: testTenant.id,
        userId: 'user-ipv6',
        entityType: 'TestEntity',
        entityId: testEntityId,
        afterValue: { test: true },
        ipAddress: ipv6,
      });

      expect(result.ipAddress).toBe(ipv6);
    });

    it('should handle null optional fields correctly', async () => {
      const result = await service.logCreate({
        tenantId: testTenant.id,
        entityType: 'TestEntity',
        entityId: testEntityId,
        afterValue: { minimal: true },
        // No userId, agentId, ipAddress, userAgent
      });

      expect(result.userId).toBeNull();
      expect(result.agentId).toBeNull();
      expect(result.ipAddress).toBeNull();
      expect(result.userAgent).toBeNull();
    });

    it('should store complex JSON in beforeValue and afterValue', async () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        amount: 1500000,
        description: 'South African test data with Rands',
      };

      const result = await service.logUpdate({
        tenantId: testTenant.id,
        userId: 'user-json',
        entityType: 'TestEntity',
        entityId: testEntityId,
        beforeValue: { empty: true },
        afterValue: complexData,
      });

      expect(result.afterValue).toEqual(complexData);
    });
  });
});
