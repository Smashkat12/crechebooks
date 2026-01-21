/**
 * Bank Sync Job
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * Periodic job to sync transactions from linked bank accounts.
 * Runs every 4 hours to fetch new transactions and trigger reconciliation.
 *
 * Features:
 * - Cron-based scheduling (every 4 hours)
 * - Per-account sync with error isolation
 * - Consent expiry handling
 * - Rate limiting compliance
 * - Graceful shutdown support
 * - Manual trigger capability
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StitchBankingService } from '../integrations/banking/stitch.service';
import { ConfigService } from '@nestjs/config';
import {
  SyncJobResult,
  AccountSyncResult,
  DEFAULT_SYNC_CONFIG,
} from '../integrations/banking/stitch.types';

/**
 * Result of sync job run
 */
export interface BankSyncJobResult {
  /** Job run ID */
  jobRunId: string;
  /** Number of accounts synced */
  accountsSynced: number;
  /** Number of accounts with errors */
  accountsFailed: number;
  /** Number of accounts skipped */
  accountsSkipped: number;
  /** Total transactions synced */
  totalTransactions: number;
  /** Total new transactions */
  newTransactions: number;
  /** Job start time */
  startedAt: Date;
  /** Job end time */
  completedAt: Date;
  /** Duration in ms */
  durationMs: number;
  /** Individual account results */
  accountResults: AccountSyncResult[];
}

@Injectable()
export class BankSyncJob implements OnModuleDestroy {
  private readonly logger = new Logger(BankSyncJob.name);
  private isShuttingDown = false;
  private currentJobRunId: string | null = null;
  private readonly enabled: boolean;
  private readonly maxConcurrentSyncs: number;
  private readonly syncDelayMs: number;

  constructor(
    private readonly stitchService: StitchBankingService,
    private readonly configService: ConfigService,
  ) {
    // Check if bank sync is enabled
    this.enabled =
      this.configService.get<string>('BANK_API_ENABLED') === 'true';
    this.maxConcurrentSyncs =
      this.configService.get<number>('BANK_SYNC_MAX_CONCURRENT') || 5;
    this.syncDelayMs =
      this.configService.get<number>('BANK_SYNC_DELAY_MS') || 1000;

    if (!this.enabled) {
      this.logger.warn(
        'BankSyncJob is DISABLED. Set BANK_API_ENABLED=true to enable.',
      );
    } else {
      this.logger.log(
        `BankSyncJob initialized (maxConcurrent: ${this.maxConcurrentSyncs})`,
      );
    }
  }

  /**
   * Handle module destruction for graceful shutdown
   */
  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.currentJobRunId) {
      this.logger.log(
        `Graceful shutdown: waiting for job ${this.currentJobRunId} to complete`,
      );
    }
  }

  /**
   * Main sync job - runs every 4 hours
   * Syncs all active linked bank accounts
   */
  @Cron('0 */4 * * *', {
    name: 'bank-sync',
    timeZone: 'Africa/Johannesburg',
  })
  async syncAllAccounts(): Promise<BankSyncJobResult> {
    if (!this.enabled) {
      this.logger.debug('Bank sync skipped - feature disabled');
      return this.createEmptyResult('disabled');
    }

    if (this.isShuttingDown) {
      this.logger.warn('Bank sync skipped - application shutting down');
      return this.createEmptyResult('shutdown');
    }

    if (this.currentJobRunId) {
      this.logger.warn('Bank sync skipped - previous job still running');
      return this.createEmptyResult('already-running');
    }

    const jobRunId = this.generateJobRunId();
    this.currentJobRunId = jobRunId;
    const startedAt = new Date();

    this.logger.log(`Starting bank sync job: ${jobRunId}`);

    try {
      // Get all accounts due for sync
      const accountIds = await this.stitchService.getAccountsDueForSync();

      if (accountIds.length === 0) {
        this.logger.log('No accounts due for sync');
        return this.createEmptyResult(jobRunId, startedAt);
      }

      this.logger.log(`Found ${accountIds.length} accounts to sync`);

      // Process accounts in batches for rate limiting
      const results: AccountSyncResult[] = [];
      const batches = this.chunkArray(accountIds, this.maxConcurrentSyncs);

      for (const batch of batches) {
        if (this.isShuttingDown) {
          this.logger.warn('Stopping sync due to shutdown signal');
          break;
        }

        // Sync batch in parallel
        const batchResults = await Promise.all(
          batch.map((accountId) => this.syncAccountSafe(accountId)),
        );

        results.push(...batchResults);

        // Rate limiting delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await this.delay(this.syncDelayMs);
        }
      }

      const completedAt = new Date();

      const result: BankSyncJobResult = {
        jobRunId,
        accountsSynced: results.filter((r) => r.success).length,
        accountsFailed: results.filter((r) => !r.success).length,
        accountsSkipped: accountIds.length - results.length,
        totalTransactions: results.reduce(
          (sum, r) => sum + r.transactionsRetrieved,
          0,
        ),
        newTransactions: results.reduce((sum, r) => sum + r.transactionsNew, 0),
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        accountResults: results,
      };

      this.logger.log(
        `Bank sync completed: ${result.accountsSynced} synced, ` +
          `${result.accountsFailed} failed, ${result.newTransactions} new transactions, ` +
          `duration: ${result.durationMs}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Bank sync job failed: ${error}`);
      throw error;
    } finally {
      this.currentJobRunId = null;
    }
  }

  /**
   * Sync a single account (for manual trigger)
   *
   * @param accountId - Linked bank account ID
   * @returns Sync result
   */
  async syncAccount(accountId: string): Promise<AccountSyncResult> {
    if (!this.enabled) {
      return {
        accountId,
        success: false,
        transactionsRetrieved: 0,
        transactionsNew: 0,
        transactionsDuplicate: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        errorMessage: 'Bank sync feature is disabled',
        reconciliationTriggered: false,
      };
    }

    this.logger.log(`Manual sync triggered for account: ${accountId}`);
    return this.stitchService.syncAccount(accountId);
  }

  /**
   * Check if bank sync is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if a sync job is currently running
   */
  isJobRunning(): boolean {
    return this.currentJobRunId !== null;
  }

  /**
   * Get current job run ID
   */
  getCurrentJobRunId(): string | null {
    return this.currentJobRunId;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Sync account with error isolation
   */
  private async syncAccountSafe(accountId: string): Promise<AccountSyncResult> {
    try {
      return await this.stitchService.syncAccount(accountId);
    } catch (error) {
      this.logger.error(`Failed to sync account ${accountId}: ${error}`);
      return {
        accountId,
        success: false,
        transactionsRetrieved: 0,
        transactionsNew: 0,
        transactionsDuplicate: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        reconciliationTriggered: false,
      };
    }
  }

  /**
   * Create empty result for skipped runs
   */
  private createEmptyResult(
    jobRunId: string,
    startedAt: Date = new Date(),
  ): BankSyncJobResult {
    const completedAt = new Date();
    return {
      jobRunId,
      accountsSynced: 0,
      accountsFailed: 0,
      accountsSkipped: 0,
      totalTransactions: 0,
      newTransactions: 0,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      accountResults: [],
    };
  }

  /**
   * Generate unique job run ID
   */
  private generateJobRunId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `sync-${timestamp}-${random}`;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
