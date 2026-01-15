/**
 * Commission Service Tests
 * TASK-STAFF-007: Fix Commission Calculation
 *
 * Tests for:
 * - Flat rate commission
 * - Percentage commission
 * - Tiered commission
 * - Commission caps and minimums
 * - Monthly commission totals
 * - Payroll integration
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import {
  CommissionService,
  CommissionType,
  CommissionStatus,
  ICommissionStructure,
} from '../../../src/database/services/commission.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';

// Configure Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('CommissionService', () => {
  let service: CommissionService;

  const mockStaff = {
    id: 'staff-001',
    tenantId: 'tenant-001',
    firstName: 'Jane',
    lastName: 'Sales',
    isActive: true,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      staff: {
        findFirst: jest.fn().mockResolvedValue(mockStaff),
        findMany: jest.fn().mockResolvedValue([mockStaff]),
      },
    };

    const mockAuditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<CommissionService>(CommissionService);

    // Reset data before each test
    service.clearAllData();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have default commission structures', () => {
      const structures = service.listCommissionStructures();

      expect(structures.length).toBe(3);
      expect(structures.map((s) => s.type)).toContain(CommissionType.FLAT_RATE);
      expect(structures.map((s) => s.type)).toContain(
        CommissionType.PERCENTAGE,
      );
      expect(structures.map((s) => s.type)).toContain(CommissionType.TIERED);
    });
  });

  describe('calculateCommission - Flat Rate', () => {
    it('should calculate flat rate commission', () => {
      const structure: ICommissionStructure = {
        id: 'flat-001',
        name: 'Flat Rate',
        type: CommissionType.FLAT_RATE,
        isActive: true,
        flatRateCents: 5000, // R50 per transaction
      };

      const result = service.calculateCommission(1000000, structure); // R10,000 transaction

      expect(result.commissionAmountCents).toBe(5000);
      expect(result.commissionType).toBe(CommissionType.FLAT_RATE);
    });

    it('should return zero for transaction below minimum', () => {
      const structure: ICommissionStructure = {
        id: 'flat-002',
        name: 'Flat Rate with Minimum',
        type: CommissionType.FLAT_RATE,
        isActive: true,
        flatRateCents: 5000,
        minimumTransactionAmountCents: 100000, // R1,000 minimum
      };

      const result = service.calculateCommission(50000, structure); // R500 transaction

      expect(result.commissionAmountCents).toBe(0);
    });
  });

  describe('calculateCommission - Percentage', () => {
    it('should calculate percentage commission', () => {
      const structure: ICommissionStructure = {
        id: 'pct-001',
        name: '5% Commission',
        type: CommissionType.PERCENTAGE,
        isActive: true,
        percentageRate: 0.05,
      };

      const result = service.calculateCommission(1000000, structure); // R10,000 transaction

      expect(result.commissionAmountCents).toBe(50000); // R500
      expect(result.appliedRate).toBe(0.05);
    });

    it('should apply minimum commission', () => {
      const structure: ICommissionStructure = {
        id: 'pct-002',
        name: '2% with Minimum',
        type: CommissionType.PERCENTAGE,
        isActive: true,
        percentageRate: 0.02,
        minimumCommissionCents: 5000, // R50 minimum
      };

      const result = service.calculateCommission(100000, structure); // R1,000 transaction
      // 2% of R1,000 = R20, but minimum is R50

      expect(result.commissionAmountCents).toBe(5000);
      expect(result.breakdown.adjustmentCents).toBe(3000); // R30 adjustment
    });

    it('should apply maximum commission cap', () => {
      const structure: ICommissionStructure = {
        id: 'pct-003',
        name: '5% with Cap',
        type: CommissionType.PERCENTAGE,
        isActive: true,
        percentageRate: 0.05,
        maximumCommissionCents: 100000, // R1,000 cap
      };

      const result = service.calculateCommission(5000000, structure); // R50,000 transaction
      // 5% of R50,000 = R2,500, but capped at R1,000

      expect(result.commissionAmountCents).toBe(100000);
      expect(result.capped).toBe(true);
      expect(result.breakdown.capAppliedCents).toBe(150000); // R1,500 capped
    });
  });

  describe('calculateCommission - Tiered', () => {
    it('should calculate tiered commission at lowest tier', () => {
      const structure: ICommissionStructure = {
        id: 'tier-001',
        name: 'Tiered Commission',
        type: CommissionType.TIERED,
        isActive: true,
        tiers: [
          { thresholdCents: 0, rate: 0.02 },
          { thresholdCents: 1000000, rate: 0.03 },
          { thresholdCents: 5000000, rate: 0.05 },
        ],
      };

      const result = service.calculateCommission(500000, structure); // R5,000 transaction

      expect(result.appliedRate).toBe(0.02);
      expect(result.commissionAmountCents).toBe(10000); // R100
    });

    it('should calculate tiered commission at middle tier', () => {
      const structure: ICommissionStructure = {
        id: 'tier-002',
        name: 'Tiered Commission',
        type: CommissionType.TIERED,
        isActive: true,
        tiers: [
          { thresholdCents: 0, rate: 0.02 },
          { thresholdCents: 1000000, rate: 0.03 },
          { thresholdCents: 5000000, rate: 0.05 },
        ],
      };

      const result = service.calculateCommission(2000000, structure); // R20,000 transaction

      expect(result.appliedRate).toBe(0.03);
      expect(result.commissionAmountCents).toBe(60000); // R600
    });

    it('should calculate tiered commission at highest tier with bonus', () => {
      const structure: ICommissionStructure = {
        id: 'tier-003',
        name: 'Tiered with Bonus',
        type: CommissionType.TIERED,
        isActive: true,
        tiers: [
          { thresholdCents: 0, rate: 0.02 },
          { thresholdCents: 1000000, rate: 0.03 },
          { thresholdCents: 5000000, rate: 0.05, flatBonusCents: 10000 },
        ],
      };

      const result = service.calculateCommission(10000000, structure); // R100,000 transaction

      expect(result.appliedRate).toBe(0.05);
      expect(result.breakdown.baseCommissionCents).toBe(500000); // R5,000
      expect(result.breakdown.tierBonusCents).toBe(10000); // R100 bonus
      expect(result.commissionAmountCents).toBe(510000); // R5,100
    });
  });

  describe('recordCommission', () => {
    it('should record commission for valid transaction', async () => {
      const result = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-001',
          transactionType: 'SALE',
          transactionAmountCents: 1000000,
          transactionDate: new Date('2024-06-15'),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      expect(result.id).toBeDefined();
      expect(result.staffId).toBe(mockStaff.id);
      expect(result.transactionAmountCents).toBe(1000000);
      expect(result.commissionAmountCents).toBeGreaterThan(0);
      expect(result.status).toBe(CommissionStatus.PENDING);
    });

    it('should throw error for invalid commission structure', async () => {
      await expect(
        service.recordCommission(
          'tenant-001',
          {
            staffId: mockStaff.id,
            transactionId: 'txn-002',
            transactionType: 'SALE',
            transactionAmountCents: 1000000,
            transactionDate: new Date(),
            commissionStructureId: 'non-existent',
          },
          'admin-001',
        ),
      ).rejects.toThrow('CommissionStructure');
    });
  });

  describe('approveCommission', () => {
    it('should approve pending commission', async () => {
      const commission = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-003',
          transactionType: 'SALE',
          transactionAmountCents: 1000000,
          transactionDate: new Date(),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      const result = await service.approveCommission(
        'tenant-001',
        commission.id,
        'admin-001',
      );

      expect(result.status).toBe(CommissionStatus.APPROVED);
      expect(result.approvedAt).toBeDefined();
      expect(result.approvedBy).toBe('admin-001');
    });

    it('should throw error for non-pending commission', async () => {
      const commission = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-004',
          transactionType: 'SALE',
          transactionAmountCents: 1000000,
          transactionDate: new Date(),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      // Approve first
      await service.approveCommission('tenant-001', commission.id, 'admin-001');

      // Try to approve again
      await expect(
        service.approveCommission('tenant-001', commission.id, 'admin-001'),
      ).rejects.toThrow('Only pending commissions');
    });
  });

  describe('markCommissionPaid', () => {
    it('should mark approved commission as paid', async () => {
      const commission = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-005',
          transactionType: 'SALE',
          transactionAmountCents: 1000000,
          transactionDate: new Date(),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      await service.approveCommission('tenant-001', commission.id, 'admin-001');
      const result = await service.markCommissionPaid(
        'tenant-001',
        commission.id,
        'admin-001',
      );

      expect(result.status).toBe(CommissionStatus.PAID);
      expect(result.paidAt).toBeDefined();
    });

    it('should throw error for non-approved commission', async () => {
      const commission = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-006',
          transactionType: 'SALE',
          transactionAmountCents: 1000000,
          transactionDate: new Date(),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      await expect(
        service.markCommissionPaid('tenant-001', commission.id, 'admin-001'),
      ).rejects.toThrow('Only approved commissions');
    });
  });

  describe('getMonthlyCommissionSummary', () => {
    it('should return monthly summary with all transactions', async () => {
      // Record multiple commissions
      const dates = ['2024-06-05', '2024-06-15', '2024-06-25'];
      for (const date of dates) {
        await service.recordCommission(
          'tenant-001',
          {
            staffId: mockStaff.id,
            transactionId: `txn-${date}`,
            transactionType: 'SALE',
            transactionAmountCents: 1000000,
            transactionDate: new Date(date),
            commissionStructureId: 'default-percentage',
          },
          'admin-001',
        );
      }

      const result = await service.getMonthlyCommissionSummary(
        'tenant-001',
        mockStaff.id,
        6,
        2024,
      );

      expect(result.staffId).toBe(mockStaff.id);
      expect(result.month).toBe(6);
      expect(result.year).toBe(2024);
      expect(result.totalTransactions).toBe(3);
      expect(result.totalTransactionValueCents).toBe(3000000);
      expect(result.totalCommissionCents).toBeGreaterThan(0);
      expect(result.pendingCommissionCents).toBeGreaterThan(0);
    });
  });

  describe('getCommissionsForPayroll', () => {
    it('should return approved commissions for payroll', async () => {
      // Record and approve commission
      const commission = await service.recordCommission(
        'tenant-001',
        {
          staffId: mockStaff.id,
          transactionId: 'txn-payroll',
          transactionType: 'SALE',
          transactionAmountCents: 2000000,
          transactionDate: new Date('2024-06-15'),
          commissionStructureId: 'default-percentage',
        },
        'admin-001',
      );

      await service.approveCommission('tenant-001', commission.id, 'admin-001');

      const result = await service.getCommissionsForPayroll(
        'tenant-001',
        6,
        2024,
      );

      expect(result.length).toBe(1);
      expect(result[0].staffId).toBe(mockStaff.id);
      expect(result[0].totalCommissionCents).toBeGreaterThan(0);
    });
  });

  describe('createCommissionStructure', () => {
    it('should create flat rate structure', () => {
      const result = service.createCommissionStructure({
        id: '',
        name: 'New Flat Rate',
        type: CommissionType.FLAT_RATE,
        isActive: true,
        flatRateCents: 7500,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('New Flat Rate');
      expect(result.flatRateCents).toBe(7500);
    });

    it('should validate flat rate requires flatRateCents', () => {
      expect(() =>
        service.createCommissionStructure({
          id: '',
          name: 'Invalid Flat Rate',
          type: CommissionType.FLAT_RATE,
          isActive: true,
        }),
      ).toThrow('flatRateCents');
    });

    it('should validate percentage requires percentageRate', () => {
      expect(() =>
        service.createCommissionStructure({
          id: '',
          name: 'Invalid Percentage',
          type: CommissionType.PERCENTAGE,
          isActive: true,
        }),
      ).toThrow('percentageRate');
    });

    it('should validate tiered requires tiers', () => {
      expect(() =>
        service.createCommissionStructure({
          id: '',
          name: 'Invalid Tiered',
          type: CommissionType.TIERED,
          isActive: true,
        }),
      ).toThrow('at least one tier');
    });
  });

  describe('Monthly Cap', () => {
    it('should apply monthly commission cap', async () => {
      // Create structure with low monthly cap
      const cappedStructure = service.createCommissionStructure({
        id: '',
        name: 'Capped Commission',
        type: CommissionType.PERCENTAGE,
        isActive: true,
        percentageRate: 0.05,
        monthlyCapCents: 100000, // R1,000 monthly cap
      });

      // Record multiple commissions that exceed cap
      for (let i = 0; i < 5; i++) {
        await service.recordCommission(
          'tenant-001',
          {
            staffId: mockStaff.id,
            transactionId: `txn-cap-${i}`,
            transactionType: 'SALE',
            transactionAmountCents: 1000000, // R10,000 each -> R500 commission each
            transactionDate: new Date('2024-06-15'),
            commissionStructureId: cappedStructure.id,
          },
          'admin-001',
        );
      }

      const summary = await service.getMonthlyCommissionSummary(
        'tenant-001',
        mockStaff.id,
        6,
        2024,
      );

      // Total should be capped at R1,000, not R2,500
      expect(summary.totalCommissionCents).toBeLessThanOrEqual(100000);
    });
  });

  describe('Validation', () => {
    it('should throw error for negative transaction amount', () => {
      const structure: ICommissionStructure = {
        id: 'test',
        name: 'Test',
        type: CommissionType.PERCENTAGE,
        isActive: true,
        percentageRate: 0.05,
      };

      expect(() => service.calculateCommission(-1000, structure)).toThrow(
        'cannot be negative',
      );
    });
  });
});
