/**
 * RecipientResolverService Unit Tests
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Tests recipient resolution logic for broadcast messages.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RecipientResolverService } from '../../../src/communications/services/recipient-resolver.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  RecipientType,
  CommunicationChannel,
} from '../../../src/communications/types/communication.types';

describe('RecipientResolverService', () => {
  let service: RecipientResolverService;
  let prisma: PrismaService;

  // Test data IDs
  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecipientResolverService, PrismaService],
    }).compile();

    service = module.get<RecipientResolverService>(RecipientResolverService);
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.messageRecipient.deleteMany({});
    await prisma.broadcastMessage.deleteMany({});
    await prisma.recipientGroup.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
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
    await prisma.linkedBankAccount.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.pendingSync.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '0211234567',
        email: `test-${Date.now()}@creche.com`,
      },
    });
    testTenantId = tenant.id;
  });

  describe('resolve', () => {
    it('should return empty array for empty tenant', async () => {
      const result = await service.resolve(
        testTenantId,
        RecipientType.PARENT,
        undefined,
        CommunicationChannel.EMAIL,
      );

      expect(result).toEqual([]);
    });

    it('should resolve all active parents', async () => {
      // Create test parents
      await prisma.parent.createMany({
        data: [
          {
            tenantId: testTenantId,
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '0821234567',
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
            phone: '0829876543',
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Inactive',
            lastName: 'Parent',
            email: 'inactive@example.com',
            isActive: false,
          },
        ],
      });

      const result = await service.resolve(
        testTenantId,
        RecipientType.PARENT,
        { parentFilter: { isActive: true } },
        CommunicationChannel.EMAIL,
      );

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name)).toContain('John Doe');
      expect(result.map((r) => r.name)).toContain('Jane Smith');
    });

    it('should filter parents by WhatsApp opt-in', async () => {
      // Create test parents with different opt-in status
      await prisma.parent.createMany({
        data: [
          {
            tenantId: testTenantId,
            firstName: 'WhatsApp',
            lastName: 'User',
            email: 'wa@example.com',
            whatsapp: '0821111111',
            whatsappOptIn: true,
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'NoWhatsApp',
            lastName: 'User',
            email: 'nowa@example.com',
            phone: '0822222222',
            whatsappOptIn: false,
            isActive: true,
          },
        ],
      });

      const result = await service.resolve(
        testTenantId,
        RecipientType.PARENT,
        undefined,
        CommunicationChannel.WHATSAPP,
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('WhatsApp User');
    });

    it('should resolve staff members', async () => {
      // Create test staff
      await prisma.staff.createMany({
        data: [
          {
            tenantId: testTenantId,
            firstName: 'Teacher',
            lastName: 'One',
            email: 'teacher1@example.com',
            phone: '0831111111',
            idNumber: '8501011111081',
            dateOfBirth: new Date('1985-01-01'),
            startDate: new Date('2024-01-15'),
            employmentType: 'PERMANENT',
            basicSalaryCents: 1500000,
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Teacher',
            lastName: 'Two',
            email: 'teacher2@example.com',
            phone: '0832222222',
            idNumber: '8501012222082',
            dateOfBirth: new Date('1985-01-01'),
            startDate: new Date('2024-01-15'),
            employmentType: 'CONTRACT',
            basicSalaryCents: 1200000,
            isActive: true,
          },
        ],
      });

      const result = await service.resolve(
        testTenantId,
        RecipientType.STAFF,
        undefined,
        CommunicationChannel.EMAIL,
      );

      expect(result).toHaveLength(2);
    });

    it('should filter staff by employment type', async () => {
      // Create test staff with different employment types
      await prisma.staff.createMany({
        data: [
          {
            tenantId: testTenantId,
            firstName: 'Permanent',
            lastName: 'Staff',
            email: 'perm@example.com',
            idNumber: '8501013333083',
            dateOfBirth: new Date('1985-01-01'),
            startDate: new Date('2024-01-15'),
            employmentType: 'PERMANENT',
            basicSalaryCents: 1500000,
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Contract',
            lastName: 'Staff',
            email: 'contract@example.com',
            idNumber: '8501014444084',
            dateOfBirth: new Date('1985-01-01'),
            startDate: new Date('2024-01-15'),
            employmentType: 'CONTRACT',
            basicSalaryCents: 1200000,
            isActive: true,
          },
        ],
      });

      const result = await service.resolve(
        testTenantId,
        RecipientType.STAFF,
        { staffFilter: { employmentType: ['PERMANENT'] } },
        CommunicationChannel.EMAIL,
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Permanent Staff');
    });

    it('should resolve custom recipients by ID', async () => {
      // Create mix of parents and staff
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenantId,
          firstName: 'Custom',
          lastName: 'Parent',
          email: 'custom@example.com',
          isActive: true,
        },
      });

      const staff = await prisma.staff.create({
        data: {
          tenantId: testTenantId,
          firstName: 'Custom',
          lastName: 'Staff',
          email: 'customstaff@example.com',
          idNumber: '8501015555085',
          dateOfBirth: new Date('1985-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 1500000,
          isActive: true,
        },
      });

      const result = await service.resolve(testTenantId, RecipientType.CUSTOM, {
        selectedIds: [parent.id, staff.id],
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name)).toContain('Custom Parent');
      expect(result.map((r) => r.name)).toContain('Custom Staff');
    });
  });

  describe('previewCount', () => {
    it('should return count of matching recipients', async () => {
      // Create test parents
      await prisma.parent.createMany({
        data: [
          {
            tenantId: testTenantId,
            firstName: 'Parent',
            lastName: 'One',
            email: 'p1@example.com',
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Parent',
            lastName: 'Two',
            email: 'p2@example.com',
            isActive: true,
          },
          {
            tenantId: testTenantId,
            firstName: 'Parent',
            lastName: 'Three',
            email: 'p3@example.com',
            isActive: true,
          },
        ],
      });

      const count = await service.previewCount(
        testTenantId,
        RecipientType.PARENT,
        undefined,
        CommunicationChannel.EMAIL,
      );

      expect(count).toBe(3);
    });
  });
});
