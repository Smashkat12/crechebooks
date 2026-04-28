/**
 * XeroController.getSyncStatus unit tests
 * TASK-XERO-011: GET /xero/sync-status
 *
 * Uses full mocking — no real DB.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { XeroController } from '../xero.controller';
import { XeroSyncGateway } from '../xero.gateway';
import { BankFeedService } from '../bank-feed.service';
import { XeroAuthService } from '../xero-auth.service';
import { XeroAutoSyncJob } from '../xero-auto-sync.job';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TransactionRepository } from '../../../database/repositories/transaction.repository';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { XeroSyncService } from '../../../database/services/xero-sync.service';
import type { IUser } from '../../../database/entities/user.entity';

// Mock TokenManager so it doesn't try to read env vars / decrypt tokens
jest.mock('../../../mcp/xero-mcp/auth/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    hasValidConnection: jest.fn().mockResolvedValue(true),
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    getXeroTenantId: jest.fn().mockResolvedValue('xero-org-id'),
  })),
}));

const TENANT_ID = 'test-tenant-sync-status';

const mockUser: IUser = {
  id: 'user-001',
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: UserRole.OWNER,
  name: 'Test Admin',
  auth0Id: 'auth0|test',
  isActive: true,
  lastLoginAt: null,
  currentTenantId: TENANT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('XeroController.getSyncStatus', () => {
  let controller: XeroController;
  let mockPrisma: {
    xeroToken: { findUnique: jest.Mock; findMany: jest.Mock };
    bankConnection: { findFirst: jest.Mock; findMany: jest.Mock };
    tenant: { findUnique: jest.Mock };
  };
  let mockAutoSyncJob: { isInFlight: jest.Mock; runAutoSync: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      xeroToken: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      bankConnection: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    mockAutoSyncJob = {
      isInFlight: jest.fn().mockReturnValue(false),
      runAutoSync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [XeroController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: BankFeedService,
          useValue: {
            syncTransactions: jest.fn(),
            syncFromJournals: jest.fn(),
            syncUnreconciledStatements: jest.fn(),
          },
        },
        {
          provide: XeroSyncGateway,
          useValue: {
            emitProgress: jest.fn(),
            emitComplete: jest.fn(),
            emitError: jest.fn(),
          },
        },
        {
          provide: XeroSyncService,
          useValue: {
            syncTransactions: jest.fn(),
            syncChartOfAccountsToDb: jest.fn(),
            getSyncedAccounts: jest.fn(),
          },
        },
        {
          provide: XeroAuthService,
          useValue: {
            generateState: jest.fn().mockReturnValue('mock-state'),
            validateState: jest.fn(),
          },
        },
        { provide: XeroAutoSyncJob, useValue: mockAutoSyncJob },
        { provide: TransactionRepository, useValue: {} },
        { provide: AuditLogService, useValue: { logAction: jest.fn() } },
      ],
    }).compile();

    controller = module.get<XeroController>(XeroController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns connected=false when no xeroToken exists for the tenant', async () => {
    mockPrisma.xeroToken.findUnique.mockResolvedValue(null);

    const result = await controller.getSyncStatus(mockUser);

    expect(result.connected).toBe(false);
    expect(result.tokenExpiresAt).toBeNull();
    expect(result.refreshTokenValid).toBe(false);
    expect(result.lastSyncAt).toBeNull();
    expect(result.lastSyncStatus).toBeNull();
    expect(result.currentJob).toBeNull();
    expect(typeof result.nextScheduledSyncAt).toBe('string');
  });

  it('returns connected=true with token details when xeroToken exists', async () => {
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    mockPrisma.xeroToken.findUnique.mockResolvedValue({
      tenantId: TENANT_ID,
      tokenExpiresAt,
      updatedAt: new Date(),
    });

    mockPrisma.bankConnection.findFirst.mockResolvedValue({
      lastSyncAt: new Date('2026-04-27T10:00:00.000Z'),
      status: 'ACTIVE',
      errorMessage: null,
    });

    const result = await controller.getSyncStatus(mockUser);

    expect(result.connected).toBe(true);
    expect(result.tokenExpiresAt).toBe(tokenExpiresAt.toISOString());
    expect(result.refreshTokenValid).toBe(true);
    expect(result.lastSyncAt).toBe('2026-04-27T10:00:00.000Z');
    expect(result.lastSyncStatus).toBe('COMPLETED');
    expect(result.lastSyncError).toBeNull();
    expect(result.lastSyncRecordsImported).toBeNull(); // no tracking table yet
    expect(result.currentJob).toBeNull();
  });

  it('returns lastSyncStatus=FAILED when bankConnection.status is ERROR', async () => {
    mockPrisma.xeroToken.findUnique.mockResolvedValue({
      tenantId: TENANT_ID,
      tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      updatedAt: new Date(),
    });

    mockPrisma.bankConnection.findFirst.mockResolvedValue({
      lastSyncAt: new Date('2026-04-26T08:00:00.000Z'),
      status: 'ERROR',
      errorMessage: 'rate limit exceeded',
    });

    const result = await controller.getSyncStatus(mockUser);

    expect(result.lastSyncStatus).toBe('FAILED');
    expect(result.lastSyncError).toBe('rate limit exceeded');
  });

  it('returns currentJob when auto-sync is in-flight for this tenant', async () => {
    mockPrisma.xeroToken.findUnique.mockResolvedValue({
      tenantId: TENANT_ID,
      tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      updatedAt: new Date(),
    });

    mockPrisma.bankConnection.findFirst.mockResolvedValue(null);

    mockAutoSyncJob.isInFlight.mockReturnValue(true);

    const result = await controller.getSyncStatus(mockUser);

    expect(result.lastSyncStatus).toBe('RUNNING');
    expect(result.currentJob).not.toBeNull();
    expect(result.currentJob?.status).toBe('RUNNING');
    expect(result.currentJob?.id).toBe(`auto-sync-${TENANT_ID}`);
  });

  it('returns nextScheduledSyncAt as the next :00 UTC hour boundary', async () => {
    mockPrisma.xeroToken.findUnique.mockResolvedValue(null);

    const result = await controller.getSyncStatus(mockUser);

    const next = new Date(result.nextScheduledSyncAt);
    // Minutes and seconds must be zero
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
    // Must be in the future
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});
