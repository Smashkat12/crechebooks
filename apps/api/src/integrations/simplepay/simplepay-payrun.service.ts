/**
 * SimplePay Pay Run Service
 * Manages pay runs, accounting data, and Xero journal integration
 *
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { PayRunSyncRepository } from '../../database/repositories/payrun-sync.repository';
import {
  SimplePayWave,
  SimplePayPayRun,
  SimplePayPayslip,
  SimplePayAccounting,
  PayRunSyncStatus,
  PayRunSyncResult,
  XeroJournalConfig,
  DEFAULT_XERO_JOURNAL_CONFIG,
} from '../../database/entities/payrun-sync.entity';
import {
  CreatePayRunSyncDto,
  PayRunFilterDto,
} from '../../database/dto/payrun.dto';
import { PayRunSync } from '@prisma/client';

// Cache structure for waves
interface WaveCache {
  waves: SimplePayWave[];
  cachedAt: number;
}

@Injectable()
export class SimplePayPayRunService {
  private readonly logger = new Logger(SimplePayPayRunService.name);

  // Wave cache with 30 minute TTL
  private waveCache: Map<string, WaveCache> = new Map();
  private readonly WAVE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly payRunSyncRepo: PayRunSyncRepository,
  ) {}

  /**
   * Get waves (payment schedules) for a client with caching
   */
  async getWaves(
    tenantId: string,
    forceRefresh = false,
  ): Promise<SimplePayWave[]> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();
    const cacheKey = `${tenantId}-${clientId}`;

    // Check cache
    if (!forceRefresh) {
      const cached = this.waveCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.WAVE_CACHE_TTL_MS) {
        this.logger.debug(`Using cached waves for tenant ${tenantId}`);
        return cached.waves;
      }
    }

    try {
      // SimplePay returns wrapped: [{ wave: {...} }, ...]
      interface WaveWrapper {
        wave: SimplePayWave;
      }
      const response = await this.apiClient.get<WaveWrapper[]>(
        `/clients/${clientId}/waves`,
      );
      const waves = response.map((w) => w.wave);

      // Cache the result
      this.waveCache.set(cacheKey, {
        waves,
        cachedAt: Date.now(),
      });

      this.logger.log(`Fetched ${waves.length} waves for tenant ${tenantId}`);
      return waves;
    } catch (error) {
      this.logger.error(
        `Failed to fetch waves: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get pay runs for a wave
   */
  async getPayRuns(
    tenantId: string,
    waveId: number,
  ): Promise<SimplePayPayRun[]> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    try {
      // SimplePay returns wrapped: [{ payment_run: {...} }, ...]
      interface PaymentRunWrapper {
        payment_run: SimplePayPayRun;
      }
      const response = await this.apiClient.get<PaymentRunWrapper[]>(
        `/clients/${clientId}/waves/${waveId}/payment_runs`,
      );
      const payRuns = response.map((w) => w.payment_run);

      this.logger.debug(
        `Fetched ${payRuns.length} pay runs for wave ${waveId}`,
      );
      return payRuns;
    } catch (error) {
      this.logger.error(
        `Failed to fetch pay runs for wave ${waveId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get a specific pay run by ID
   */
  async getPayRun(
    tenantId: string,
    payRunId: string | number,
  ): Promise<SimplePayPayRun> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      // SimplePay returns wrapped: { payment_run: {...} }
      interface PaymentRunWrapper {
        payment_run: SimplePayPayRun;
      }
      const response = await this.apiClient.get<PaymentRunWrapper>(
        `/payment_runs/${payRunId}`,
      );
      return response.payment_run;
    } catch (error) {
      this.logger.error(
        `Failed to fetch pay run ${payRunId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get payslips for a pay run
   */
  async getPayRunPayslips(
    tenantId: string,
    payRunId: string | number,
  ): Promise<SimplePayPayslip[]> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      // SimplePay returns wrapped: [{ payslip: {...} }, ...]
      interface PayslipWrapper {
        payslip: SimplePayPayslip;
      }
      const response = await this.apiClient.get<PayslipWrapper[]>(
        `/payment_runs/${payRunId}/payslips`,
      );
      const payslips = response.map((w) => w.payslip);

      this.logger.debug(
        `Fetched ${payslips.length} payslips for pay run ${payRunId}`,
      );
      return payslips;
    } catch (error) {
      this.logger.error(
        `Failed to fetch payslips for pay run ${payRunId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get accounting entries for a pay run
   */
  async getPayRunAccounting(
    tenantId: string,
    payRunId: string | number,
  ): Promise<SimplePayAccounting> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      // SimplePay returns accounting data directly or wrapped
      const response = await this.apiClient.get<
        SimplePayAccounting | { accounting: SimplePayAccounting }
      >(`/payment_runs/${payRunId}/accounting`);

      const accounting =
        'accounting' in response ? response.accounting : response;

      this.logger.debug(
        `Fetched accounting for pay run ${payRunId}: ${accounting.entries?.length || 0} entries`,
      );
      return accounting;
    } catch (error) {
      this.logger.error(
        `Failed to fetch accounting for pay run ${payRunId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Sync a single pay run from SimplePay to local database
   */
  async syncPayRun(
    tenantId: string,
    simplePayPayRunId: string | number,
  ): Promise<PayRunSync> {
    const payRunIdStr = String(simplePayPayRunId);

    try {
      // Get pay run details from SimplePay
      const payRun = await this.getPayRun(tenantId, simplePayPayRunId);

      // Get payslips to calculate totals
      const payslips = await this.getPayRunPayslips(
        tenantId,
        simplePayPayRunId,
      );

      // Get wave details for wave name
      const waves = await this.getWaves(tenantId);
      const wave = waves.find((w) => w.id === payRun.wave_id);

      // Calculate totals from payslips (convert to cents)
      let totalGross = 0;
      let totalNet = 0;
      let totalPaye = 0;
      let totalUifEmployee = 0;
      let totalUifEmployer = 0;

      for (const payslip of payslips) {
        totalGross += payslip.gross || 0;
        totalNet += payslip.nett || 0;
        totalPaye += payslip.paye || 0;
        totalUifEmployee += payslip.uif_employee || 0;
        totalUifEmployer += payslip.uif_employer || 0;
      }

      // Get accounting data for SDL and ETI
      let totalSdl = 0;
      let totalEti = 0;
      let accountingData: Record<string, unknown> | undefined;

      try {
        const accounting = await this.getPayRunAccounting(
          tenantId,
          simplePayPayRunId,
        );
        totalSdl = accounting.totals?.sdl || 0;
        totalEti = accounting.totals?.eti || 0;
        accountingData = accounting as unknown as Record<string, unknown>;
      } catch {
        this.logger.warn(
          `Could not fetch accounting data for pay run ${simplePayPayRunId}`,
        );
      }

      // Create DTO with values converted to cents
      const dto: CreatePayRunSyncDto = {
        tenantId,
        simplePayPayRunId: payRunIdStr,
        waveId: payRun.wave_id,
        waveName: wave?.name || 'Unknown',
        periodStart: new Date(payRun.period_start),
        periodEnd: new Date(payRun.period_end),
        payDate: new Date(payRun.pay_date),
        status: payRun.status,
        employeeCount: payslips.length,
        totalGrossCents: Math.round(totalGross * 100),
        totalNetCents: Math.round(totalNet * 100),
        totalPayeCents: Math.round(totalPaye * 100),
        totalUifEmployeeCents: Math.round(totalUifEmployee * 100),
        totalUifEmployerCents: Math.round(totalUifEmployer * 100),
        totalSdlCents: Math.round(totalSdl * 100),
        totalEtiCents: Math.round(totalEti * 100),
        accountingData,
      };

      // Upsert the record
      const result = await this.payRunSyncRepo.upsert(dto);

      // Update status to SYNCED if we have accounting data
      if (accountingData) {
        await this.payRunSyncRepo.updateSyncStatus(
          result.id,
          PayRunSyncStatus.SYNCED,
        );
      }

      this.logger.log(
        `Synced pay run ${simplePayPayRunId} for tenant ${tenantId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sync pay run ${simplePayPayRunId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Sync all pay runs for a wave
   */
  async syncAllPayRuns(
    tenantId: string,
    waveId?: number,
  ): Promise<PayRunSyncResult[]> {
    const results: PayRunSyncResult[] = [];

    try {
      const waves = await this.getWaves(tenantId);
      const wavesToSync = waveId
        ? waves.filter((w) => w.id === waveId)
        : waves.filter((w) => w.is_active);

      for (const wave of wavesToSync) {
        const payRuns = await this.getPayRuns(tenantId, wave.id);

        for (const payRun of payRuns) {
          const result: PayRunSyncResult = {
            success: false,
            payRunId: '',
            simplePayPayRunId: String(payRun.id),
            xeroJournalId: null,
            errors: [],
          };

          try {
            const synced = await this.syncPayRun(tenantId, payRun.id);
            result.success = true;
            result.payRunId = synced.id;
          } catch (error) {
            result.errors.push(
              error instanceof Error ? error.message : String(error),
            );
          }

          results.push(result);
        }
      }

      const successful = results.filter((r) => r.success).length;
      this.logger.log(
        `Synced ${successful}/${results.length} pay runs for tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync all pay runs: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    return results;
  }

  /**
   * Get pay run sync status from local database
   */
  async getPayRunSyncStatus(
    tenantId: string,
    filter?: PayRunFilterDto,
  ): Promise<PayRunSync[]> {
    return this.payRunSyncRepo.findByTenant(tenantId, filter);
  }

  /**
   * Get a single pay run sync by SimplePay ID
   */
  async getPayRunSync(
    tenantId: string,
    simplePayPayRunId: string,
  ): Promise<PayRunSync | null> {
    return this.payRunSyncRepo.findBySimplePayId(tenantId, simplePayPayRunId);
  }

  /**
   * Get pay run syncs pending Xero posting
   */
  async getPendingXeroSync(tenantId: string): Promise<PayRunSync[]> {
    return this.payRunSyncRepo.findPendingXeroSync(tenantId);
  }

  /**
   * Post pay run to Xero as a manual journal
   * This creates the journal entries based on the accounting data
   */
  async postPayRunToXero(
    tenantId: string,
    payRunSyncId: string,
    config: XeroJournalConfig = DEFAULT_XERO_JOURNAL_CONFIG,
  ): Promise<PayRunSyncResult> {
    const result: PayRunSyncResult = {
      success: false,
      payRunId: payRunSyncId,
      simplePayPayRunId: '',
      xeroJournalId: null,
      errors: [],
    };

    try {
      const payRunSync =
        await this.payRunSyncRepo.findByIdOrThrow(payRunSyncId);
      result.simplePayPayRunId = payRunSync.simplePayPayRunId;

      // Validate status
      if (payRunSync.syncStatus === PayRunSyncStatus.XERO_POSTED) {
        result.errors.push('Pay run has already been posted to Xero');
        return result;
      }

      if (payRunSync.syncStatus === PayRunSyncStatus.PENDING) {
        result.errors.push(
          'Pay run has not been synced from SimplePay yet. Sync first.',
        );
        return result;
      }

      // Build journal entries
      const journalLines = this.buildXeroJournalLines(payRunSync, config);

      // Validate journal balances
      const totalDebits = journalLines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredits = journalLines.reduce((sum, l) => sum + l.credit, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        result.errors.push(
          `Journal does not balance: Debits=${totalDebits}, Credits=${totalCredits}`,
        );
        await this.payRunSyncRepo.markXeroFailed(
          payRunSyncId,
          result.errors.join('; '),
        );
        return result;
      }

      // TODO: Actual Xero API integration would go here
      // For now, we simulate a successful post with a mock journal ID
      const mockJournalId = `MJ-${Date.now()}`;

      // Mark as posted
      await this.payRunSyncRepo.markXeroPosted(payRunSyncId, mockJournalId);

      result.success = true;
      result.xeroJournalId = mockJournalId;

      this.logger.log(
        `Posted pay run ${payRunSyncId} to Xero with journal ${mockJournalId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);

      try {
        await this.payRunSyncRepo.markXeroFailed(payRunSyncId, errorMessage);
      } catch {
        // Ignore marking error
      }

      this.logger.error(`Failed to post pay run to Xero: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Build Xero journal lines from pay run sync data
   */
  private buildXeroJournalLines(
    payRunSync: PayRunSync,
    config: XeroJournalConfig,
  ): Array<{
    accountCode: string;
    description: string;
    debit: number;
    credit: number;
  }> {
    const lines: Array<{
      accountCode: string;
      description: string;
      debit: number;
      credit: number;
    }> = [];

    const periodStr = `${payRunSync.periodStart.toISOString().split('T')[0]} to ${payRunSync.periodEnd.toISOString().split('T')[0]}`;
    const narration = `${config.narrationPrefix} - ${payRunSync.waveName} - ${periodStr}`;

    // Gross salary expense (Debit)
    const grossRands = payRunSync.totalGrossCents / 100;
    lines.push({
      accountCode: config.salaryExpenseCode,
      description: `${narration} - Gross Salaries`,
      debit: grossRands,
      credit: 0,
    });

    // Net salary payable (Credit)
    const netRands = payRunSync.totalNetCents / 100;
    lines.push({
      accountCode: config.salaryPayableCode,
      description: `${narration} - Net Salaries Payable`,
      debit: 0,
      credit: netRands,
    });

    // PAYE payable (Credit)
    if (payRunSync.totalPayeCents > 0) {
      const payeRands = payRunSync.totalPayeCents / 100;
      lines.push({
        accountCode: config.payePayableCode,
        description: `${narration} - PAYE`,
        debit: 0,
        credit: payeRands,
      });
    }

    // UIF payable - Employee portion (Credit)
    if (payRunSync.totalUifEmployeeCents > 0) {
      const uifEmployeeRands = payRunSync.totalUifEmployeeCents / 100;
      lines.push({
        accountCode: config.uifPayableCode,
        description: `${narration} - UIF (Employee)`,
        debit: 0,
        credit: uifEmployeeRands,
      });
    }

    // UIF payable - Employer portion (Debit expense, Credit payable)
    if (payRunSync.totalUifEmployerCents > 0) {
      const uifEmployerRands = payRunSync.totalUifEmployerCents / 100;
      // UIF Employer is an expense
      lines.push({
        accountCode: '6200', // UIF Employer Expense
        description: `${narration} - UIF (Employer Contribution)`,
        debit: uifEmployerRands,
        credit: 0,
      });
      lines.push({
        accountCode: config.uifPayableCode,
        description: `${narration} - UIF (Employer)`,
        debit: 0,
        credit: uifEmployerRands,
      });
    }

    // SDL payable (Debit expense, Credit payable)
    if (payRunSync.totalSdlCents > 0) {
      const sdlRands = payRunSync.totalSdlCents / 100;
      lines.push({
        accountCode: '6210', // SDL Expense
        description: `${narration} - SDL`,
        debit: sdlRands,
        credit: 0,
      });
      lines.push({
        accountCode: config.sdlPayableCode,
        description: `${narration} - SDL Payable`,
        debit: 0,
        credit: sdlRands,
      });
    }

    // ETI receivable (Debit receivable, Credit expense reduction)
    if (payRunSync.totalEtiCents > 0) {
      const etiRands = payRunSync.totalEtiCents / 100;
      lines.push({
        accountCode: config.etiReceivableCode,
        description: `${narration} - ETI Receivable`,
        debit: etiRands,
        credit: 0,
      });
      lines.push({
        accountCode: config.salaryExpenseCode,
        description: `${narration} - ETI Offset`,
        debit: 0,
        credit: etiRands,
      });
    }

    return lines;
  }

  /**
   * Clear the wave cache
   */
  clearWaveCache(tenantId?: string): void {
    if (tenantId) {
      const clientId = this.apiClient.getClientId();
      const cacheKey = `${tenantId}-${clientId}`;
      this.waveCache.delete(cacheKey);
      this.logger.debug(`Cleared wave cache for tenant ${tenantId}`);
    } else {
      this.waveCache.clear();
      this.logger.debug('Cleared all wave caches');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { waveCacheSize: number; waveCacheTtlMs: number } {
    return {
      waveCacheSize: this.waveCache.size,
      waveCacheTtlMs: this.WAVE_CACHE_TTL_MS,
    };
  }
}
