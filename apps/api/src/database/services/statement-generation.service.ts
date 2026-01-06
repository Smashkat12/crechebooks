/**
 * Statement Generation Service
 * TASK-STMT-003: Statement Generation Service (Logic Layer)
 *
 * @module database/services/statement-generation
 * @description Service for generating account statements for parents.
 * Provides single and bulk statement generation with proper running balance calculations.
 *
 * CRITICAL: All monetary values are in CENTS as integers. Uses Decimal.js for calculations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Statement, StatementLine } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  StatementRepository,
  CreateStatementLineDto,
} from '../repositories/statement.repository';
import { ParentRepository } from '../repositories/parent.repository';
import {
  ParentAccountService,
  AccountTransaction,
} from './parent-account.service';
import { AuditLogService } from './audit-log.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Input for generating a single statement
 */
export interface GenerateStatementInput {
  tenantId: string;
  parentId: string;
  periodStart: Date;
  periodEnd: Date;
  userId: string;
}

/**
 * Input for bulk statement generation
 */
export interface BulkGenerateInput {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  userId: string;
  parentIds?: string[]; // Optional: specific parents only
  onlyWithActivity?: boolean; // Skip parents with no transactions
  onlyWithBalance?: boolean; // Skip parents with zero balance
}

/**
 * Result of bulk statement generation
 */
export interface BulkGenerateResult {
  generated: number;
  skipped: number;
  errors: { parentId: string; error: string }[];
  statementIds: string[];
}

/**
 * Internal type for statement line data before persistence
 */
interface StatementLineData {
  date: Date;
  description: string;
  lineType:
    | 'OPENING_BALANCE'
    | 'INVOICE'
    | 'PAYMENT'
    | 'CREDIT_NOTE'
    | 'ADJUSTMENT'
    | 'CLOSING_BALANCE';
  referenceNumber?: string;
  referenceId?: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
  sortOrder: number;
}

/**
 * Statement with lines included
 */
export type StatementWithLines = Statement & { lines: StatementLine[] };

@Injectable()
export class StatementGenerationService {
  private readonly logger = new Logger(StatementGenerationService.name);

