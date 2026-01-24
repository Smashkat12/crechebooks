/**
 * Opening Balance Wizard Service
 * TASK-ACCT-003: Opening Balances Wizard Service
 *
 * @module database/services/opening-balance
 * @description Manages opening balance imports for new tenant migration.
 * Provides a structured wizard to ensure all account balances are correctly captured.
 *
 * CRITICAL: Opening balances must balance (total debits = total credits)
 * CRITICAL: Completed imports are locked and cannot be modified
 * CRITICAL: All monetary values are in cents (integers)
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  OpeningBalance,
  OpeningBalanceImport,
  OpeningBalanceImportStatus,
  ChartOfAccount,
} from '@prisma/client';
import {
  CreateOpeningBalanceImportDto,
  SetAccountBalanceDto,
  OpeningBalanceResponse,
  OpeningBalanceImportResponse,
  ImportSummaryResponse,
  WizardStepResponse,
} from '../dto/opening-balance.dto';

// Wizard step configuration
const WIZARD_STEPS = [
  {
    step: 1,
    title: 'Select Migration Date',
    description: 'Choose the opening balance date (usually start of financial year)',
    accountTypes: [] as string[], // No accounts for this step
  },
  {
    step: 2,
    title: 'Enter Bank Balances',
    description: 'Enter balances for all bank and cash accounts',
    accountTypes: ['ASSET'],
    accountCodes: ['1000', '1200'], // Bank, Petty Cash
  },
  {
    step: 3,
    title: 'Enter Receivables',
    description: 'Enter total outstanding parent/debtor balances',
    accountTypes: ['ASSET'],
    accountCodes: ['1100'], // Accounts Receivable
  },
  {
    step: 4,
    title: 'Enter Payables & Liabilities',
    description: 'Enter outstanding bills, VAT, PAYE, UIF liabilities',
    accountTypes: ['LIABILITY'],
    accountCodes: ['2000', '2100', '2200', '2300'], // AP, VAT, PAYE, UIF
  },
  {
    step: 5,
    title: 'Enter Fixed Assets',
    description: 'Enter equipment values and accumulated depreciation',
    accountTypes: ['ASSET'],
    accountCodes: ['1500', '1510'], // Fixed Assets, Acc Depreciation
  },
  {
    step: 6,
    title: 'Review & Verify',
    description: 'Review all balances. System calculates retained earnings to balance.',
    accountTypes: [],
  },
  {
    step: 7,
    title: 'Complete',
    description: 'Lock opening balances and complete the import',
    accountTypes: [],
  },
];

@Injectable()
export class OpeningBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
  ) {}

  /**
   * Create a new opening balance import
   */
  async createImport(
    tenantId: string,
    userId: string,
    data: CreateOpeningBalanceImportDto,
  ): Promise<OpeningBalanceImport> {
    const asOfDate = new Date(data.asOfDate);

    // Check if import already exists for this date (not cancelled/failed)
    const existing = await this.prisma.openingBalanceImport.findFirst({
      where: {
        tenantId,
        asOfDate,
        status: { notIn: ['FAILED'] },
      },
    });

    if (existing) {
      if (existing.status === 'POSTED') {
        throw new ConflictException(
          `Opening balance import already completed for ${asOfDate.toISOString().split('T')[0]}`,
        );
      }
      // Return existing draft/in-progress import
      return existing;
    }

    const importRecord = await this.prisma.openingBalanceImport.create({
      data: {
        tenantId,
        asOfDate,
        sourceType: data.sourceType || 'MANUAL',
        status: 'DRAFT',
      },
    });

    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'OpeningBalanceImport',
      entityId: importRecord.id,
      afterValue: {
        asOfDate: asOfDate.toISOString(),
        sourceType: data.sourceType || 'MANUAL',
      },
    });

    return importRecord;
  }

  /**
   * Get import by ID
   */
  async getImportById(tenantId: string, importId: string): Promise<OpeningBalanceImport> {
    const importRecord = await this.prisma.openingBalanceImport.findFirst({
      where: { id: importId, tenantId },
    });

    if (!importRecord) {
      throw new NotFoundException('Opening balance import not found');
    }

    return importRecord;
  }

  /**
   * Get full import summary with all balances
   */
  async getImportSummary(tenantId: string, importId: string): Promise<ImportSummaryResponse> {
    const importRecord = await this.getImportById(tenantId, importId);

    const balances = await this.prisma.openingBalance.findMany({
      where: { tenantId, importId },
      include: { account: true },
      orderBy: { account: { code: 'asc' } },
    });

    const balanceResponses: OpeningBalanceResponse[] = balances.map((b) => ({
      id: b.id,
      accountId: b.accountId,
      accountCode: b.account.code,
      accountName: b.account.name,
      accountType: b.account.type,
      debitCents: b.debitCents,
      creditCents: b.creditCents,
      notes: b.notes,
      isVerified: b.isVerified,
    }));

    // Group by account type
    const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
    const accountCategories = accountTypes.map((type) => {
      const typeBalances = balanceResponses.filter((b) => b.accountType === type);
      return {
        type,
        accounts: typeBalances,
        totalDebits: typeBalances.reduce((sum, b) => sum + (b.debitCents || 0), 0),
        totalCredits: typeBalances.reduce((sum, b) => sum + (b.creditCents || 0), 0),
      };
    });

    return {
      import: {
        id: importRecord.id,
        asOfDate: importRecord.asOfDate,
        status: importRecord.status,
        sourceType: importRecord.sourceType,
        totalDebits: importRecord.totalDebits,
        totalCredits: importRecord.totalCredits,
        discrepancy: importRecord.discrepancy,
        balanceCount: balances.length,
        createdAt: importRecord.createdAt,
      },
      balances: balanceResponses,
      accountCategories,
    };
  }

  /**
   * Set or update an account balance
   */
  async setAccountBalance(
    tenantId: string,
    userId: string,
    importId: string,
    data: SetAccountBalanceDto,
  ): Promise<OpeningBalance> {
    const importRecord = await this.getImportById(tenantId, importId);

    if (importRecord.status === 'POSTED') {
      throw new BadRequestException('Cannot modify completed import');
    }

    if (importRecord.status === 'VALIDATED') {
      // Reset to draft if modifying after validation
      await this.prisma.openingBalanceImport.update({
        where: { id: importId },
        data: { status: 'DRAFT' },
      });
    }

    // Verify account exists
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: data.accountId, tenantId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Validate balance direction (debit or credit, not both unless zero)
    if (data.debitCents && data.creditCents && data.debitCents > 0 && data.creditCents > 0) {
      throw new BadRequestException(
        'Cannot have both debit and credit balance. Use net balance for the account.',
      );
    }

    // Upsert the opening balance
    const balance = await this.prisma.openingBalance.upsert({
      where: {
        tenantId_accountId_asOfDate: {
          tenantId,
          accountId: data.accountId,
          asOfDate: importRecord.asOfDate,
        },
      },
      create: {
        tenantId,
        accountId: data.accountId,
        importId,
        asOfDate: importRecord.asOfDate,
        debitCents: data.debitCents || null,
        creditCents: data.creditCents || null,
        notes: data.notes,
      },
      update: {
        debitCents: data.debitCents || null,
        creditCents: data.creditCents || null,
        notes: data.notes,
        isVerified: false, // Reset verification on change
        verifiedById: null,
        verifiedAt: null,
      },
    });

    // Recalculate import totals
    await this.recalculateImportTotals(importId);

    return balance;
  }

  /**
   * Set multiple account balances at once
   */
  async bulkSetAccountBalances(
    tenantId: string,
    userId: string,
    importId: string,
    balances: SetAccountBalanceDto[],
  ): Promise<OpeningBalance[]> {
    const results: OpeningBalance[] = [];

    for (const balance of balances) {
      const result = await this.setAccountBalance(tenantId, userId, importId, balance);
      results.push(result);
    }

    return results;
  }

  /**
   * Recalculate import totals
   */
  private async recalculateImportTotals(importId: string): Promise<void> {
    const importRecord = await this.prisma.openingBalanceImport.findUnique({
      where: { id: importId },
    });

    if (!importRecord) return;

    const balances = await this.prisma.openingBalance.findMany({
      where: { importId },
    });

    const totalDebits = balances.reduce((sum, b) => sum + (b.debitCents || 0), 0);
    const totalCredits = balances.reduce((sum, b) => sum + (b.creditCents || 0), 0);
    const discrepancy = totalDebits - totalCredits;

    await this.prisma.openingBalanceImport.update({
      where: { id: importId },
      data: { totalDebits, totalCredits, discrepancy },
    });
  }

  /**
   * Validate the import (check balances match)
   */
  async validateImport(
    tenantId: string,
    userId: string,
    importId: string,
    forceBalance: boolean = false,
  ): Promise<OpeningBalanceImport> {
    const importRecord = await this.getImportById(tenantId, importId);

    if (importRecord.status === 'POSTED') {
      throw new BadRequestException('Import already completed');
    }

    // Recalculate to ensure accuracy
    await this.recalculateImportTotals(importId);

    const updatedImport = await this.prisma.openingBalanceImport.findUnique({
      where: { id: importId },
    });

    if (!updatedImport) {
      throw new NotFoundException('Import not found');
    }

    // Check for discrepancy
    if (updatedImport.discrepancy !== 0 && !forceBalance) {
      // Try to auto-balance using Retained Earnings
      const autoBalanced = await this.tryAutoBalance(tenantId, importId, updatedImport.discrepancy);

      if (!autoBalanced) {
        throw new BadRequestException(
          `Cannot validate import with discrepancy of ${updatedImport.discrepancy} cents. ` +
            `Total Debits: ${updatedImport.totalDebits}, Total Credits: ${updatedImport.totalCredits}. ` +
            `Debits must equal credits.`,
        );
      }
    }

    // Mark all balances as verified
    await this.prisma.openingBalance.updateMany({
      where: { importId },
      data: {
        isVerified: true,
        verifiedById: userId,
        verifiedAt: new Date(),
      },
    });

    const validated = await this.prisma.openingBalanceImport.update({
      where: { id: importId },
      data: { status: 'VALIDATED' },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'OpeningBalanceImport',
      entityId: importId,
      beforeValue: { status: importRecord.status },
      afterValue: {
        status: 'VALIDATED',
        totalDebits: updatedImport.totalDebits,
        totalCredits: updatedImport.totalCredits,
      },
    });

    return validated;
  }

  /**
   * Try to auto-balance using Retained Earnings account
   */
  private async tryAutoBalance(
    tenantId: string,
    importId: string,
    discrepancy: number,
  ): Promise<boolean> {
    // Find Retained Earnings account (code 3200)
    const retainedEarningsAccount = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: '3200' },
    });

    if (!retainedEarningsAccount) {
      return false;
    }

    const importRecord = await this.prisma.openingBalanceImport.findUnique({
      where: { id: importId },
    });

    if (!importRecord) return false;

    // If debits > credits, we need more credits (add to Retained Earnings as credit)
    // If credits > debits, we need more debits (reduce Retained Earnings credit)
    const existingBalance = await this.prisma.openingBalance.findFirst({
      where: {
        tenantId,
        accountId: retainedEarningsAccount.id,
        asOfDate: importRecord.asOfDate,
      },
    });

    const currentCredit = existingBalance?.creditCents || 0;
    const currentDebit = existingBalance?.debitCents || 0;

    // discrepancy = totalDebits - totalCredits
    // If discrepancy > 0, debits are higher, need more credits
    // If discrepancy < 0, credits are higher, need more debits (or less credits)
    const newCreditCents = currentCredit + discrepancy;

    await this.prisma.openingBalance.upsert({
      where: {
        tenantId_accountId_asOfDate: {
          tenantId,
          accountId: retainedEarningsAccount.id,
          asOfDate: importRecord.asOfDate,
        },
      },
      create: {
        tenantId,
        accountId: retainedEarningsAccount.id,
        importId,
        asOfDate: importRecord.asOfDate,
        debitCents: newCreditCents < 0 ? Math.abs(newCreditCents) : null,
        creditCents: newCreditCents >= 0 ? newCreditCents : null,
        notes: 'Auto-calculated balancing figure',
      },
      update: {
        debitCents: newCreditCents < 0 ? Math.abs(newCreditCents) : null,
        creditCents: newCreditCents >= 0 ? newCreditCents : null,
        notes: 'Auto-calculated balancing figure',
      },
    });

    // Recalculate totals
    await this.recalculateImportTotals(importId);

    // Verify balanced
    const updated = await this.prisma.openingBalanceImport.findUnique({
      where: { id: importId },
    });

    return updated?.discrepancy === 0;
  }

  /**
   * Complete the import (lock and post)
   */
  async completeImport(
    tenantId: string,
    userId: string,
    importId: string,
  ): Promise<OpeningBalanceImport> {
    const importRecord = await this.getImportById(tenantId, importId);

    if (importRecord.status === 'POSTED') {
      throw new BadRequestException('Import already completed');
    }

    if (importRecord.status !== 'VALIDATED') {
      throw new BadRequestException('Import must be validated before completion');
    }

    // Post the import
    const completed = await this.prisma.openingBalanceImport.update({
      where: { id: importId },
      data: {
        status: 'POSTED',
        processedAt: new Date(),
        processedById: userId,
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'OpeningBalanceImport',
      entityId: importId,
      beforeValue: { status: 'VALIDATED' },
      afterValue: {
        status: 'POSTED',
        processedAt: completed.processedAt?.toISOString(),
        totalDebits: importRecord.totalDebits,
        totalCredits: importRecord.totalCredits,
      },
    });

    return completed;
  }

  /**
   * Cancel an import
   */
  async cancelImport(
    tenantId: string,
    userId: string,
    importId: string,
  ): Promise<OpeningBalanceImport> {
    const importRecord = await this.getImportById(tenantId, importId);

    if (importRecord.status === 'POSTED') {
      throw new BadRequestException('Cannot cancel completed import');
    }

    // Delete associated balances
    await this.prisma.openingBalance.deleteMany({
      where: { importId },
    });

    // Delete the import
    await this.prisma.openingBalanceImport.delete({
      where: { id: importId },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'OpeningBalanceImport',
      entityId: importId,
      beforeValue: { status: importRecord.status },
      afterValue: { status: 'CANCELLED', reason: 'User cancelled' },
    });

    return { ...importRecord, status: 'DRAFT' as OpeningBalanceImportStatus };
  }

  /**
   * Get opening balance for a specific account as of a date
   */
  async getOpeningBalanceForAccount(
    tenantId: string,
    accountCode: string,
    asOfDate: Date,
  ): Promise<number> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) return 0;

    const balance = await this.prisma.openingBalance.findFirst({
      where: {
        tenantId,
        accountId: account.id,
        asOfDate: { lte: asOfDate },
        isVerified: true,
      },
      orderBy: { asOfDate: 'desc' },
    });

    if (!balance) return 0;

    // Return net balance based on account normal balance direction
    // Debit-normal accounts: Assets, Expenses (positive = debit balance)
    // Credit-normal accounts: Liabilities, Equity, Revenue (positive = credit balance)
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
    const debitAmount = balance.debitCents || 0;
    const creditAmount = balance.creditCents || 0;

    if (isDebitNormal) {
      return debitAmount - creditAmount;
    } else {
      return creditAmount - debitAmount;
    }
  }

  /**
   * Get wizard step data
   */
  async getWizardStep(
    tenantId: string,
    importId: string,
    stepNumber: number,
  ): Promise<WizardStepResponse> {
    const importRecord = await this.getImportById(tenantId, importId);
    const stepConfig = WIZARD_STEPS.find((s) => s.step === stepNumber);

    if (!stepConfig) {
      throw new BadRequestException(`Invalid wizard step: ${stepNumber}`);
    }

    // Get accounts for this step
    let accounts: ChartOfAccount[] = [];

    if (stepConfig.accountCodes && stepConfig.accountCodes.length > 0) {
      accounts = await this.prisma.chartOfAccount.findMany({
        where: {
          tenantId,
          code: { in: stepConfig.accountCodes },
          isActive: true,
        },
        orderBy: { code: 'asc' },
      });
    } else if (stepConfig.accountTypes && stepConfig.accountTypes.length > 0) {
      accounts = await this.prisma.chartOfAccount.findMany({
        where: {
          tenantId,
          type: { in: stepConfig.accountTypes as any },
          isActive: true,
        },
        orderBy: { code: 'asc' },
      });
    }

    // Get current balances for these accounts
    const balances = await this.prisma.openingBalance.findMany({
      where: {
        tenantId,
        importId,
        accountId: { in: accounts.map((a) => a.id) },
      },
    });

    const balanceMap = new Map(balances.map((b) => [b.accountId, b]));

    const accountsWithBalances = accounts.map((account) => {
      const balance = balanceMap.get(account.id);
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        currentDebitCents: balance?.debitCents || null,
        currentCreditCents: balance?.creditCents || null,
      };
    });

    // Check if step is complete (all accounts have balances)
    const isComplete =
      accounts.length === 0 ||
      accounts.every((a) => balanceMap.has(a.id));

    return {
      step: stepNumber,
      title: stepConfig.title,
      description: stepConfig.description,
      accounts: accountsWithBalances,
      isComplete,
    };
  }

  /**
   * Get all wizard steps with completion status
   */
  async getWizardProgress(
    tenantId: string,
    importId: string,
  ): Promise<{ steps: WizardStepResponse[]; currentStep: number }> {
    const steps: WizardStepResponse[] = [];
    let currentStep = 1;

    for (let i = 1; i <= WIZARD_STEPS.length; i++) {
      const step = await this.getWizardStep(tenantId, importId, i);
      steps.push(step);

      if (!step.isComplete && currentStep === i) {
        currentStep = i;
      } else if (step.isComplete && i === currentStep) {
        currentStep = i + 1;
      }
    }

    return { steps, currentStep: Math.min(currentStep, WIZARD_STEPS.length) };
  }

  /**
   * List all imports for a tenant
   */
  async listImports(
    tenantId: string,
    options?: {
      status?: OpeningBalanceImportStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ imports: OpeningBalanceImport[]; total: number }> {
    const where = {
      tenantId,
      ...(options?.status && { status: options.status }),
    };

    const [imports, total] = await Promise.all([
      this.prisma.openingBalanceImport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      this.prisma.openingBalanceImport.count({ where }),
    ]);

    return { imports, total };
  }
}
