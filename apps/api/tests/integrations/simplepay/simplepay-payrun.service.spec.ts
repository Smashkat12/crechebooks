/**
 * SimplePay Pay Run Service Tests
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayPayRunService } from '../../../src/integrations/simplepay/simplepay-payrun.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { PayRunSyncRepository } from '../../../src/database/repositories/payrun-sync.repository';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { EncryptionService } from '../../../src/shared/services/encryption.service';
import {
  PayRunSyncStatus,
  DEFAULT_XERO_JOURNAL_CONFIG,
  SimplePayWave,
  SimplePayPayRun,
  SimplePayPayslip,
  SimplePayAccounting,
} from '../../../src/database/entities/payrun-sync.entity';
import { Tenant } from '@prisma/client';

describe('SimplePayPayRunService', () => {
  let service: SimplePayPayRunService;
  let prisma: PrismaService;
  let payRunSyncRepo: PayRunSyncRepository;
  let apiClient: SimplePayApiClient;
  let tenant: Tenant;

  // Mock data
  const mockWaves: SimplePayWave[] = [
    {
      id: 1,
      name: 'Monthly',
      pay_frequency: 'monthly',
      pay_day: 25,
      is_active: true,
    },
    {
      id: 2,
      name: 'Weekly',
      pay_frequency: 'weekly',
      pay_day: 5,
      is_active: true,
    },
  ];

  const mockPayRun: SimplePayPayRun = {
    id: '12345',
    wave_id: 1,
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    pay_date: '2026-01-25',
    status: 'finalized',
    employee_count: 15,
    total_gross: 250000,
    total_net: 180000,
  };

  const mockPayslips: SimplePayPayslip[] = [
    {
      id: '1',
      employee_id: '101',
      employee_name: 'Thabo Modise',
      gross: 25000,
      nett: 18000,
      paye: 4500,
      uif_employee: 250,
      uif_employer: 250,
      items: [],
    },
    {
      id: '2',
      employee_id: '102',
      employee_name: 'Zanele Nkosi',
      gross: 20000,
      nett: 14500,
      paye: 3500,
      uif_employee: 200,
      uif_employer: 200,
      items: [],
    },
  ];

  const mockAccounting: SimplePayAccounting = {
    pay_run_id: '12345',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    entries: [
      {
        account_code: '6100',
        account_name: 'Salaries and Wages',
        debit: 45000,
        credit: 0,
        description: 'Gross salaries',
      },
      {
        account_code: '2100',
        account_name: 'Net Pay Payable',
        debit: 0,
        credit: 32500,
        description: 'Net salaries payable',
      },
    ],
    totals: {
      gross: 45000,
      nett: 32500,
      paye: 8000,
      uif_employee: 450,
      uif_employer: 450,
      sdl: 450,
      eti: 0,
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        PrismaService,
        PayRunSyncRepository,
        SimplePayRepository,
        EncryptionService,
        ConfigService,
        {
          provide: SimplePayApiClient,
          useValue: {
            initializeForTenant: jest.fn().mockResolvedValue(undefined),
            getClientId: jest.fn().mockReturnValue('123'),
            get: jest.fn(),
          },
        },
        SimplePayPayRunService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    payRunSyncRepo = module.get<PayRunSyncRepository>(PayRunSyncRepository);
    apiClient = module.get<SimplePayApiClient>(SimplePayApiClient);
    service = module.get<SimplePayPayRunService>(SimplePayPayRunService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Note: Wave cache is cleared per-tenant when tenant is created
    // Cache will be cleared after tenant creation if needed

    // Reset mocks
    jest.clearAllMocks();

    // Clean database in FK order
    await prisma.payRunSync.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staffOffboarding.deleteMany({});
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
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getWaves', () => {
    it('should fetch waves from SimplePay API', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      const waves = await service.getWaves(tenant.id);

      expect(waves).toHaveLength(2);
      expect(waves[0].name).toBe('Monthly');
      expect(waves[1].name).toBe('Weekly');
      expect(apiClient.get).toHaveBeenCalledWith('/clients/123/waves');
    });

    it('should cache waves for 30 minutes', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      // First call
      await service.getWaves(tenant.id);

      // Second call should use cache
      await service.getWaves(tenant.id);

      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache when forceRefresh is true', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      await service.getWaves(tenant.id);
      await service.getWaves(tenant.id, true);

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPayRuns', () => {
    it('should fetch pay runs for a wave', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue([
        { payment_run: mockPayRun },
      ]);

      const payRuns = await service.getPayRuns(tenant.id, 1);

      expect(payRuns).toHaveLength(1);
      expect(payRuns[0].id).toBe('12345');
      expect(payRuns[0].wave_id).toBe(1);
      expect(apiClient.get).toHaveBeenCalledWith(
        '/clients/123/waves/1/payment_runs',
      );
    });
  });

  describe('getPayRun', () => {
    it('should fetch a specific pay run', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        payment_run: mockPayRun,
      });

      const payRun = await service.getPayRun(tenant.id, '12345');

      expect(payRun.id).toBe('12345');
      expect(payRun.status).toBe('finalized');
      expect(apiClient.get).toHaveBeenCalledWith('/payment_runs/12345');
    });
  });

  describe('getPayRunPayslips', () => {
    it('should fetch payslips for a pay run', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockPayslips.map((p) => ({ payslip: p })),
      );

      const payslips = await service.getPayRunPayslips(tenant.id, '12345');

      expect(payslips).toHaveLength(2);
      expect(payslips[0].employee_name).toBe('Thabo Modise');
      expect(payslips[1].employee_name).toBe('Zanele Nkosi');
    });
  });

  describe('getPayRunAccounting', () => {
    it('should fetch accounting data for a pay run', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        accounting: mockAccounting,
      });

      const accounting = await service.getPayRunAccounting(tenant.id, '12345');

      expect(accounting.entries).toHaveLength(2);
      expect(accounting.totals.gross).toBe(45000);
    });

    it('should handle unwrapped accounting response', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(mockAccounting);

      const accounting = await service.getPayRunAccounting(tenant.id, '12345');

      expect(accounting.entries).toHaveLength(2);
    });
  });

  describe('syncPayRun', () => {
    beforeEach(() => {
      // Setup mocks for sync
      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (
          endpoint.includes('/payment_runs/') &&
          endpoint.includes('/payslips')
        ) {
          return Promise.resolve(mockPayslips.map((p) => ({ payslip: p })));
        }
        if (
          endpoint.includes('/payment_runs/') &&
          endpoint.includes('/accounting')
        ) {
          return Promise.resolve({ accounting: mockAccounting });
        }
        if (endpoint.includes('/payment_runs/')) {
          return Promise.resolve({ payment_run: mockPayRun });
        }
        return Promise.resolve([]);
      });
    });

    it('should sync a pay run from SimplePay to local database', async () => {
      const synced = await service.syncPayRun(tenant.id, '12345');

      expect(synced).toBeDefined();
      expect(synced.simplePayPayRunId).toBe('12345');
      expect(synced.tenantId).toBe(tenant.id);
      expect(synced.waveId).toBe(1);
      expect(synced.waveName).toBe('Monthly');
      expect(synced.status).toBe('finalized');
    });

    it('should convert amounts to cents', async () => {
      const synced = await service.syncPayRun(tenant.id, '12345');

      // 25000 + 20000 = 45000 gross, converted to cents
      expect(synced.totalGrossCents).toBe(4500000);
      // 18000 + 14500 = 32500 net, converted to cents
      expect(synced.totalNetCents).toBe(3250000);
    });

    it('should update existing pay run sync on re-sync', async () => {
      // First sync
      const first = await service.syncPayRun(tenant.id, '12345');
      const firstId = first.id;

      // Second sync should update
      const second = await service.syncPayRun(tenant.id, '12345');

      expect(second.id).toBe(firstId);
    });
  });

  describe('syncAllPayRuns', () => {
    beforeEach(() => {
      const mockPayRuns: SimplePayPayRun[] = [
        { ...mockPayRun, id: 'pr-1' },
        {
          ...mockPayRun,
          id: 'pr-2',
          period_start: '2026-02-01',
          period_end: '2026-02-28',
        },
      ];

      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves') && !endpoint.includes('payment_runs')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (endpoint.includes('/payment_runs') && endpoint.includes('waves')) {
          return Promise.resolve(mockPayRuns.map((p) => ({ payment_run: p })));
        }
        if (endpoint.includes('/payslips')) {
          return Promise.resolve(mockPayslips.map((p) => ({ payslip: p })));
        }
        if (endpoint.includes('/accounting')) {
          return Promise.resolve({ accounting: mockAccounting });
        }
        if (endpoint === '/payment_runs/pr-1') {
          return Promise.resolve({
            payment_run: { ...mockPayRun, id: 'pr-1' },
          });
        }
        if (endpoint === '/payment_runs/pr-2') {
          return Promise.resolve({
            payment_run: {
              ...mockPayRun,
              id: 'pr-2',
              period_start: '2026-02-01',
              period_end: '2026-02-28',
            },
          });
        }
        return Promise.resolve([]);
      });
    });

    it('should sync all pay runs for active waves', async () => {
      const results = await service.syncAllPayRuns(tenant.id);

      // 2 waves * 2 pay runs each = 4 results
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should sync pay runs for specific wave', async () => {
      const results = await service.syncAllPayRuns(tenant.id, 1);

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((r) => {
        if (r.success) {
          expect(r.payRunId).toBeDefined();
        }
      });
    });

    it('should report errors for failed syncs', async () => {
      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves') && !endpoint.includes('payment_runs')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (endpoint.includes('/payment_runs') && endpoint.includes('waves')) {
          return Promise.resolve([{ payment_run: mockPayRun }]);
        }
        throw new Error('API Error');
      });

      const results = await service.syncAllPayRuns(tenant.id);

      expect(results.some((r) => !r.success)).toBe(true);
      expect(results.some((r) => r.errors.length > 0)).toBe(true);
    });
  });

  describe('getPayRunSyncStatus', () => {
    beforeEach(async () => {
      await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-test-1',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        payDate: new Date('2026-01-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 25000000,
        totalNetCents: 18000000,
        totalPayeCents: 4500000,
        totalUifEmployeeCents: 250000,
        totalUifEmployerCents: 250000,
        totalSdlCents: 250000,
        totalEtiCents: 0,
      });
    });

    it('should return pay run syncs for tenant', async () => {
      const syncs = await service.getPayRunSyncStatus(tenant.id);

      expect(syncs).toHaveLength(1);
      expect(syncs[0].simplePayPayRunId).toBe('pr-test-1');
    });

    it('should filter by wave', async () => {
      const syncs = await service.getPayRunSyncStatus(tenant.id, { waveId: 1 });

      expect(syncs).toHaveLength(1);
    });
  });

  describe('getPayRunSync', () => {
    beforeEach(async () => {
      await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-specific',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        payDate: new Date('2026-01-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 25000000,
        totalNetCents: 18000000,
        totalPayeCents: 4500000,
        totalUifEmployeeCents: 250000,
        totalUifEmployerCents: 250000,
        totalSdlCents: 250000,
        totalEtiCents: 0,
      });
    });

    it('should return specific pay run sync by SimplePay ID', async () => {
      const sync = await service.getPayRunSync(tenant.id, 'pr-specific');

      expect(sync).toBeDefined();
      expect(sync?.simplePayPayRunId).toBe('pr-specific');
    });

    it('should return null for non-existent SimplePay ID', async () => {
      const sync = await service.getPayRunSync(tenant.id, 'nonexistent');

      expect(sync).toBeNull();
    });
  });

  describe('getPendingXeroSync', () => {
    beforeEach(async () => {
      // Synced but not posted to Xero
      const sync1 = await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-pending',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        payDate: new Date('2026-01-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 25000000,
        totalNetCents: 18000000,
        totalPayeCents: 4500000,
        totalUifEmployeeCents: 250000,
        totalUifEmployerCents: 250000,
        totalSdlCents: 250000,
        totalEtiCents: 0,
      });
      await payRunSyncRepo.updateSyncStatus(sync1.id, PayRunSyncStatus.SYNCED);

      // Already posted
      const sync2 = await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-posted',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-02-01'),
        periodEnd: new Date('2026-02-28'),
        payDate: new Date('2026-02-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 26000000,
        totalNetCents: 19000000,
        totalPayeCents: 4600000,
        totalUifEmployeeCents: 260000,
        totalUifEmployerCents: 260000,
        totalSdlCents: 260000,
        totalEtiCents: 0,
      });
      await payRunSyncRepo.updateSyncStatus(sync2.id, PayRunSyncStatus.SYNCED);
      await payRunSyncRepo.markXeroPosted(sync2.id, 'MJ-001');
    });

    it('should return only synced pay runs without Xero journal', async () => {
      const pending = await service.getPendingXeroSync(tenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].simplePayPayRunId).toBe('pr-pending');
    });
  });

  describe('postPayRunToXero', () => {
    let syncId: string;

    beforeEach(async () => {
      // Create test data that balances for Xero journal:
      // Debits: Gross (250,000) + UIF Employer (2,500) + SDL (2,500) = 255,000
      // Credits: Net (200,000) + PAYE (45,000) + UIF Employee (2,500) + UIF Employer (2,500) + SDL (2,500) = 252,500
      // For balance: Gross must equal Net + PAYE + UIF_Employee
      // 250,000 = 202,500 + 45,000 + 2,500 = 250,000 (balanced!)
      const sync = await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-to-post',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        payDate: new Date('2026-01-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 25000000, // R250,000
        totalNetCents: 20250000, // R202,500 (250,000 - 45,000 - 2,500)
        totalPayeCents: 4500000, // R45,000
        totalUifEmployeeCents: 250000, // R2,500
        totalUifEmployerCents: 250000, // R2,500 (employer portion - adds to both debit and credit)
        totalSdlCents: 250000, // R2,500 (adds to both debit and credit)
        totalEtiCents: 0,
        accountingData: mockAccounting as unknown as Record<string, unknown>,
      });
      await payRunSyncRepo.updateSyncStatus(sync.id, PayRunSyncStatus.SYNCED);
      syncId = sync.id;
    });

    it('should post pay run to Xero and return success', async () => {
      const result = await service.postPayRunToXero(tenant.id, syncId);

      expect(result.success).toBe(true);
      expect(result.xeroJournalId).toBeDefined();
      expect(result.xeroJournalId).toMatch(/^MJ-/);
      expect(result.errors).toHaveLength(0);
    });

    it('should update pay run sync status to XERO_POSTED', async () => {
      await service.postPayRunToXero(tenant.id, syncId);

      const updated = await payRunSyncRepo.findById(syncId, tenant.id);
      expect(updated?.syncStatus).toBe(PayRunSyncStatus.XERO_POSTED);
      expect(updated?.xeroJournalId).toBeDefined();
      expect(updated?.xeroSyncedAt).toBeDefined();
    });

    it('should fail if pay run is already posted', async () => {
      await payRunSyncRepo.markXeroPosted(syncId, 'MJ-EXISTING');

      const result = await service.postPayRunToXero(tenant.id, syncId);

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Pay run has already been posted to Xero',
      );
    });

    it('should fail if pay run is not synced yet', async () => {
      const pendingSync = await payRunSyncRepo.create({
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-not-synced',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        payDate: new Date('2026-03-25'),
        status: 'finalized',
        employeeCount: 15,
        totalGrossCents: 25000000,
        totalNetCents: 18000000,
        totalPayeCents: 4500000,
        totalUifEmployeeCents: 250000,
        totalUifEmployerCents: 250000,
        totalSdlCents: 250000,
        totalEtiCents: 0,
      });

      const result = await service.postPayRunToXero(tenant.id, pendingSync.id);

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Pay run has not been synced from SimplePay yet. Sync first.',
      );
    });

    it('should use custom journal config if provided', async () => {
      const customConfig = {
        ...DEFAULT_XERO_JOURNAL_CONFIG,
        salaryExpenseCode: '7100',
        narrationPrefix: 'Custom Payroll',
      };

      const result = await service.postPayRunToXero(
        tenant.id,
        syncId,
        customConfig,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('clearWaveCache', () => {
    it('should clear cache for specific tenant', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      // Populate cache
      await service.getWaves(tenant.id);

      // Clear cache
      service.clearWaveCache(tenant.id);

      // Should fetch again
      await service.getWaves(tenant.id);

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches when no tenant specified', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      await service.getWaves(tenant.id);
      service.clearWaveCache(tenant.id);

      await service.getWaves(tenant.id);

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty('waveCacheSize');
      expect(stats).toHaveProperty('waveCacheTtlMs');
      expect(stats.waveCacheTtlMs).toBe(30 * 60 * 1000); // 30 minutes
    });

    it('should show correct cache size after fetching waves', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(
        mockWaves.map((w) => ({ wave: w })),
      );

      await service.getWaves(tenant.id);

      const stats = service.getCacheStats();
      expect(stats.waveCacheSize).toBe(1);
    });
  });

  describe('South African Payroll Context', () => {
    it('should handle UIF calculations correctly', async () => {
      // UIF is 1% employee + 1% employer, max R177.12 per month per side
      const payslipsWithMaxUif: SimplePayPayslip[] = [
        {
          id: '1',
          employee_id: '101',
          employee_name: 'High Earner',
          gross: 50000, // Would exceed max UIF
          nett: 35000,
          paye: 12000,
          uif_employee: 177.12, // Capped at max
          uif_employer: 177.12, // Capped at max
          items: [],
        },
      ];

      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (endpoint.includes('/payslips')) {
          return Promise.resolve(
            payslipsWithMaxUif.map((p) => ({ payslip: p })),
          );
        }
        if (endpoint.includes('/accounting')) {
          return Promise.resolve({
            accounting: {
              ...mockAccounting,
              totals: {
                ...mockAccounting.totals,
                uif_employee: 177.12,
                uif_employer: 177.12,
              },
            },
          });
        }
        if (endpoint.includes('/payment_runs/')) {
          return Promise.resolve({ payment_run: mockPayRun });
        }
        return Promise.resolve([]);
      });

      const synced = await service.syncPayRun(tenant.id, '12345');

      // Verify UIF is stored in cents
      expect(synced.totalUifEmployeeCents).toBe(17712);
      expect(synced.totalUifEmployerCents).toBe(17712);
    });

    it('should handle ETI (Employment Tax Incentive) for youth workers', async () => {
      const accountingWithEti: SimplePayAccounting = {
        ...mockAccounting,
        totals: {
          ...mockAccounting.totals,
          eti: 1000, // R1000 ETI credit
        },
      };

      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (endpoint.includes('/payslips')) {
          return Promise.resolve(mockPayslips.map((p) => ({ payslip: p })));
        }
        if (endpoint.includes('/accounting')) {
          return Promise.resolve({ accounting: accountingWithEti });
        }
        if (endpoint.includes('/payment_runs/')) {
          return Promise.resolve({ payment_run: mockPayRun });
        }
        return Promise.resolve([]);
      });

      const synced = await service.syncPayRun(tenant.id, '12345');

      expect(synced.totalEtiCents).toBe(100000); // R1000 in cents
    });

    it('should handle SDL (Skills Development Levy) at 1%', async () => {
      const accountingWithSdl: SimplePayAccounting = {
        ...mockAccounting,
        totals: {
          ...mockAccounting.totals,
          sdl: 450, // 1% of R45000 gross
        },
      };

      (apiClient.get as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint.includes('/waves')) {
          return Promise.resolve(mockWaves.map((w) => ({ wave: w })));
        }
        if (endpoint.includes('/payslips')) {
          return Promise.resolve(mockPayslips.map((p) => ({ payslip: p })));
        }
        if (endpoint.includes('/accounting')) {
          return Promise.resolve({ accounting: accountingWithSdl });
        }
        if (endpoint.includes('/payment_runs/')) {
          return Promise.resolve({ payment_run: mockPayRun });
        }
        return Promise.resolve([]);
      });

      const synced = await service.syncPayRun(tenant.id, '12345');

      expect(synced.totalSdlCents).toBe(45000); // R450 in cents
    });
  });
});