  constructor(
    private readonly statementRepo: StatementRepository,
    private readonly parentAccountService: ParentAccountService,
    private readonly parentRepo: ParentRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Generate a statement for a single parent
   *
   * @param input - Statement generation parameters
   * @returns Generated statement with lines
   * @throws NotFoundException if parent not found
   * @throws BusinessException for validation errors
   */
  async generateStatement(
    input: GenerateStatementInput,
  ): Promise<StatementWithLines> {
    const { tenantId, parentId, periodStart, periodEnd, userId } = input;

    this.logger.log(
      `Generating statement for parent ${parentId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // 1. Validate parent exists and belongs to tenant
    const parent = await this.parentRepo.findById(parentId);
    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    if (parent.tenantId !== tenantId) {
      throw new BusinessException(
        'Parent does not belong to the specified tenant',
        'TENANT_MISMATCH',
        { parentTenantId: parent.tenantId, requestTenantId: tenantId },
      );
    }

    // 2. Validate period
    if (periodStart >= periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      );
    }

    // 3. Get opening balance at periodStart
    const openingBalanceCents =
      await this.parentAccountService.calculateOpeningBalance(
        tenantId,
        parentId,
        periodStart,
      );

    // 4. Get all transactions in period
    const transactions =
      await this.parentAccountService.getTransactionsForPeriod(
        tenantId,
        parentId,
        periodStart,
        periodEnd,
      );

    // 5. Build statement lines with running balance
    const lineData = this.buildStatementLines(
      openingBalanceCents,
      transactions,
      periodStart,
      periodEnd,
    );

    // 6. Calculate totals from lines
    const {
      totalChargesCents,
      totalPaymentsCents,
      totalCreditsCents,
      closingBalanceCents,
    } = this.calculateTotals(lineData);

    // 7. Generate statement number
    const statementNumber =
      await this.statementRepo.generateStatementNumber(tenantId);

    // 8. Create statement record
    const statement = await this.statementRepo.create({
      tenantId,
      parentId,
      statementNumber,
      periodStart,
      periodEnd,
      openingBalanceCents,
      totalChargesCents,
      totalPaymentsCents,
      totalCreditsCents,
      closingBalanceCents,
      status: 'DRAFT',
    });

    // 9. Create statement lines
    const lineDtos: CreateStatementLineDto[] = lineData.map((line) => ({
      statementId: statement.id,
      date: line.date,
      description: line.description,
      lineType: line.lineType,
      referenceNumber: line.referenceNumber,
      referenceId: line.referenceId,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      balanceCents: line.balanceCents,
      sortOrder: line.sortOrder,
    }));

    const lines = await this.statementRepo.createLines(lineDtos);

    // 10. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Statement',
      entityId: statement.id,
      afterValue: {
        statementNumber,
        parentId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        openingBalanceCents,
        closingBalanceCents,
        lineCount: lines.length,
      },
    });

    this.logger.log(
      `Generated statement ${statementNumber} for parent ${parentId} with ${lines.length} lines`,
    );

    return { ...statement, lines };
  }

  /**
   * Bulk generate statements for multiple parents
   *
   * @param input - Bulk generation parameters
   * @returns Result with counts and any errors
   */
  async bulkGenerateStatements(
    input: BulkGenerateInput,
  ): Promise<BulkGenerateResult> {
    const {
      tenantId,
      periodStart,
      periodEnd,
      userId,
      parentIds,
      onlyWithActivity = false,
      onlyWithBalance = false,
    } = input;

    this.logger.log(
      `Starting bulk statement generation for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // 1. Get list of parents to process
    let parentsToProcess: Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;

    if (parentIds && parentIds.length > 0) {
      // Specific parents requested
      const parents = await Promise.all(
        parentIds.map((id) => this.parentRepo.findById(id)),
      );

      parentsToProcess = parents
        .filter(
          (p): p is NonNullable<typeof p> =>
            p !== null && p.tenantId === tenantId,
        )
        .map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
        }));
    } else {
      // All active parents for tenant
      parentsToProcess = await this.parentRepo.findByTenant(tenantId, {
        isActive: true,
      });
    }

    const result: BulkGenerateResult = {
      generated: 0,
      skipped: 0,
      errors: [],
      statementIds: [],
    };

