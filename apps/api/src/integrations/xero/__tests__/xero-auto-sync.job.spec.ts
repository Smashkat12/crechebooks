/**
 * XeroAutoSyncJob unit tests
 * TASK-XERO-011: Hourly auto-sync cron
 */

import { Test, TestingModule } from '@nestjs/testing';
import { XeroAutoSyncJob } from '../xero-auto-sync.job';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BankFeedService } from '../bank-feed.service';
import * as TokenManagerModule from '../../../mcp/xero-mcp/auth/token-manager';

// Mock the TokenManager so it doesn't try to decrypt real tokens
jest.mock('../../../mcp/xero-mcp/auth/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    hasValidConnection: jest.fn(),
  })),
}));

const MockedTokenManager = jest.mocked(TokenManagerModule.TokenManager);

const makePrisma = () => ({
  xeroToken: {
    findMany: jest.fn(),
  },
  bankConnection: {
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const makeBankFeed = () => ({
  syncTransactions: jest.fn(),
  syncFromJournals: jest.fn(),
  /** Delegate to real implementation for error-message extraction tests. */
  extractXeroErrorMessage: jest
    .fn()
    .mockImplementation((err: unknown): string => {
      if (err instanceof Error) return err.message.slice(0, 1000);
      if (err !== null && typeof err === 'object') {
        try {
          return JSON.stringify(err).slice(0, 1000);
        } catch {
          /* fall through */
        }
      }
      return String(err).slice(0, 1000);
    }),
});

/** Helper: get the hasValidConnection mock from the last TokenManager instance created. */
function getTokenManagerHasValidConnection(): jest.Mock {
  const lastCall =
    MockedTokenManager.mock.results[MockedTokenManager.mock.results.length - 1];
  return (lastCall.value as { hasValidConnection: jest.Mock })
    .hasValidConnection;
}

describe('XeroAutoSyncJob', () => {
  let job: XeroAutoSyncJob;
  let prisma: ReturnType<typeof makePrisma>;
  let bankFeed: ReturnType<typeof makeBankFeed>;

  beforeEach(async () => {
    prisma = makePrisma();
    bankFeed = makeBankFeed();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroAutoSyncJob,
        { provide: PrismaService, useValue: prisma },
        { provide: BankFeedService, useValue: bankFeed },
      ],
    }).compile();

    job = module.get<XeroAutoSyncJob>(XeroAutoSyncJob);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runAutoSync', () => {
    it('does nothing when there are no connected tenants', async () => {
      prisma.xeroToken.findMany.mockResolvedValue([]);

      await job.runAutoSync();

      expect(bankFeed.syncTransactions).not.toHaveBeenCalled();
      expect(bankFeed.syncFromJournals).not.toHaveBeenCalled();
    });

    it('calls syncTransactions and syncFromJournals for a connected tenant', async () => {
      const tenantId = 'tenant-abc';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000), // expires in 30 min (still valid)
          updatedAt: new Date(now - 5 * 60 * 1000), // updated 5 min ago (fresh)
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);

      prisma.bankConnection.findFirst.mockResolvedValue({
        lastSyncAt: new Date(now - 60 * 60 * 1000), // 1 hour ago
      });

      bankFeed.syncTransactions.mockResolvedValue({
        transactionsCreated: 5,
        duplicatesSkipped: 2,
        errors: [],
        transactionsFound: 7,
        connectionId: 'all',
        syncedAt: new Date(),
      });

      bankFeed.syncFromJournals.mockResolvedValue({
        created: 1,
        skipped: 0,
        found: 1,
      });

      await job.runAutoSync();

      expect(bankFeed.syncTransactions).toHaveBeenCalledTimes(1);
      expect(bankFeed.syncTransactions).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ forceFullSync: false }),
      );
      expect(bankFeed.syncFromJournals).toHaveBeenCalledTimes(1);
    });

    it('skips a tenant when the token is stale and guard 2 short-circuits', async () => {
      const tenantId = 'tenant-expired';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now - 2 * 60 * 60 * 1000), // expired 2h ago
          updatedAt: new Date(now - 70 * 24 * 60 * 60 * 1000), // 70 days old → refresh token stale
        },
      ]);

      // Guard 2 fires on stale-by-age check — hasValidConnection is irrelevant
      // but set it up defensively
      getTokenManagerHasValidConnection().mockResolvedValue(false);

      await job.runAutoSync();

      expect(bankFeed.syncTransactions).not.toHaveBeenCalled();
    });

    it('skips a tenant when hasValidConnection returns false (guard 3)', async () => {
      const tenantId = 'tenant-refresh-failed';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          // Token not stale by age (guard 2 passes), but access token is expired
          tokenExpiresAt: new Date(now - 10 * 60 * 1000), // expired 10 min ago
          updatedAt: new Date(now - 5 * 60 * 1000), // recently updated (not stale)
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(false);

      await job.runAutoSync();

      expect(bankFeed.syncTransactions).not.toHaveBeenCalled();
    });

    it('skips a tenant that is already in-flight', async () => {
      const tenantId = 'tenant-busy';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      // Manually mark the tenant as in-flight
      (job as unknown as { inFlightTenants: Set<string> }).inFlightTenants.add(
        tenantId,
      );

      await job.runAutoSync();

      expect(bankFeed.syncTransactions).not.toHaveBeenCalled();
    });

    it('clears the in-flight lock after a successful sync', async () => {
      const tenantId = 'tenant-lock-release';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);

      bankFeed.syncTransactions.mockResolvedValue({
        transactionsCreated: 0,
        duplicatesSkipped: 0,
        errors: [],
        transactionsFound: 0,
        connectionId: 'all',
        syncedAt: new Date(),
      });

      bankFeed.syncFromJournals.mockResolvedValue({
        created: 0,
        skipped: 0,
        found: 0,
      });

      await job.runAutoSync();

      const inFlight = (job as unknown as { inFlightTenants: Set<string> })
        .inFlightTenants;
      expect(inFlight.has(tenantId)).toBe(false);
    });

    it('clears the in-flight lock even when syncTransactions throws', async () => {
      const tenantId = 'tenant-error';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);
      bankFeed.syncTransactions.mockRejectedValue(new Error('Xero 429'));

      // Should not throw
      await expect(job.runAutoSync()).resolves.toBeUndefined();

      const inFlight = (job as unknown as { inFlightTenants: Set<string> })
        .inFlightTenants;
      expect(inFlight.has(tenantId)).toBe(false);
    });

    it('persists error.message (not generic "Sync failed") when syncTransactions throws an Error', async () => {
      const tenantId = 'tenant-err-persist';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);
      bankFeed.syncTransactions.mockRejectedValue(
        new Error('HTTP 403: Forbidden — insufficient scopes'),
      );

      await job.runAutoSync();

      expect(prisma.bankConnection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
          data: expect.objectContaining({
            status: 'ERROR',
            errorMessage: 'HTTP 403: Forbidden — insufficient scopes',
          }),
        }),
      );
    });

    it('persists a decoded error message when xero-node rejects with a plain object (HTTP error shape)', async () => {
      const tenantId = 'tenant-xero-sdk-err';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);

      // xero-node rejects with a plain object, NOT an Error instance
      const xeroSdkRejection = {
        response: {
          status: 429,
          body: {
            Type: 'TooManyRequests',
            Title: 'Too Many Requests',
            Detail: 'Rate limit exceeded. Retry after 30 seconds.',
          },
        },
        body: {
          Type: 'TooManyRequests',
          Title: 'Too Many Requests',
          Detail: 'Rate limit exceeded. Retry after 30 seconds.',
        },
      };

      // extractXeroErrorMessage is mocked to handle this correctly
      bankFeed.extractXeroErrorMessage.mockReturnValue(
        'HTTP 429: Too Many Requests: Rate limit exceeded. Retry after 30 seconds.',
      );
      bankFeed.syncTransactions.mockRejectedValue(xeroSdkRejection);

      await job.runAutoSync();

      // The persisted errorMessage must NOT be the generic "Sync failed"
      expect(prisma.bankConnection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage: expect.not.stringContaining('Sync failed'),
          }),
        }),
      );
      expect(prisma.bankConnection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage:
              'HTTP 429: Too Many Requests: Rate limit exceeded. Retry after 30 seconds.',
          }),
        }),
      );
    });

    it('continues syncing remaining tenants after one fails', async () => {
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId: 'tenant-fail',
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
        {
          tenantId: 'tenant-ok',
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);

      bankFeed.syncTransactions
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          transactionsCreated: 3,
          duplicatesSkipped: 0,
          errors: [],
          transactionsFound: 3,
          connectionId: 'all',
          syncedAt: new Date(),
        });

      bankFeed.syncFromJournals.mockResolvedValue({
        created: 0,
        skipped: 0,
        found: 0,
      });

      await job.runAutoSync();

      // syncTransactions called for both tenants (fail + ok)
      expect(bankFeed.syncTransactions).toHaveBeenCalledTimes(2);
    });

    it('does not rethrow a journals error — journals failure is non-fatal', async () => {
      const tenantId = 'tenant-journals-fail';
      const now = Date.now();

      prisma.xeroToken.findMany.mockResolvedValue([
        {
          tenantId,
          tokenExpiresAt: new Date(now + 30 * 60 * 1000),
          updatedAt: new Date(now - 5 * 60 * 1000),
        },
      ]);

      getTokenManagerHasValidConnection().mockResolvedValue(true);
      prisma.bankConnection.findFirst.mockResolvedValue(null);

      bankFeed.syncTransactions.mockResolvedValue({
        transactionsCreated: 2,
        duplicatesSkipped: 0,
        errors: [],
        transactionsFound: 2,
        connectionId: 'all',
        syncedAt: new Date(),
      });

      bankFeed.syncFromJournals.mockRejectedValue(
        new Error('Insufficient scopes for journals API'),
      );

      // Should not throw
      await expect(job.runAutoSync()).resolves.toBeUndefined();
      // Accounting API sync still completed
      expect(bankFeed.syncTransactions).toHaveBeenCalledTimes(1);
    });
  });

  describe('isInFlight', () => {
    it('returns false when tenant is not syncing', () => {
      expect(job.isInFlight('some-tenant')).toBe(false);
    });

    it('returns true when tenant is in the in-flight set', () => {
      (job as unknown as { inFlightTenants: Set<string> }).inFlightTenants.add(
        'syncing-tenant',
      );
      expect(job.isInFlight('syncing-tenant')).toBe(true);
    });
  });
});
