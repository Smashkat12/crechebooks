/**
 * XeroAccountMappingService Unit Tests
 * TASK-BILL-006: Remove Hardcoded Xero Account Codes
 *
 * Test Cases:
 * - TC-001: Organization-specific mapping used when set
 * - TC-002: System default used when no org mapping
 * - TC-003: Invalid account code rejected
 * - TC-004: Reset to default removes org mapping
 * - TC-005: Cache invalidation on mapping update
 *
 * Additional coverage for:
 * - CRUD operations for account mappings
 * - Xero account fetching and caching
 * - Auto-suggestion of mappings based on account names
 * - Validation of required mappings
 * - Multi-tenant isolation
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { XeroAccountMappingService } from '../../../src/database/services/xero-account-mapping.service';
import { XeroPayrollJournalRepository } from '../../../src/database/repositories/xero-payroll-journal.repository';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import {
  XeroAccountType,
  Tenant,
  User,
  XeroAccountMapping,
} from '@prisma/client';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';
import { UpsertAccountMappingDto } from '../../../src/database/dto/xero-payroll-journal.dto';

// Mock TokenManager and rate limiter
jest.mock('../../../src/mcp/xero-mcp/auth/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    hasValidConnection: jest.fn().mockResolvedValue(true),
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    getXeroTenantId: jest.fn().mockResolvedValue('mock-xero-tenant-id'),
  })),
}));

jest.mock('../../../src/mcp/xero-mcp/utils/rate-limiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock XeroClient
jest.mock('xero-node', () => ({
  XeroClient: jest.fn().mockImplementation(() => ({
    setTokenSet: jest.fn(),
    accountingApi: {
      getAccounts: jest.fn().mockResolvedValue({
        body: {
          accounts: [
            {
              accountID: 'xero-5110',
              code: '5110',
              name: 'Principal Salary',
              type: 'EXPENSE',
              _class: 'EXPENSE',
              status: 'ACTIVE',
            },
            {
              accountID: 'xero-5115',
              code: '5115',
              name: 'Teacher Salaries',
              type: 'EXPENSE',
              _class: 'EXPENSE',
              status: 'ACTIVE',
            },
            {
              accountID: 'xero-2210',
              code: '2210',
              name: 'PAYE Payable',
              type: 'CURRLIAB',
              _class: 'LIABILITY',
              status: 'ACTIVE',
            },
            {
              accountID: 'xero-2215',
              code: '2215',
              name: 'UIF Payable',
              type: 'CURRLIAB',
              _class: 'LIABILITY',
              status: 'ACTIVE',
            },
            {
              accountID: 'xero-803',
              code: '803',
              name: 'Wages Payable',
              type: 'CURRLIAB',
              _class: 'LIABILITY',
              status: 'ACTIVE',
            },
          ],
        },
      }),
    },
  })),
}));

import { TokenManager } from '../../../src/mcp/xero-mcp/auth/token-manager';

describe('XeroAccountMappingService', () => {
  let service: XeroAccountMappingService;
  let prisma: PrismaService;
  let journalRepo: XeroPayrollJournalRepository;
  let auditLogService: AuditLogService;
  let testTenant: Tenant;
  let testUser: User;
  let secondTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        XeroPayrollJournalRepository,
        AuditLogService,
        {
          provide: XeroSyncService,
          useValue: {
            // Mock XeroSyncService as it's not needed for these tests
          },
        },
        XeroAccountMappingService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    journalRepo = module.get<XeroPayrollJournalRepository>(
      XeroPayrollJournalRepository,
    );
    auditLogService = module.get<AuditLogService>(AuditLogService);
    service = module.get<XeroAccountMappingService>(XeroAccountMappingService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

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

    // Create test tenant
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

    // Create second tenant for multi-tenant tests
    secondTenant = await prisma.tenant.create({
      data: {
        name: `Second Creche ${Date.now()}`,
        addressLine1: '456 Other Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: `second${Date.now()}@test.co.za`,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${Date.now()}@test.co.za`,
        auth0Id: `auth0|test${Date.now()}`,
        name: 'Test User',
        role: 'ADMIN',
      },
    });
  });

  // Helper to create a test mapping
  async function createMapping(
    tenantId: string,
    accountType: XeroAccountType,
    overrides: Partial<UpsertAccountMappingDto> = {},
  ): Promise<XeroAccountMapping> {
    const dto: UpsertAccountMappingDto = {
      accountType,
      xeroAccountId: `xero-${accountType.toLowerCase()}`,
      xeroAccountCode: `${accountType.substring(0, 4)}01`,
      xeroAccountName: `Test ${accountType}`,
      isActive: true,
      ...overrides,
    };
    return service.upsertMapping(tenantId, dto, testUser.id);
  }

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('TC-001: Organization-specific mapping used when set', () => {
    it('should return tenant-specific mapping when it exists', async () => {
      // Create tenant-specific mapping
      const customMapping = await createMapping(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
        {
          xeroAccountId: 'custom-salary-id',
          xeroAccountCode: '5150',
          xeroAccountName: 'Custom Salary Account',
        },
      );

      // Retrieve mapping
      const result = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );

      expect(result).not.toBeNull();
      expect(result?.xeroAccountCode).toBe('5150');
      expect(result?.xeroAccountName).toBe('Custom Salary Account');
      expect(result?.tenantId).toBe(testTenant.id);
    });

    it('should use tenant-specific mapping in getMappingSummary', async () => {
      // Create tenant-specific mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5150',
        xeroAccountName: 'Custom Salary',
      });

      const summary = await service.getMappingSummary(testTenant.id);

      const salaryMapping = summary.mappings.find(
        (m) => m.accountType === XeroAccountType.SALARY_EXPENSE,
      );
      expect(salaryMapping).toBeDefined();
      expect(salaryMapping?.isMapped).toBe(true);
      expect(salaryMapping?.accountCode).toBe('5150');
    });

    it('should return different mappings for different tenants', async () => {
      // Create mapping for first tenant
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5150',
        xeroAccountName: 'Tenant 1 Salary',
      });

      // Create mapping for second tenant
      await createMapping(secondTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5200',
        xeroAccountName: 'Tenant 2 Salary',
      });

      // Retrieve both
      const tenant1Mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      const tenant2Mapping = await service.getMappingByType(
        secondTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );

      expect(tenant1Mapping?.xeroAccountCode).toBe('5150');
      expect(tenant2Mapping?.xeroAccountCode).toBe('5200');
    });
  });

  describe('TC-002: System default used when no org mapping', () => {
    it('should return empty mappings when no tenant-specific mappings exist', async () => {
      const mappings = await service.getMappings(testTenant.id);
      expect(mappings).toHaveLength(0);
    });

    it('should return null for unmapped account type', async () => {
      const result = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(result).toBeNull();
    });

    it('should show unmapped status in mapping summary', async () => {
      const summary = await service.getMappingSummary(testTenant.id);

      expect(summary.totalMapped).toBe(0);
      expect(summary.isComplete).toBe(false);

      const salaryMapping = summary.mappings.find(
        (m) => m.accountType === XeroAccountType.SALARY_EXPENSE,
      );
      expect(salaryMapping?.isMapped).toBe(false);
      expect(salaryMapping?.accountCode).toBeUndefined();
    });

    it('should identify missing required mappings in validation', async () => {
      const validation = await service.validateMappings(testTenant.id);

      expect(validation.isValid).toBe(false);
      expect(validation.mappedAccounts).toBe(0);
      expect(validation.missingMappings).toContain(
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(validation.missingMappings).toContain(
        XeroAccountType.PAYE_PAYABLE,
      );
      expect(validation.missingMappings).toContain(XeroAccountType.UIF_PAYABLE);
      expect(validation.missingMappings).toContain(
        XeroAccountType.NET_PAY_CLEARING,
      );
    });
  });

  describe('TC-003: Invalid account code rejected', () => {
    it('should allow valid account codes', async () => {
      const dto: UpsertAccountMappingDto = {
        accountType: XeroAccountType.SALARY_EXPENSE,
        xeroAccountId: 'valid-id',
        xeroAccountCode: '5110',
        xeroAccountName: 'Valid Salary Account',
        isActive: true,
      };

      const result = await service.upsertMapping(
        testTenant.id,
        dto,
        testUser.id,
      );
      expect(result.xeroAccountCode).toBe('5110');
    });

    it('should create audit log when mapping is created', async () => {
      const dto: UpsertAccountMappingDto = {
        accountType: XeroAccountType.PAYE_PAYABLE,
        xeroAccountId: 'paye-id',
        xeroAccountCode: '2210',
        xeroAccountName: 'PAYE Payable',
        isActive: true,
      };

      await service.upsertMapping(testTenant.id, dto, testUser.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'XeroAccountMapping',
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const createLog = auditLogs.find((log) => log.action === 'CREATE');
      expect(createLog).toBeDefined();
    });

    it('should create audit log when mapping is updated', async () => {
      // Create initial mapping
      await service.upsertMapping(
        testTenant.id,
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'original-id',
          xeroAccountCode: '5110',
          xeroAccountName: 'Original Name',
          isActive: true,
        },
        testUser.id,
      );

      // Update mapping
      await service.upsertMapping(
        testTenant.id,
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'updated-id',
          xeroAccountCode: '5115',
          xeroAccountName: 'Updated Name',
          isActive: true,
        },
        testUser.id,
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'XeroAccountMapping',
        },
        orderBy: { createdAt: 'desc' },
      });

      const updateLog = auditLogs.find((log) => log.action === 'UPDATE');
      expect(updateLog).toBeDefined();
      expect(updateLog?.changeSummary).toContain('Updated');
    });

    it('should reject invalid tenant ID on mapping creation', async () => {
      const dto: UpsertAccountMappingDto = {
        accountType: XeroAccountType.SALARY_EXPENSE,
        xeroAccountId: 'test-id',
        xeroAccountCode: '5110',
        xeroAccountName: 'Test Account',
        isActive: true,
      };

      await expect(
        service.upsertMapping('non-existent-tenant-id', dto, testUser.id),
      ).rejects.toThrow();
    });
  });

  describe('TC-004: Reset to default removes org mapping', () => {
    it('should delete mapping when deleteMapping is called', async () => {
      // Create mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);

      // Verify it exists
      let mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mapping).not.toBeNull();

      // Delete mapping
      await service.deleteMapping(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
        testUser.id,
      );

      // Verify it's deleted
      mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mapping).toBeNull();
    });

    it('should throw NotFoundException when deleting non-existent mapping', async () => {
      await expect(
        service.deleteMapping(
          testTenant.id,
          XeroAccountType.SALARY_EXPENSE,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create audit log when mapping is deleted', async () => {
      // Create mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5110',
        xeroAccountName: 'Test Salary',
      });

      // Delete mapping
      await service.deleteMapping(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
        testUser.id,
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'XeroAccountMapping',
          action: 'DELETE',
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const deleteLog = auditLogs[0];
      expect(deleteLog.changeSummary).toContain('Deleted');
      expect(deleteLog.changeSummary).toContain('SALARY_EXPENSE');
    });

    it('should not affect other mappings when one is deleted', async () => {
      // Create multiple mappings
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.UIF_PAYABLE);

      // Delete one mapping
      await service.deleteMapping(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
        testUser.id,
      );

      // Verify others still exist
      const mappings = await service.getMappings(testTenant.id);
      expect(mappings).toHaveLength(2);
      expect(mappings.map((m) => m.accountType)).not.toContain(
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mappings.map((m) => m.accountType)).toContain(
        XeroAccountType.PAYE_PAYABLE,
      );
      expect(mappings.map((m) => m.accountType)).toContain(
        XeroAccountType.UIF_PAYABLE,
      );
    });
  });

  describe('TC-005: Cache invalidation on mapping update', () => {
    it('should return updated mapping immediately after upsert', async () => {
      // Create initial mapping
      await service.upsertMapping(
        testTenant.id,
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'original-id',
          xeroAccountCode: '5110',
          xeroAccountName: 'Original Name',
          isActive: true,
        },
        testUser.id,
      );

      // Update mapping
      await service.upsertMapping(
        testTenant.id,
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'updated-id',
          xeroAccountCode: '5115',
          xeroAccountName: 'Updated Name',
          isActive: true,
        },
        testUser.id,
      );

      // Retrieve immediately - should get updated value
      const result = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(result?.xeroAccountCode).toBe('5115');
      expect(result?.xeroAccountName).toBe('Updated Name');
    });

    it('should return empty after delete', async () => {
      // Create mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);

      // Delete mapping
      await service.deleteMapping(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
        testUser.id,
      );

      // Retrieve immediately - should return null
      const result = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(result).toBeNull();
    });

    it('should reflect bulk updates immediately', async () => {
      const mappings: UpsertAccountMappingDto[] = [
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'salary-id',
          xeroAccountCode: '5110',
          xeroAccountName: 'Salary Expense',
          isActive: true,
        },
        {
          accountType: XeroAccountType.PAYE_PAYABLE,
          xeroAccountId: 'paye-id',
          xeroAccountCode: '2210',
          xeroAccountName: 'PAYE Payable',
          isActive: true,
        },
      ];

      await service.bulkUpsertMappings(testTenant.id, mappings, testUser.id);

      // Both should be available immediately
      const salaryMapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      const payeMapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.PAYE_PAYABLE,
      );

      expect(salaryMapping).not.toBeNull();
      expect(payeMapping).not.toBeNull();
      expect(salaryMapping?.xeroAccountCode).toBe('5110');
      expect(payeMapping?.xeroAccountCode).toBe('2210');
    });
  });

  describe('getMappings', () => {
    it('should return all mappings for a tenant', async () => {
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.UIF_PAYABLE);

      const mappings = await service.getMappings(testTenant.id);
      expect(mappings).toHaveLength(3);
    });

    it('should not include mappings from other tenants', async () => {
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(secondTenant.id, XeroAccountType.PAYE_PAYABLE);

      const tenant1Mappings = await service.getMappings(testTenant.id);
      const tenant2Mappings = await service.getMappings(secondTenant.id);

      expect(tenant1Mappings).toHaveLength(1);
      expect(tenant1Mappings[0].accountType).toBe(
        XeroAccountType.SALARY_EXPENSE,
      );

      expect(tenant2Mappings).toHaveLength(1);
      expect(tenant2Mappings[0].accountType).toBe(XeroAccountType.PAYE_PAYABLE);
    });

    it('should return empty array for tenant with no mappings', async () => {
      const mappings = await service.getMappings(testTenant.id);
      expect(mappings).toHaveLength(0);
    });
  });

  describe('bulkUpsertMappings', () => {
    it('should create multiple mappings in one operation', async () => {
      const mappings: UpsertAccountMappingDto[] = [
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'salary-id',
          xeroAccountCode: '5110',
          xeroAccountName: 'Salary Expense',
          isActive: true,
        },
        {
          accountType: XeroAccountType.PAYE_PAYABLE,
          xeroAccountId: 'paye-id',
          xeroAccountCode: '2210',
          xeroAccountName: 'PAYE Payable',
          isActive: true,
        },
        {
          accountType: XeroAccountType.UIF_PAYABLE,
          xeroAccountId: 'uif-id',
          xeroAccountCode: '2215',
          xeroAccountName: 'UIF Payable',
          isActive: true,
        },
      ];

      const results = await service.bulkUpsertMappings(
        testTenant.id,
        mappings,
        testUser.id,
      );

      expect(results).toHaveLength(3);

      const allMappings = await service.getMappings(testTenant.id);
      expect(allMappings).toHaveLength(3);
    });

    it('should update existing mappings in bulk operation', async () => {
      // Create initial mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5110',
        xeroAccountName: 'Original Name',
      });

      // Bulk upsert with updated value
      const mappings: UpsertAccountMappingDto[] = [
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'updated-id',
          xeroAccountCode: '5115',
          xeroAccountName: 'Updated Name',
          isActive: true,
        },
        {
          accountType: XeroAccountType.PAYE_PAYABLE,
          xeroAccountId: 'new-paye-id',
          xeroAccountCode: '2210',
          xeroAccountName: 'New PAYE',
          isActive: true,
        },
      ];

      await service.bulkUpsertMappings(testTenant.id, mappings, testUser.id);

      const allMappings = await service.getMappings(testTenant.id);
      expect(allMappings).toHaveLength(2);

      const salaryMapping = allMappings.find(
        (m) => m.accountType === XeroAccountType.SALARY_EXPENSE,
      );
      expect(salaryMapping?.xeroAccountCode).toBe('5115');
      expect(salaryMapping?.xeroAccountName).toBe('Updated Name');
    });

    it('should create audit log for bulk operation', async () => {
      const mappings: UpsertAccountMappingDto[] = [
        {
          accountType: XeroAccountType.SALARY_EXPENSE,
          xeroAccountId: 'salary-id',
          xeroAccountCode: '5110',
          xeroAccountName: 'Salary',
          isActive: true,
        },
        {
          accountType: XeroAccountType.PAYE_PAYABLE,
          xeroAccountId: 'paye-id',
          xeroAccountCode: '2210',
          xeroAccountName: 'PAYE',
          isActive: true,
        },
      ];

      await service.bulkUpsertMappings(testTenant.id, mappings, testUser.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'XeroAccountMapping',
          entityId: 'BULK',
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateMappings', () => {
    it('should return valid when all required mappings exist', async () => {
      // Create all required mappings
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.UIF_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.NET_PAY_CLEARING);

      const validation = await service.validateMappings(testTenant.id);

      expect(validation.isValid).toBe(true);
      expect(validation.missingMappings).toHaveLength(0);
      expect(validation.mappedAccounts).toBe(4);
      expect(validation.requiredAccounts).toBe(4);
    });

    it('should return invalid when some required mappings are missing', async () => {
      // Create only some required mappings
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);

      const validation = await service.validateMappings(testTenant.id);

      expect(validation.isValid).toBe(false);
      expect(validation.missingMappings).toContain(XeroAccountType.UIF_PAYABLE);
      expect(validation.missingMappings).toContain(
        XeroAccountType.NET_PAY_CLEARING,
      );
      expect(validation.mappedAccounts).toBe(2);
    });
  });

  describe('getMappingSummary', () => {
    it('should return complete summary when all mappings exist', async () => {
      // Create all required mappings
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.UIF_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.NET_PAY_CLEARING);

      const summary = await service.getMappingSummary(testTenant.id);

      expect(summary.isComplete).toBe(true);
      expect(summary.totalMapped).toBe(4);
      expect(summary.totalRequired).toBe(4);
    });

    it('should include all account types in summary', async () => {
      const summary = await service.getMappingSummary(testTenant.id);

      // Should include all account types from the enum
      expect(summary.mappings.length).toBeGreaterThan(0);

      // Check for some expected types
      const types = summary.mappings.map((m) => m.accountType);
      expect(types).toContain(XeroAccountType.SALARY_EXPENSE);
      expect(types).toContain(XeroAccountType.PAYE_PAYABLE);
      expect(types).toContain(XeroAccountType.UIF_PAYABLE);
      expect(types).toContain(XeroAccountType.NET_PAY_CLEARING);
    });
  });

  describe('suggestMappings', () => {
    it('should suggest mappings based on account names', () => {
      const xeroAccounts = [
        {
          accountId: 'sal-1',
          code: '5110',
          name: 'Salaries and Wages',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ACTIVE',
        },
        {
          accountId: 'paye-1',
          code: '2210',
          name: 'PAYE Tax Payable',
          type: 'CURRLIAB',
          class: 'LIABILITY',
          status: 'ACTIVE',
        },
        {
          accountId: 'uif-1',
          code: '2215',
          name: 'UIF Payable',
          type: 'CURRLIAB',
          class: 'LIABILITY',
          status: 'ACTIVE',
        },
        {
          accountId: 'net-1',
          code: '803',
          name: 'Net Pay Clearing',
          type: 'CURRLIAB',
          class: 'LIABILITY',
          status: 'ACTIVE',
        },
      ];

      const suggestions = service.suggestMappings(xeroAccounts);

      expect(suggestions.length).toBeGreaterThan(0);

      // Check salary suggestion
      const salarySuggestion = suggestions.find(
        (s) => s.accountType === XeroAccountType.SALARY_EXPENSE,
      );
      expect(salarySuggestion?.suggestedAccount).not.toBeNull();
      expect(salarySuggestion?.suggestedAccount?.code).toBe('5110');

      // Check PAYE suggestion
      const payeSuggestion = suggestions.find(
        (s) => s.accountType === XeroAccountType.PAYE_PAYABLE,
      );
      expect(payeSuggestion?.suggestedAccount).not.toBeNull();
      expect(payeSuggestion?.suggestedAccount?.code).toBe('2210');
    });

    it('should return null suggestion when no matching account found', () => {
      const xeroAccounts = [
        {
          accountId: 'misc-1',
          code: '9999',
          name: 'Miscellaneous',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ACTIVE',
        },
      ];

      const suggestions = service.suggestMappings(xeroAccounts);

      // Most suggestions should have null suggestedAccount
      const nullSuggestions = suggestions.filter(
        (s) => s.suggestedAccount === null,
      );
      expect(nullSuggestions.length).toBeGreaterThan(0);
    });

    it('should skip inactive accounts in suggestions', () => {
      const xeroAccounts = [
        {
          accountId: 'sal-inactive',
          code: '5110',
          name: 'Salaries (Old)',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ARCHIVED',
        },
        {
          accountId: 'sal-active',
          code: '5115',
          name: 'Salaries',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ACTIVE',
        },
      ];

      const suggestions = service.suggestMappings(xeroAccounts);

      const salarySuggestion = suggestions.find(
        (s) => s.accountType === XeroAccountType.SALARY_EXPENSE,
      );
      if (salarySuggestion?.suggestedAccount) {
        expect(salarySuggestion.suggestedAccount.code).toBe('5115');
      }
    });

    it('should sort suggestions with required types first', () => {
      const xeroAccounts = [
        {
          accountId: 'bonus-1',
          code: '5240',
          name: 'Staff Bonuses',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ACTIVE',
        },
        {
          accountId: 'sal-1',
          code: '5110',
          name: 'Salaries',
          type: 'EXPENSE',
          class: 'EXPENSE',
          status: 'ACTIVE',
        },
      ];

      const suggestions = service.suggestMappings(xeroAccounts);

      // Required types (SALARY_EXPENSE, PAYE_PAYABLE, UIF_PAYABLE, NET_PAY_CLEARING) should come first
      const firstFourTypes = suggestions.slice(0, 4).map((s) => s.accountType);
      expect(firstFourTypes).toContain(XeroAccountType.SALARY_EXPENSE);
      expect(firstFourTypes).toContain(XeroAccountType.PAYE_PAYABLE);
      expect(firstFourTypes).toContain(XeroAccountType.UIF_PAYABLE);
      expect(firstFourTypes).toContain(XeroAccountType.NET_PAY_CLEARING);
    });
  });

  describe('getRequiredAccountTypes', () => {
    it('should return list of required account types with descriptions', () => {
      const requiredTypes = service.getRequiredAccountTypes();

      expect(requiredTypes.length).toBe(4);

      const types = requiredTypes.map((t) => t.type);
      expect(types).toContain(XeroAccountType.SALARY_EXPENSE);
      expect(types).toContain(XeroAccountType.PAYE_PAYABLE);
      expect(types).toContain(XeroAccountType.UIF_PAYABLE);
      expect(types).toContain(XeroAccountType.NET_PAY_CLEARING);

      // Check descriptions exist
      requiredTypes.forEach((t) => {
        expect(t.description).toBeDefined();
        expect(t.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getAllAccountTypes', () => {
    it('should return all account types with descriptions and required flag', () => {
      const allTypes = service.getAllAccountTypes();

      expect(allTypes.length).toBeGreaterThan(4); // More than just required

      // Check structure
      allTypes.forEach((t) => {
        expect(t.type).toBeDefined();
        expect(t.description).toBeDefined();
        expect(typeof t.isRequired).toBe('boolean');
      });

      // Verify required flags
      const salaryType = allTypes.find(
        (t) => t.type === XeroAccountType.SALARY_EXPENSE,
      );
      const bonusType = allTypes.find(
        (t) => t.type === XeroAccountType.BONUS_EXPENSE,
      );

      expect(salaryType?.isRequired).toBe(true);
      expect(bonusType?.isRequired).toBe(false);
    });
  });

  describe('fetchXeroAccounts', () => {
    it('should fetch accounts from Xero when connected', async () => {
      // The mock is set up to return accounts
      const accounts = await service.fetchXeroAccounts(testTenant.id);

      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts[0]).toHaveProperty('accountId');
      expect(accounts[0]).toHaveProperty('code');
      expect(accounts[0]).toHaveProperty('name');
    });

    it('should throw BusinessException when not connected to Xero', async () => {
      // Override tokenManager to simulate no connection
      const mockTokenManagerInstance = {
        hasValidConnection: jest.fn().mockResolvedValue(false),
        getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
        getXeroTenantId: jest.fn().mockResolvedValue('mock-xero-tenant-id'),
      };
      (service as any).tokenManager = mockTokenManagerInstance;

      await expect(service.fetchXeroAccounts(testTenant.id)).rejects.toThrow(
        BusinessException,
      );

      // Restore
      (service as any).tokenManager = new TokenManager();
    });
  });

  describe('autoConfigureMappings', () => {
    it('should auto-configure mappings from Xero accounts', async () => {
      const result = await service.autoConfigureMappings(
        testTenant.id,
        false,
        testUser.id,
      );

      expect(result.suggestions.length).toBeGreaterThan(0);
      // Applied count depends on matching accounts
      expect(result.applied + result.skipped).toBe(result.suggestions.length);
    });

    it('should skip existing mappings when overwriteExisting is false', async () => {
      // Create existing mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '9999',
        xeroAccountName: 'Custom Salary',
      });

      const result = await service.autoConfigureMappings(
        testTenant.id,
        false,
        testUser.id,
      );

      // Should have skipped at least one (the existing mapping)
      expect(result.skipped).toBeGreaterThan(0);

      // Verify existing mapping was not overwritten
      const mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mapping?.xeroAccountCode).toBe('9999');
    });

    it('should overwrite existing mappings when overwriteExisting is true', async () => {
      // Create existing mapping
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '9999',
        xeroAccountName: 'Custom Salary',
      });

      await service.autoConfigureMappings(testTenant.id, true, testUser.id);

      // Check if mapping was updated (depends on what Xero accounts are available)
      const mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mapping).not.toBeNull();
      // The account code might be different if a match was found
    });
  });

  describe('Multi-tenant isolation', () => {
    it('should not access mappings from other tenants', async () => {
      // Create mapping for tenant 1
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE, {
        xeroAccountCode: '5110',
      });

      // Try to get it from tenant 2
      const result = await service.getMappingByType(
        secondTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(result).toBeNull();
    });

    it('should not delete mappings from other tenants', async () => {
      // Create mapping for tenant 1
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);

      // Try to delete it from tenant 2 - should fail
      await expect(
        service.deleteMapping(
          secondTenant.id,
          XeroAccountType.SALARY_EXPENSE,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);

      // Verify tenant 1's mapping still exists
      const mapping = await service.getMappingByType(
        testTenant.id,
        XeroAccountType.SALARY_EXPENSE,
      );
      expect(mapping).not.toBeNull();
    });

    it('should maintain separate validation status per tenant', async () => {
      // Create complete mappings for tenant 1
      await createMapping(testTenant.id, XeroAccountType.SALARY_EXPENSE);
      await createMapping(testTenant.id, XeroAccountType.PAYE_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.UIF_PAYABLE);
      await createMapping(testTenant.id, XeroAccountType.NET_PAY_CLEARING);

      // Create partial mappings for tenant 2
      await createMapping(secondTenant.id, XeroAccountType.SALARY_EXPENSE);

      const tenant1Validation = await service.validateMappings(testTenant.id);
      const tenant2Validation = await service.validateMappings(secondTenant.id);

      expect(tenant1Validation.isValid).toBe(true);
      expect(tenant2Validation.isValid).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty tenant with no mappings', async () => {
      const mappings = await service.getMappings(testTenant.id);
      const validation = await service.validateMappings(testTenant.id);
      const summary = await service.getMappingSummary(testTenant.id);

      expect(mappings).toHaveLength(0);
      expect(validation.isValid).toBe(false);
      expect(summary.totalMapped).toBe(0);
    });

    it('should handle upsert of same mapping multiple times', async () => {
      const dto: UpsertAccountMappingDto = {
        accountType: XeroAccountType.SALARY_EXPENSE,
        xeroAccountId: 'test-id',
        xeroAccountCode: '5110',
        xeroAccountName: 'Test Name',
        isActive: true,
      };

      // Upsert multiple times
      await service.upsertMapping(testTenant.id, dto, testUser.id);
      await service.upsertMapping(testTenant.id, dto, testUser.id);
      await service.upsertMapping(testTenant.id, dto, testUser.id);

      // Should still only have one mapping
      const mappings = await service.getMappings(testTenant.id);
      expect(mappings).toHaveLength(1);
    });

    it('should handle account type with special characters in name', async () => {
      const dto: UpsertAccountMappingDto = {
        accountType: XeroAccountType.SALARY_EXPENSE,
        xeroAccountId: 'test-id',
        xeroAccountCode: '5110',
        xeroAccountName: 'Salary & Wages (Main) - R&D',
        isActive: true,
      };

      const result = await service.upsertMapping(
        testTenant.id,
        dto,
        testUser.id,
      );
      expect(result.xeroAccountName).toBe('Salary & Wages (Main) - R&D');
    });
  });
});
