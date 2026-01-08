/**
 * Xero Payroll Journal Service
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * Posts payroll to Xero as manual journal entries since
 * Xero does not have a native Payroll API for South Africa.
 *
 * Key considerations:
 * - NO native Payroll API for South Africa - use Manual Journals API
 * - OAuth 2.0 tokens with 30-min expiry
 * - Rate limits: 60/min, 5000/day
 * - Journal must balance (debits = credits)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  XeroAccountType,
  PayrollJournalStatus,
  PayrollStatus,
  XeroAccountMapping,
} from '@prisma/client';
import { XeroClient, ManualJournal, LineAmountTypes } from 'xero-node';
import { PrismaService } from '../prisma/prisma.service';
import {
  XeroPayrollJournalRepository,
  PayrollJournalWithLines,
  PayrollJournalWithRelations,
} from '../repositories/xero-payroll-journal.repository';
import { XeroSyncService } from './xero-sync.service';
import { AuditLogService } from './audit-log.service';
import {
  XeroManualJournal,
  XeroJournalLine,
} from '../entities/xero-payroll-journal.entity';
import {
  JournalPreviewResponse,
  JournalPreviewLine,
  BulkPostResult,
  JournalPostResult,
  JournalFilterDto,
  JournalStats,
} from '../dto/xero-payroll-journal.dto';
import {
  NotFoundException,
  ValidationException,
  ConflictException,
  BusinessException,
  ExternalServiceException,
} from '../../shared/exceptions';
import { AuditAction } from '../entities/audit-log.entity';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import { RateLimiter } from '../../mcp/xero-mcp/utils/rate-limiter';

// Required account types for basic payroll journal
const REQUIRED_ACCOUNT_TYPES: XeroAccountType[] = [
  'SALARY_EXPENSE',
  'PAYE_PAYABLE',
  'UIF_PAYABLE',
  'NET_PAY_CLEARING',
];

// Payroll data interface (matches Prisma Payroll with Staff relation)
interface PayrollWithStaff {
  id: string;
  tenantId: string;
  staffId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  basicSalaryCents: number;
  overtimeCents: number;
  bonusCents: number;
  otherEarningsCents: number;
  grossSalaryCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  uifEmployerCents: number;
  otherDeductionsCents: number;
  netSalaryCents: number;
  medicalAidCreditCents: number;
  status: string;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// Journal line generation result
interface GeneratedJournalLine {
  accountType: XeroAccountType;
  xeroAccountCode: string;
  description: string;
  debitCents: number;
  creditCents: number;
}

@Injectable()
export class XeroPayrollJournalService {
  private readonly logger = new Logger(XeroPayrollJournalService.name);
  private readonly tokenManager: TokenManager;
  private readonly rateLimiter: RateLimiter;

  // Maximum retry attempts for rate-limited requests
  private readonly MAX_RATE_LIMIT_RETRIES = 3;
  private readonly RATE_LIMIT_BACKOFF_MS = 2000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalRepo: XeroPayrollJournalRepository,
    private readonly xeroSyncService: XeroSyncService,
    private readonly auditLogService: AuditLogService,
  ) {
    // Initialize TokenManager with PrismaService (extends PrismaClient)
    this.tokenManager = new TokenManager(this.prisma);
    // Rate limiter: 60 requests per minute as per Xero API limits
    this.rateLimiter = new RateLimiter(60, 60000);
  }

  /**
   * Create payroll journal entry (does NOT post to Xero)
   * Generates journal lines from payroll data and validates balance
   */
  async createPayrollJournal(
    payrollId: string,
    tenantId: string,
    userId?: string,
  ): Promise<PayrollJournalWithRelations> {
    this.logger.log(`Creating payroll journal for payroll ${payrollId}`);

    // Check if journal already exists
    const existing = await this.journalRepo.findJournalByPayrollId(payrollId);
    if (existing) {
      throw new ConflictException('Journal already exists for this payroll', {
        payrollId,
        existingJournalId: existing.id,
      });
    }

    // Get payroll data with staff info
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!payroll) {
      throw new NotFoundException('Payroll', payrollId);
    }

    // Verify payroll belongs to tenant
    if (payroll.tenantId !== tenantId) {
      throw new NotFoundException('Payroll', payrollId);
    }

    // Validate account mappings exist
    const { hasAll, missing } = await this.journalRepo.hasRequiredMappings(
      tenantId,
      REQUIRED_ACCOUNT_TYPES,
    );

    if (!hasAll) {
      throw new ValidationException('Missing required account mappings', [
        ...missing.map((type) => ({
          field: type,
          message: `${type} mapping is required for payroll journal creation`,
        })),
      ]);
    }

    // Get all mappings
    const mappings = await this.journalRepo.findMappingsByTenant(tenantId);

    // Generate journal lines
    const lines = this.generateJournalLines(
      payroll as PayrollWithStaff,
      mappings,
    );

    // Validate balanced
    const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);

    if (totalDebits !== totalCredits) {
      throw new ValidationException('Journal is not balanced', [
        {
          field: 'balance',
          message: `Debits (${totalDebits}) do not equal Credits (${totalCredits})`,
          value: { totalDebits, totalCredits },
        },
      ]);
    }

    // Create narration
    const periodMonth = payroll.payPeriodStart.toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });
    const narration = `Payroll for ${periodMonth} - ${payroll.staff.firstName} ${payroll.staff.lastName}`;

    // Create journal record with lines
    const journal = await this.journalRepo.createJournal(
      {
        tenant: { connect: { id: tenantId } },
        payroll: { connect: { id: payrollId } },
        payPeriodStart: payroll.payPeriodStart,
        payPeriodEnd: payroll.payPeriodEnd,
        status: PayrollJournalStatus.PENDING,
        totalDebitCents: totalDebits,
        totalCreditCents: totalCredits,
        narration,
      },
      lines.map((line, index) => ({
        accountType: line.accountType,
        xeroAccountCode: line.xeroAccountCode,
        description: line.description,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        sortOrder: index,
      })),
    );

    // Log audit trail
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'PayrollJournal',
      entityId: journal.id,
      afterValue: {
        payrollId,
        status: 'PENDING',
        totalDebitCents: totalDebits,
        totalCreditCents: totalCredits,
        lineCount: lines.length,
      },
    });

    this.logger.log(
      `Created journal ${journal.id} for payroll ${payrollId} with ${lines.length} lines`,
    );

    // Return with full relations
    const result = await this.journalRepo.findJournalByIdWithRelations(
      journal.id,
    );
    if (!result) {
      throw new NotFoundException('PayrollJournal', journal.id);
    }
    return result;
  }

  /**
   * Generate journal lines from payroll data
   * Uses SA Payroll structure: Salary Expense (DR), PAYE/UIF/Net Pay (CR)
   */
  private generateJournalLines(
    payroll: PayrollWithStaff,
    mappings: XeroAccountMapping[],
  ): GeneratedJournalLine[] {
    const getMapping = (
      type: XeroAccountType,
    ): XeroAccountMapping | undefined =>
      mappings.find((m) => m.accountType === type);

    const lines: GeneratedJournalLine[] = [];

    // DEBITS (Expenses)
    // Salaries & Wages Expense (gross salary)
    const salaryMapping = getMapping('SALARY_EXPENSE');
    if (salaryMapping && payroll.grossSalaryCents > 0) {
      lines.push({
        accountType: 'SALARY_EXPENSE',
        xeroAccountCode: salaryMapping.xeroAccountCode,
        description: 'Salaries & Wages',
        debitCents: payroll.grossSalaryCents,
        creditCents: 0,
      });
    }

    // UIF Employer Expense (employer contribution)
    const uifExpenseMapping = getMapping('UIF_EMPLOYER_EXPENSE');
    if (uifExpenseMapping && payroll.uifEmployerCents > 0) {
      lines.push({
        accountType: 'UIF_EMPLOYER_EXPENSE',
        xeroAccountCode: uifExpenseMapping.xeroAccountCode,
        description: 'UIF Employer Contribution',
        debitCents: payroll.uifEmployerCents,
        creditCents: 0,
      });
    }

    // Bonus Expense (if applicable)
    const bonusMapping = getMapping('BONUS_EXPENSE');
    if (bonusMapping && payroll.bonusCents > 0) {
      lines.push({
        accountType: 'BONUS_EXPENSE',
        xeroAccountCode: bonusMapping.xeroAccountCode,
        description: 'Bonus',
        debitCents: payroll.bonusCents,
        creditCents: 0,
      });
    }

    // Overtime Expense (if applicable)
    const overtimeMapping = getMapping('OVERTIME_EXPENSE');
    if (overtimeMapping && payroll.overtimeCents > 0) {
      lines.push({
        accountType: 'OVERTIME_EXPENSE',
        xeroAccountCode: overtimeMapping.xeroAccountCode,
        description: 'Overtime',
        debitCents: payroll.overtimeCents,
        creditCents: 0,
      });
    }

    // CREDITS (Liabilities)
    // PAYE Payable
    const payeMapping = getMapping('PAYE_PAYABLE');
    if (payeMapping && payroll.payeCents > 0) {
      lines.push({
        accountType: 'PAYE_PAYABLE',
        xeroAccountCode: payeMapping.xeroAccountCode,
        description: 'PAYE Payable',
        debitCents: 0,
        creditCents: payroll.payeCents,
      });
    }

    // UIF Payable (employee + employer contributions)
    const uifPayableMapping = getMapping('UIF_PAYABLE');
    const totalUif = payroll.uifEmployeeCents + payroll.uifEmployerCents;
    if (uifPayableMapping && totalUif > 0) {
      lines.push({
        accountType: 'UIF_PAYABLE',
        xeroAccountCode: uifPayableMapping.xeroAccountCode,
        description: 'UIF Payable',
        debitCents: 0,
        creditCents: totalUif,
      });
    }

    // Other Deductions (if applicable)
    const otherDeductionMapping = getMapping('OTHER_DEDUCTION');
    if (otherDeductionMapping && payroll.otherDeductionsCents > 0) {
      lines.push({
        accountType: 'OTHER_DEDUCTION',
        xeroAccountCode: otherDeductionMapping.xeroAccountCode,
        description: 'Other Deductions',
        debitCents: 0,
        creditCents: payroll.otherDeductionsCents,
      });
    }

    // Net Pay Clearing (amount payable to employee)
    const netPayMapping = getMapping('NET_PAY_CLEARING');
    if (netPayMapping && payroll.netSalaryCents > 0) {
      lines.push({
        accountType: 'NET_PAY_CLEARING',
        xeroAccountCode: netPayMapping.xeroAccountCode,
        description: 'Net Pay Clearing',
        debitCents: 0,
        creditCents: payroll.netSalaryCents,
      });
    }

    return lines;
  }

  /**
   * Generate journals for all payrolls in a period
   * Creates journals for payrolls that don't already have one
   */
  async generateJournalsForPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    userId?: string,
  ): Promise<{
    created: PayrollJournalWithRelations[];
    skipped: { payrollId: string; reason: string }[];
  }> {
    this.logger.log(
      `Generating journals for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate account mappings exist
    const { hasAll, missing } = await this.journalRepo.hasRequiredMappings(
      tenantId,
      REQUIRED_ACCOUNT_TYPES,
    );

    if (!hasAll) {
      throw new ValidationException('Missing required account mappings', [
        ...missing.map((type) => ({
          field: type,
          message: `${type} mapping is required for payroll journal creation`,
        })),
      ]);
    }

    // Find payrolls in the period (PAID or APPROVED status)
    const payrolls = await this.prisma.payroll.findMany({
      where: {
        tenantId,
        payPeriodStart: { gte: periodStart },
        payPeriodEnd: { lte: periodEnd },
        status: { in: [PayrollStatus.PAID, PayrollStatus.APPROVED] },
      },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (payrolls.length === 0) {
      this.logger.log('No processed payrolls found for period');
      return { created: [], skipped: [] };
    }

    this.logger.log(`Found ${payrolls.length} payrolls for period`);

    const created: PayrollJournalWithRelations[] = [];
    const skipped: { payrollId: string; reason: string }[] = [];

    for (const payroll of payrolls) {
      // Check if journal already exists
      const existing = await this.journalRepo.findJournalByPayrollId(payroll.id);
      if (existing) {
        skipped.push({
          payrollId: payroll.id,
          reason: `Journal already exists: ${existing.id}`,
        });
        continue;
      }

      try {
        const journal = await this.createPayrollJournal(
          payroll.id,
          tenantId,
          userId,
        );
        created.push(journal);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        skipped.push({
          payrollId: payroll.id,
          reason: message,
        });
        this.logger.warn(
          `Failed to create journal for payroll ${payroll.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Generated ${created.length} journals, skipped ${skipped.length}`,
    );

    return { created, skipped };
  }

  /**
   * Get journal preview before creation
   * Shows what the journal will look like without actually creating it
   */
  async previewJournal(
    payrollId: string,
    tenantId: string,
  ): Promise<JournalPreviewResponse> {
    // Get payroll data
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!payroll || payroll.tenantId !== tenantId) {
      throw new NotFoundException('Payroll', payrollId);
    }

    // Get mappings
    const mappings = await this.journalRepo.findMappingsByTenant(tenantId);
    const mappingsByType = new Map(mappings.map((m) => [m.accountType, m]));

    // Generate lines
    const rawLines = this.generateJournalLines(
      payroll as PayrollWithStaff,
      mappings,
    );

    // Convert to preview format with account names
    const previewLines: JournalPreviewLine[] = rawLines.map((line) => {
      const mapping = mappingsByType.get(line.accountType);
      return {
        accountType: line.accountType,
        accountCode: line.xeroAccountCode,
        accountName: mapping?.xeroAccountName || 'Unknown Account',
        description: line.description,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
      };
    });

    const totalDebits = previewLines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = previewLines.reduce(
      (sum, l) => sum + l.creditCents,
      0,
    );

    const periodMonth = payroll.payPeriodStart.toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });

    return {
      payrollId,
      staffName: `${payroll.staff.firstName} ${payroll.staff.lastName}`,
      payPeriodStart: payroll.payPeriodStart,
      payPeriodEnd: payroll.payPeriodEnd,
      narration: `Payroll for ${periodMonth} - ${payroll.staff.firstName} ${payroll.staff.lastName}`,
      lines: previewLines,
      totalDebitCents: totalDebits,
      totalCreditCents: totalCredits,
      isBalanced: totalDebits === totalCredits,
    };
  }

  /**
   * Post journal to Xero
   * Sends the journal entry to Xero Manual Journals API
   */
  async postToXero(
    journalId: string,
    tenantId: string,
    userId?: string,
  ): Promise<PayrollJournalWithRelations> {
    this.logger.log(`Posting journal ${journalId} to Xero`);

    const journal =
      await this.journalRepo.findJournalByIdWithRelations(journalId);
    if (!journal) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.tenantId !== tenantId) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.status === PayrollJournalStatus.POSTED) {
      throw new ConflictException('Journal already posted to Xero', {
        journalId,
        xeroJournalId: journal.xeroJournalId,
      });
    }

    if (journal.status === PayrollJournalStatus.CANCELLED) {
      throw new ValidationException('Cannot post cancelled journal', [
        {
          field: 'status',
          message: 'Journal has been cancelled',
          value: journal.status,
        },
      ]);
    }

    // Check Xero connection
    const hasConnection =
      await this.xeroSyncService.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    try {
      // Build Xero journal object
      const xeroJournal: XeroManualJournal = {
        narration: journal.narration,
        date: journal.payPeriodEnd.toISOString().split('T')[0],
        status: 'POSTED',
        journalLines: journal.journalLines.map(
          (line): XeroJournalLine => ({
            // Xero expects positive for debits, negative for credits
            lineAmount: (line.debitCents - line.creditCents) / 100,
            accountCode: line.xeroAccountCode,
            description: line.description,
          }),
        ),
      };

      // Post to Xero
      const xeroResponse = await this.postManualJournalToXero(
        tenantId,
        xeroJournal,
      );

      // Update journal with Xero response
      await this.journalRepo.markAsPosted(
        journalId,
        xeroResponse.manualJournalId,
        xeroResponse.journalNumber,
      );

      // Log audit trail
      await this.auditLogService.logUpdate({
        tenantId,
        userId,
        entityType: 'PayrollJournal',
        entityId: journalId,
        beforeValue: { status: journal.status },
        afterValue: {
          status: 'POSTED',
          xeroJournalId: xeroResponse.manualJournalId,
          journalNumber: xeroResponse.journalNumber,
          postedAt: new Date().toISOString(),
        },
        changeSummary: `Posted to Xero: ${xeroResponse.journalNumber || xeroResponse.manualJournalId}`,
      });

      this.logger.log(
        `Posted journal ${journalId} to Xero: ${xeroResponse.manualJournalId}`,
      );

      // Return updated journal
      const result =
        await this.journalRepo.findJournalByIdWithRelations(journalId);
      if (!result) {
        throw new NotFoundException('PayrollJournal', journalId);
      }
      return result;
    } catch (error) {
      // Mark as failed if not already an expected exception
      if (
        !(error instanceof NotFoundException) &&
        !(error instanceof ValidationException) &&
        !(error instanceof ConflictException) &&
        !(error instanceof BusinessException)
      ) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        await this.journalRepo.markAsFailed(journalId, errorMessage);

        // Log failure
        await this.auditLogService.logUpdate({
          tenantId,
          userId,
          entityType: 'PayrollJournal',
          entityId: journalId,
          beforeValue: { status: journal.status },
          afterValue: {
            status: 'FAILED',
            errorMessage,
            retryCount: journal.retryCount + 1,
          },
          changeSummary: `Xero post failed: ${errorMessage}`,
        });

        throw new ExternalServiceException(
          'Xero',
          errorMessage,
          error as Error,
        );
      }
      throw error;
    }
  }

  /**
   * Post manual journal to Xero API
   * Uses xero-node SDK with rate limiting and retry logic
   */
  private async postManualJournalToXero(
    tenantId: string,
    journal: XeroManualJournal,
  ): Promise<{ manualJournalId: string; journalNumber: string }> {
    this.logger.log(`Posting manual journal to Xero for tenant ${tenantId}`);
    this.logger.debug(`Journal payload: ${JSON.stringify(journal)}`);

    // Get authenticated Xero client
    const { client, xeroTenantId } =
      await this.getAuthenticatedXeroClient(tenantId);

    // Apply rate limiting with retry
    let attempt = 0;
    while (attempt < this.MAX_RATE_LIMIT_RETRIES) {
      try {
        // Wait for rate limit slot
        await this.rateLimiter.acquire();

        // Build Xero ManualJournal request
        // Note: Xero expects credits as negative amounts in lineAmount
        const manualJournal: ManualJournal = {
          narration: journal.narration,
          date: journal.date,
          status: ManualJournal.StatusEnum.POSTED,
          lineAmountTypes: LineAmountTypes.NoTax,
          journalLines: journal.journalLines.map((line) => ({
            lineAmount: line.lineAmount, // Already calculated as debit - credit
            accountCode: line.accountCode,
            description: line.description,
          })),
        };

        // Post to Xero Manual Journals API
        const response = await client.accountingApi.createManualJournals(
          xeroTenantId,
          { manualJournals: [manualJournal] },
        );

        const createdJournal = response.body.manualJournals?.[0];
        if (!createdJournal?.manualJournalID) {
          throw new Error('Xero API returned no journal ID');
        }

        this.logger.log(
          `Successfully posted manual journal to Xero: ${createdJournal.manualJournalID}`,
        );

        // Xero returns manualJournalID as the unique identifier
        // The journal number is typically the manualJournalID short form
        return {
          manualJournalId: createdJournal.manualJournalID,
          journalNumber: createdJournal.manualJournalID
            .substring(0, 8)
            .toUpperCase(),
        };
      } catch (error) {
        attempt++;

        // Log the full error for debugging
        this.logger.error('Xero API call failed', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          response: (error as { response?: { body?: unknown } })?.response?.body,
        });

        // Check for rate limit error (429)
        if (this.isRateLimitError(error)) {
          this.logger.warn(
            `Rate limit hit, attempt ${attempt}/${this.MAX_RATE_LIMIT_RETRIES}`,
          );
          if (attempt < this.MAX_RATE_LIMIT_RETRIES) {
            // Exponential backoff
            const backoffMs = this.RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt);
            await this.sleep(backoffMs);
            continue;
          }
        }

        // Check for validation errors from Xero
        if (this.isXeroValidationError(error)) {
          const errorDetails = this.extractXeroErrorDetails(error);
          throw new ValidationException('Xero validation failed', [
            {
              field: 'journal',
              message: errorDetails.message,
              value: errorDetails.details,
            },
          ]);
        }

        // Re-throw other errors with better context
        const errorMessage = this.extractXeroErrorMessage(error);
        throw new Error(`Xero API error: ${errorMessage}`);
      }
    }

    // Max retries exceeded
    throw new ExternalServiceException(
      'Xero',
      `Rate limit exceeded after ${this.MAX_RATE_LIMIT_RETRIES} attempts`,
    );
  }

  /**
   * Get authenticated XeroClient for a tenant
   */
  private async getAuthenticatedXeroClient(tenantId: string): Promise<{
    client: XeroClient;
    xeroTenantId: string;
  }> {
    // Check connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    // Get access token
    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    // Create client
    const client = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
      redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
      scopes: [
        'openid',
        'profile',
        'email',
        'accounting.transactions',
        'accounting.settings',
      ],
    });

    // Initialize the client (required before making API calls)
    await client.initialize();

    client.setTokenSet({
      access_token: accessToken,
      token_type: 'Bearer',
    });

    return { client, xeroTenantId };
  }

  /**
   * Check if error is a rate limit (429) error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const statusCode =
        (error as { response?: { status?: number } }).response?.status ??
        (error as { statusCode?: number }).statusCode;
      return statusCode === 429;
    }
    return false;
  }

  /**
   * Check if error is a Xero validation error (400)
   */
  private isXeroValidationError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const statusCode =
        (error as { response?: { status?: number } }).response?.status ??
        (error as { statusCode?: number }).statusCode;
      return statusCode === 400;
    }
    return false;
  }

  /**
   * Extract error details from Xero API error
   */
  private extractXeroErrorDetails(error: unknown): {
    message: string;
    details: unknown;
  } {
    if (error && typeof error === 'object') {
      const body = (error as { response?: { body?: unknown } }).response?.body;
      if (body && typeof body === 'object') {
        const errorBody = body as { Message?: string; Elements?: unknown[] };
        return {
          message: errorBody.Message ?? 'Xero validation error',
          details: errorBody.Elements ?? body,
        };
      }
    }
    return {
      message: error instanceof Error ? error.message : 'Unknown Xero error',
      details: null,
    };
  }

  /**
   * Extract human-readable error message from Xero API error
   */
  private extractXeroErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // Check for response body errors
      const responseBody = (error as { response?: { body?: unknown } })?.response?.body;
      if (responseBody && typeof responseBody === 'object') {
        const body = responseBody as {
          Message?: string;
          ErrorNumber?: number;
          Type?: string;
          Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
        };

        // Check for validation errors in Elements
        if (body.Elements?.[0]?.ValidationErrors?.[0]?.Message) {
          return body.Elements[0].ValidationErrors[0].Message;
        }

        if (body.Message) {
          return body.Message;
        }

        if (body.Type) {
          return `${body.Type}: ${body.ErrorNumber ?? 'Unknown'}`;
        }
      }

      return error.message;
    }

    return String(error);
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry posting a failed journal
   */
  async retryPosting(
    journalId: string,
    tenantId: string,
    userId?: string,
  ): Promise<PayrollJournalWithRelations> {
    const journal = await this.journalRepo.findJournalById(journalId);
    if (!journal) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.tenantId !== tenantId) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.status !== PayrollJournalStatus.FAILED) {
      throw new ValidationException('Only failed journals can be retried', [
        {
          field: 'status',
          message: `Current status is ${journal.status}`,
          value: journal.status,
        },
      ]);
    }

    // Reset to pending
    await this.journalRepo.resetForRetry(journalId);

    this.logger.log(`Retrying journal ${journalId}`);

    // Attempt to post again
    return this.postToXero(journalId, tenantId, userId);
  }

  /**
   * Cancel a pending or failed journal
   */
  async cancelJournal(
    journalId: string,
    tenantId: string,
    reason: string,
    userId?: string,
  ): Promise<void> {
    const journal = await this.journalRepo.findJournalById(journalId);
    if (!journal) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.tenantId !== tenantId) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.status === PayrollJournalStatus.POSTED) {
      throw new ValidationException('Cannot cancel posted journal', [
        {
          field: 'status',
          message:
            'Journal already posted to Xero - must void in Xero directly',
          value: journal.status,
        },
      ]);
    }

    await this.journalRepo.cancelJournal(journalId, reason);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'PayrollJournal',
      entityId: journalId,
      beforeValue: { status: journal.status },
      afterValue: { status: 'CANCELLED', reason },
      changeSummary: `Cancelled: ${reason}`,
    });

    this.logger.log(`Cancelled journal ${journalId}: ${reason}`);
  }

  /**
   * Bulk post multiple journals to Xero
   */
  async bulkPostToXero(
    journalIds: string[],
    tenantId: string,
    userId?: string,
  ): Promise<BulkPostResult> {
    const results: JournalPostResult[] = [];

    this.logger.log(`Bulk posting ${journalIds.length} journals to Xero`);

    for (const journalId of journalIds) {
      try {
        const journal = await this.postToXero(journalId, tenantId, userId);
        results.push({
          journalId,
          payrollId: journal.payrollId,
          status: PayrollJournalStatus.POSTED,
          xeroJournalId: journal.xeroJournalId || undefined,
          journalNumber: journal.journalNumber || undefined,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Get payrollId for the result
        const journal = await this.journalRepo.findJournalById(journalId);
        results.push({
          journalId,
          payrollId: journal?.payrollId || 'unknown',
          status: PayrollJournalStatus.FAILED,
          errorMessage,
        });

        this.logger.warn(
          `Failed to post journal ${journalId}: ${errorMessage}`,
        );
      }
    }

    const posted = results.filter(
      (r) => r.status === PayrollJournalStatus.POSTED,
    ).length;
    const failed = results.filter(
      (r) => r.status === PayrollJournalStatus.FAILED,
    ).length;

    this.logger.log(`Bulk post complete: ${posted} posted, ${failed} failed`);

    return {
      total: journalIds.length,
      posted,
      failed,
      results,
    };
  }

  /**
   * Get journals for a tenant with optional filters
   */
  async getJournals(
    tenantId: string,
    filter?: JournalFilterDto,
  ): Promise<PayrollJournalWithRelations[]> {
    return this.journalRepo.findJournalsByTenant(tenantId, filter);
  }

  /**
   * Get a single journal by ID
   */
  async getJournal(
    journalId: string,
    tenantId: string,
  ): Promise<PayrollJournalWithRelations> {
    const journal =
      await this.journalRepo.findJournalByIdWithRelations(journalId);
    if (!journal || journal.tenantId !== tenantId) {
      throw new NotFoundException('PayrollJournal', journalId);
    }
    return journal;
  }

  /**
   * Get pending journals ready for posting
   */
  async getPendingJournals(
    tenantId: string,
  ): Promise<PayrollJournalWithLines[]> {
    return this.journalRepo.findPendingJournals(tenantId);
  }

  /**
   * Get failed journals that may need retry
   */
  async getFailedJournals(
    tenantId: string,
    maxRetries?: number,
  ): Promise<PayrollJournalWithLines[]> {
    return this.journalRepo.findFailedJournals(tenantId, maxRetries);
  }

  /**
   * Get journal statistics for a tenant
   */
  async getJournalStats(tenantId: string): Promise<JournalStats> {
    return this.journalRepo.getJournalStats(tenantId);
  }

  /**
   * Delete a journal (only if not posted)
   */
  async deleteJournal(
    journalId: string,
    tenantId: string,
    userId?: string,
  ): Promise<void> {
    const journal = await this.journalRepo.findJournalById(journalId);
    if (!journal || journal.tenantId !== tenantId) {
      throw new NotFoundException('PayrollJournal', journalId);
    }

    if (journal.status === PayrollJournalStatus.POSTED) {
      throw new ValidationException('Cannot delete posted journal', [
        {
          field: 'status',
          message: 'Journal already posted to Xero',
          value: journal.status,
        },
      ]);
    }

    await this.journalRepo.deleteJournal(journalId);

    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'PayrollJournal',
      entityId: journalId,
      action: AuditAction.DELETE,
      beforeValue: { payrollId: journal.payrollId, status: journal.status },
      changeSummary: 'Deleted payroll journal',
    });

    this.logger.log(`Deleted journal ${journalId}`);
  }
}