    // 2. Process each parent
    for (const parent of parentsToProcess) {
      try {
        // Check filtering conditions
        if (onlyWithBalance) {
          const balance =
            await this.parentAccountService.calculateClosingBalance(
              tenantId,
              parent.id,
              periodEnd,
            );
          if (balance === 0) {
            this.logger.debug(`Skipping parent ${parent.id}: zero balance`);
            result.skipped++;
            continue;
          }
        }

        if (onlyWithActivity) {
          const transactions =
            await this.parentAccountService.getTransactionsForPeriod(
              tenantId,
              parent.id,
              periodStart,
              periodEnd,
            );
          if (transactions.length === 0) {
            this.logger.debug(`Skipping parent ${parent.id}: no activity`);
            result.skipped++;
            continue;
          }
        }

        // Generate statement
        const statement = await this.generateStatement({
          tenantId,
          parentId: parent.id,
          periodStart,
          periodEnd,
          userId,
        });

        result.generated++;
        result.statementIds.push(statement.id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to generate statement for parent ${parent.id}: ${errorMessage}`,
        );
        result.errors.push({
          parentId: parent.id,
          error: errorMessage,
        });
      }
    }

    this.logger.log(
      `Bulk statement generation complete: ${result.generated} generated, ${result.skipped} skipped, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Build statement lines from transactions
   *
   * @param openingBalance - Opening balance in cents
   * @param transactions - Array of transactions in the period
   * @param periodStart - Statement period start date
   * @param periodEnd - Statement period end date
   * @returns Array of statement line data
   */
  private buildStatementLines(
    openingBalance: number,
    transactions: AccountTransaction[],
    periodStart: Date,
    periodEnd: Date,
  ): StatementLineData[] {
    const lines: StatementLineData[] = [];
    let runningBalance = new Decimal(openingBalance);
    let sortOrder = 0;

    // 1. First line: OPENING_BALANCE
    const openingIsDebit = openingBalance >= 0;
    lines.push({
      date: periodStart,
      description: 'Opening Balance',
      lineType: 'OPENING_BALANCE',
      debitCents: openingIsDebit ? openingBalance : 0,
      creditCents: openingIsDebit ? 0 : Math.abs(openingBalance),
      balanceCents: openingBalance,
      sortOrder: sortOrder++,
    });

    // 2. Middle lines: INVOICE (debit) / PAYMENT (credit) / CREDIT_NOTE (credit)
    for (const tx of transactions) {
      let lineType: StatementLineData['lineType'];
      let debitCents = 0;
      let creditCents = 0;

      switch (tx.type) {
        case 'INVOICE':
          lineType = 'INVOICE';
          debitCents = tx.debitCents;
          runningBalance = runningBalance.plus(tx.debitCents);
          break;

        case 'PAYMENT':
          lineType = 'PAYMENT';
          creditCents = tx.creditCents;
          runningBalance = runningBalance.minus(tx.creditCents);
          break;

        case 'CREDIT_NOTE':
          lineType = 'CREDIT_NOTE';
          creditCents = tx.creditCents;
          runningBalance = runningBalance.minus(tx.creditCents);
          break;

        case 'ADJUSTMENT':
          lineType = 'ADJUSTMENT';
          debitCents = tx.debitCents;
          creditCents = tx.creditCents;
          runningBalance = runningBalance
            .plus(tx.debitCents)
            .minus(tx.creditCents);
          break;

        default:
          // Should not happen, but handle gracefully
          this.logger.warn(`Unknown transaction type: ${tx.type}`);
          continue;
      }

      lines.push({
        date: tx.date,
        description: tx.description,
        lineType,
        referenceNumber: tx.referenceNumber,
        referenceId: tx.id,
        debitCents,
        creditCents,
        balanceCents: runningBalance.toNumber(),
        sortOrder: sortOrder++,
      });
    }

    // 3. Last line: CLOSING_BALANCE
    const closingBalance = runningBalance.toNumber();
    const closingIsDebit = closingBalance >= 0;
    lines.push({
      date: periodEnd,
      description: 'Closing Balance',
      lineType: 'CLOSING_BALANCE',
      debitCents: closingIsDebit ? closingBalance : 0,
      creditCents: closingIsDebit ? 0 : Math.abs(closingBalance),
      balanceCents: closingBalance,
      sortOrder: sortOrder,
    });

    return lines;
  }

  /**
   * Calculate totals from statement lines
   *
   * @param lines - Array of statement line data
   * @returns Object with calculated totals
   */
  private calculateTotals(lines: StatementLineData[]): {
    totalChargesCents: number;
    totalPaymentsCents: number;
    totalCreditsCents: number;
    closingBalanceCents: number;
  } {
    let totalCharges = new Decimal(0);
    let totalPayments = new Decimal(0);
    let totalCredits = new Decimal(0);
    let closingBalance = 0;

    for (const line of lines) {
      switch (line.lineType) {
        case 'INVOICE':
          totalCharges = totalCharges.plus(line.debitCents);
          break;
        case 'PAYMENT':
          totalPayments = totalPayments.plus(line.creditCents);
          break;
        case 'CREDIT_NOTE':
          totalCredits = totalCredits.plus(line.creditCents);
          break;
        case 'CLOSING_BALANCE':
          closingBalance = line.balanceCents;
          break;
      }
    }

    return {
      totalChargesCents: totalCharges.toNumber(),
      totalPaymentsCents: totalPayments.toNumber(),
      totalCreditsCents: totalCredits.toNumber(),
      closingBalanceCents: closingBalance,
    };
  }

  /**
   * Get statement by ID with lines
   *
   * @param tenantId - Tenant ID for isolation
   * @param statementId - Statement ID
   * @returns Statement with lines
   * @throws NotFoundException if statement not found
   */
  async getStatementWithLines(
    tenantId: string,
    statementId: string,
  ): Promise<StatementWithLines> {
    const statement = await this.statementRepo.findByIdWithLines(
      statementId,
      tenantId,
    );

    if (!statement) {
      throw new NotFoundException('Statement', statementId);
    }

    return statement;
  }

  /**
   * Regenerate a statement (delete lines and recreate)
   * Only allowed for DRAFT statements
   *
   * @param tenantId - Tenant ID
   * @param statementId - Statement ID to regenerate
   * @param userId - User performing the action
   * @returns Regenerated statement with lines
   * @throws NotFoundException if statement not found
   * @throws BusinessException if statement is not in DRAFT status
   */
  async regenerateStatement(
    tenantId: string,
    statementId: string,
    userId: string,
  ): Promise<StatementWithLines> {
    const existing = await this.statementRepo.findByIdWithLines(
      statementId,
      tenantId,
    );

    if (!existing) {
      throw new NotFoundException('Statement', statementId);
    }

    if (existing.status !== 'DRAFT') {
      throw new BusinessException(
        `Cannot regenerate statement with status '${existing.status}'. Only DRAFT statements can be regenerated.`,
        'STATEMENT_LOCKED',
        { statementId, currentStatus: existing.status },
      );
    }

    // Store old values for audit
    const beforeValue = {
      lineCount: existing.lines.length,
      openingBalanceCents: existing.openingBalanceCents,
      closingBalanceCents: existing.closingBalanceCents,
    };

    // Delete existing lines
    await this.statementRepo.deleteLines(statementId);

    // Regenerate lines using same period
    const openingBalanceCents =
      await this.parentAccountService.calculateOpeningBalance(
        tenantId,
        existing.parentId,
        existing.periodStart,
      );

    const transactions =
      await this.parentAccountService.getTransactionsForPeriod(
        tenantId,
        existing.parentId,
        existing.periodStart,
        existing.periodEnd,
      );

    const lineData = this.buildStatementLines(
      openingBalanceCents,
      transactions,
      existing.periodStart,
      existing.periodEnd,
    );

    const {
      totalChargesCents,
      totalPaymentsCents,
      totalCreditsCents,
      closingBalanceCents,
    } = this.calculateTotals(lineData);

    // Update statement totals
    await this.statementRepo.update(statementId, tenantId, {
      openingBalanceCents,
      totalChargesCents,
      totalPaymentsCents,
      totalCreditsCents,
      closingBalanceCents,
    });

    // Create new lines
    const lineDtos: CreateStatementLineDto[] = lineData.map((line) => ({
      statementId,
      date: line.date,
      description: line.description,
      lineType: line.lineType,
      referenceNumber: line.referenceNumber,
      referenceId: line.referenceId,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      balanceCents: line.balanceCents,
      sortOrder: line.sortOrder,
    }));

    const lines = await this.statementRepo.createLines(lineDtos);

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Statement',
      entityId: statementId,
      beforeValue,
      afterValue: {
        lineCount: lines.length,
        openingBalanceCents,
        closingBalanceCents,
      },
      changeSummary: 'Statement regenerated',
    });

    // Return updated statement with lines
    return this.getStatementWithLines(tenantId, statementId);
  }

  /**
   * Get statements for a parent
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Array of statements (without lines)
   */
  async getStatementsForParent(
    tenantId: string,
    parentId: string,
  ): Promise<Statement[]> {
    return this.statementRepo.findByParentId(parentId, tenantId);
  }

  /**
   * Finalize a statement (change status from DRAFT to FINAL)
   *
   * @param tenantId - Tenant ID
   * @param statementId - Statement ID
   * @param userId - User performing the action
   * @returns Finalized statement
   * @throws NotFoundException if statement not found
   * @throws BusinessException if statement is not in DRAFT status
   */
  async finalizeStatement(
    tenantId: string,
    statementId: string,
    userId: string,
  ): Promise<Statement> {
    const statement = await this.statementRepo.finalize(statementId, tenantId);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Statement',
      entityId: statementId,
      beforeValue: { status: 'DRAFT' },
      afterValue: { status: 'FINAL' },
      changeSummary: 'Statement finalized',
    });

    return statement;
  }
}
