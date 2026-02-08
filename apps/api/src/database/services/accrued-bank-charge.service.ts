/**
 * Accrued Bank Charge Service
 * TASK-RECON-036: Accrued Bank Charges
 *
 * Service for tracking bank fees shown on statements but charged in following period.
 * FNB shows fees next to transactions but charges them in the next billing cycle.
 *
 * Use case:
 * - Bank statement shows: ADT Cash Deposit R1,200.00 (NET credited)
 * - Xero transaction shows: R1,219.70 (GROSS deposited)
 * - Difference: R19.70 is the bank fee (shown but not yet charged)
 *
 * This service:
 * 1. Detects fee-adjusted matches during reconciliation
 * 2. Creates accrued bank charge records
 * 3. Tracks when actual fee charges appear in bank statements
 * 4. Matches accrued fees to actual charge transactions
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankFeeService, TransactionType } from './bank-fee.service';
import {
  CreateAccruedBankChargeDto,
  MatchAccruedChargeDto,
  UpdateAccruedChargeStatusDto,
  AccruedChargeFilterDto,
  AccruedBankChargeResponseDto,
  AccruedBankChargeStatusDto,
  FeeAdjustedMatchResultDto,
  AccruedChargeSummaryDto,
} from '../dto/accrued-bank-charge.dto';
import { AccruedBankChargeStatus } from '@prisma/client';

/**
 * Tolerance for fee matching (in cents)
 * Allows for small rounding differences
 */
const FEE_TOLERANCE_CENTS = 50; // R0.50 tolerance

/**
 * Minimum confidence threshold for fee-adjusted matches
 */
const MIN_FEE_MATCH_CONFIDENCE = 0.85;

@Injectable()
export class AccruedBankChargeService {
  private readonly logger = new Logger(AccruedBankChargeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankFeeService: BankFeeService,
  ) {}

  /**
   * Detect if a bank/Xero transaction pair represents a fee-adjusted match
   *
   * @param tenantId - Tenant ID
   * @param bankAmountCents - NET amount from bank statement
   * @param xeroAmountCents - GROSS amount from Xero
   * @param description - Transaction description
   * @param payeeName - Optional payee name
   * @param reference - Optional reference
   * @returns Fee-adjusted match result
   */
  async detectFeeAdjustedMatch(
    tenantId: string,
    bankAmountCents: number,
    xeroAmountCents: number,
    description: string,
    payeeName?: string | null,
    reference?: string | null,
  ): Promise<FeeAdjustedMatchResultDto> {
    // Calculate the difference
    const feeDifference = Math.abs(xeroAmountCents - bankAmountCents);

    // If amounts match exactly or Xero is less, not a fee-adjusted match
    if (feeDifference === 0 || xeroAmountCents <= bankAmountCents) {
      return {
        is_fee_adjusted_match: false,
        bank_amount_cents: bankAmountCents,
        xero_amount_cents: xeroAmountCents,
        fee_amount_cents: 0,
        fee_type: 'NONE',
        confidence: 0,
        explanation: 'Amounts match or Xero amount is less than bank amount',
      };
    }

    // Detect transaction type from description
    const transactionType = this.bankFeeService.detectTransactionType(
      description,
      payeeName,
      reference,
    );

    // Get expected fee for this transaction type
    const expectedFee = await this.bankFeeService.getTotalFeeForTransaction(
      tenantId,
      description,
      bankAmountCents,
      payeeName,
      reference,
    );

    // Check if the difference matches the expected fee (within tolerance)
    const feeMatchesExpected =
      Math.abs(feeDifference - expectedFee) <= FEE_TOLERANCE_CENTS;

    // Calculate confidence based on fee match
    let confidence = 0;
    let explanation = '';

    if (feeMatchesExpected && expectedFee > 0) {
      // High confidence: difference matches expected fee
      confidence = 0.95;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) matches expected ${transactionType} fee (R${(expectedFee / 100).toFixed(2)})`;
    } else if (
      feeDifference >= 100 &&
      feeDifference <= 5000 &&
      this.isFeeRelatedTransactionType(transactionType)
    ) {
      // Medium confidence: reasonable fee range for fee-attracting transactions
      confidence = 0.75;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) is within typical fee range for ${transactionType}`;
    } else if (feeDifference >= 100 && feeDifference <= 2000) {
      // Low confidence: could be a fee but not certain
      confidence = 0.5;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) could be a bank fee but no matching rule found`;
    } else {
      // Not likely a fee-adjusted match
      confidence = 0.1;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) does not match typical fee patterns`;
    }

    const isFeeAdjustedMatch = confidence >= MIN_FEE_MATCH_CONFIDENCE;

    return {
      is_fee_adjusted_match: isFeeAdjustedMatch,
      bank_amount_cents: bankAmountCents,
      xero_amount_cents: xeroAmountCents,
      fee_amount_cents: feeDifference,
      fee_type: this.mapTransactionTypeToFeeType(transactionType),
      expected_fee_cents: expectedFee > 0 ? expectedFee : undefined,
      confidence,
      explanation,
    };
  }

  /**
   * Create an accrued bank charge record
   */
  async createAccruedCharge(
    tenantId: string,
    dto: CreateAccruedBankChargeDto,
  ): Promise<AccruedBankChargeResponseDto> {
    this.logger.log(
      `Creating accrued bank charge for tenant ${tenantId}: ${dto.fee_type} - R${(dto.accrued_amount_cents / 100).toFixed(2)}`,
    );

    const charge = await this.prisma.accruedBankCharge.create({
      data: {
        tenantId,
        sourceTransactionId: dto.source_transaction_id,
        sourceDescription: dto.source_description,
        sourceDate: new Date(dto.source_date),
        sourceAmountCents: dto.source_amount_cents,
        accruedAmountCents: dto.accrued_amount_cents,
        feeType: dto.fee_type,
        feeDescription: dto.fee_description,
        status: AccruedBankChargeStatus.ACCRUED,
        bankStatementMatchId: dto.bank_statement_match_id,
        xeroTransactionId: dto.xero_transaction_id,
        xeroAmountCents: dto.xero_amount_cents,
        notes: dto.notes,
      },
    });

    return this.mapToResponseDto(charge);
  }

  /**
   * Match an accrued charge to an actual charge transaction
   */
  async matchAccruedCharge(
    tenantId: string,
    dto: MatchAccruedChargeDto,
    userId: string,
  ): Promise<AccruedBankChargeResponseDto> {
    this.logger.log(
      `Matching accrued charge ${dto.accrued_charge_id} to transaction ${dto.charge_transaction_id}`,
    );

    // Verify the accrued charge exists and belongs to tenant
    const existing = await this.prisma.accruedBankCharge.findFirst({
      where: {
        id: dto.accrued_charge_id,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Accrued charge ${dto.accrued_charge_id} not found`,
      );
    }

    // Verify the charge transaction exists
    const chargeTransaction = await this.prisma.transaction.findFirst({
      where: {
        id: dto.charge_transaction_id,
        tenantId,
      },
    });

    if (!chargeTransaction) {
      throw new NotFoundException(
        `Transaction ${dto.charge_transaction_id} not found`,
      );
    }

    // Update the accrued charge
    const updated = await this.prisma.accruedBankCharge.update({
      where: { id: dto.accrued_charge_id },
      data: {
        chargeTransactionId: dto.charge_transaction_id,
        chargeDate: dto.charge_date ? new Date(dto.charge_date) : new Date(),
        status: AccruedBankChargeStatus.MATCHED,
        matchedAt: new Date(),
        matchedBy: userId,
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Update an accrued charge status
   */
  async updateStatus(
    tenantId: string,
    dto: UpdateAccruedChargeStatusDto,
  ): Promise<AccruedBankChargeResponseDto> {
    // Verify the accrued charge exists
    const existing = await this.prisma.accruedBankCharge.findFirst({
      where: {
        id: dto.accrued_charge_id,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Accrued charge ${dto.accrued_charge_id} not found`,
      );
    }

    const updated = await this.prisma.accruedBankCharge.update({
      where: { id: dto.accrued_charge_id },
      data: {
        status: dto.status as AccruedBankChargeStatus,
        notes: dto.notes
          ? `${existing.notes || ''}\n${dto.notes}`.trim()
          : existing.notes,
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Get an accrued charge by ID
   */
  async getAccruedCharge(
    tenantId: string,
    chargeId: string,
  ): Promise<AccruedBankChargeResponseDto> {
    const charge = await this.prisma.accruedBankCharge.findFirst({
      where: {
        id: chargeId,
        tenantId,
      },
    });

    if (!charge) {
      throw new NotFoundException(`Accrued charge ${chargeId} not found`);
    }

    return this.mapToResponseDto(charge);
  }

  /**
   * List accrued charges with filtering
   */
  async listAccruedCharges(
    tenantId: string,
    filter: AccruedChargeFilterDto,
  ): Promise<{
    data: AccruedBankChargeResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(filter.status && {
        status: filter.status as AccruedBankChargeStatus,
      }),
      ...(filter.fee_type && { feeType: filter.fee_type }),
      ...(filter.start_date && {
        sourceDate: { gte: new Date(filter.start_date) },
      }),
      ...(filter.end_date && {
        sourceDate: { lte: new Date(filter.end_date) },
      }),
    };

    const [charges, total] = await Promise.all([
      this.prisma.accruedBankCharge.findMany({
        where,
        orderBy: { sourceDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.accruedBankCharge.count({ where }),
    ]);

    return {
      data: charges.map((c) => this.mapToResponseDto(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get summary of accrued charges for a tenant
   */
  async getSummary(tenantId: string): Promise<AccruedChargeSummaryDto> {
    const charges = await this.prisma.accruedBankCharge.findMany({
      where: { tenantId },
      select: {
        status: true,
        accruedAmountCents: true,
        feeType: true,
      },
    });

    const byStatus: Record<AccruedBankChargeStatusDto, number> = {
      [AccruedBankChargeStatusDto.ACCRUED]: 0,
      [AccruedBankChargeStatusDto.MATCHED]: 0,
      [AccruedBankChargeStatusDto.REVERSED]: 0,
      [AccruedBankChargeStatusDto.WRITTEN_OFF]: 0,
    };

    const byFeeType: Record<string, { count: number; total_cents: number }> =
      {};

    let totalAccruedCents = 0;
    let totalMatchedCents = 0;
    let totalPendingCents = 0;

    for (const charge of charges) {
      byStatus[charge.status as AccruedBankChargeStatusDto]++;

      if (!byFeeType[charge.feeType]) {
        byFeeType[charge.feeType] = { count: 0, total_cents: 0 };
      }
      byFeeType[charge.feeType].count++;
      byFeeType[charge.feeType].total_cents += charge.accruedAmountCents;

      totalAccruedCents += charge.accruedAmountCents;

      if (charge.status === AccruedBankChargeStatus.MATCHED) {
        totalMatchedCents += charge.accruedAmountCents;
      } else if (charge.status === AccruedBankChargeStatus.ACCRUED) {
        totalPendingCents += charge.accruedAmountCents;
      }
    }

    return {
      total_count: charges.length,
      by_status: byStatus,
      total_accrued_cents: totalAccruedCents,
      total_matched_cents: totalMatchedCents,
      total_pending_cents: totalPendingCents,
      by_fee_type: byFeeType,
    };
  }

  /**
   * Auto-match accrued charges to fee transactions in bank statement
   *
   * Looks for bank transactions that match the fee patterns:
   * - Similar fee amount
   * - Date is after the source transaction date
   * - Description contains fee-related keywords
   */
  async autoMatchAccruedCharges(
    tenantId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    matchedCount: number;
    remainingCount: number;
    totalMatchedCents: number;
  }> {
    this.logger.log(`Auto-matching accrued charges for tenant ${tenantId}`);

    // Get pending accrued charges
    const pendingCharges = await this.prisma.accruedBankCharge.findMany({
      where: {
        tenantId,
        status: AccruedBankChargeStatus.ACCRUED,
        ...(startDate && { sourceDate: { gte: startDate } }),
        ...(endDate && { sourceDate: { lte: endDate } }),
      },
      orderBy: { sourceDate: 'asc' },
    });

    if (pendingCharges.length === 0) {
      return { matchedCount: 0, remainingCount: 0, totalMatchedCents: 0 };
    }

    let matchedCount = 0;
    let totalMatchedCents = 0;

    for (const charge of pendingCharges) {
      // Look for potential fee transactions
      // Fee transactions are typically:
      // - Debits (negative/not credits)
      // - Within a month of the source date
      // - Description contains "FEE", "CHARGE", or bank fee keywords
      const searchStart = new Date(charge.sourceDate);
      const searchEnd = new Date(charge.sourceDate);
      searchEnd.setDate(searchEnd.getDate() + 35); // Look up to 35 days ahead

      const potentialMatches = await this.prisma.transaction.findMany({
        where: {
          tenantId,
          isCredit: false,
          date: {
            gte: searchStart,
            lte: searchEnd,
          },
          amountCents: {
            gte: charge.accruedAmountCents - FEE_TOLERANCE_CENTS,
            lte: charge.accruedAmountCents + FEE_TOLERANCE_CENTS,
          },
          // Not already matched to another accrued charge
          accruedChargesAsCharge: { none: {} },
        },
        orderBy: { date: 'asc' },
      });

      // Score and rank potential matches
      for (const txn of potentialMatches) {
        const isFeeTransaction =
          /FEE|CHARGE|SERVICE|BANK\s*CHRG/i.test(txn.description) ||
          /ADT|CASH\s*DEP|ATM/i.test(txn.description);

        if (isFeeTransaction) {
          // Update the accrued charge to matched status
          await this.prisma.accruedBankCharge.update({
            where: { id: charge.id },
            data: {
              chargeTransactionId: txn.id,
              chargeDate: txn.date,
              status: AccruedBankChargeStatus.MATCHED,
              matchedAt: new Date(),
              matchedBy: userId,
            },
          });

          matchedCount++;
          totalMatchedCents += charge.accruedAmountCents;

          // Only match one transaction per accrued charge
          break;
        }
      }
    }

    return {
      matchedCount,
      remainingCount: pendingCharges.length - matchedCount,
      totalMatchedCents,
    };
  }

  /**
   * Get accrued charges for a specific bank statement match
   */
  async getByBankStatementMatch(
    tenantId: string,
    matchId: string,
  ): Promise<AccruedBankChargeResponseDto | null> {
    const charge = await this.prisma.accruedBankCharge.findFirst({
      where: {
        tenantId,
        bankStatementMatchId: matchId,
      },
    });

    return charge ? this.mapToResponseDto(charge) : null;
  }

  /**
   * Check if a transaction type typically attracts fees
   */
  private isFeeRelatedTransactionType(type: TransactionType): boolean {
    return [
      TransactionType.ADT_DEPOSIT,
      TransactionType.CASH_DEPOSIT,
      TransactionType.ATM_DEPOSIT,
      TransactionType.ATM_WITHDRAWAL,
      TransactionType.EFT_CREDIT,
      TransactionType.EFT_DEBIT,
      TransactionType.CARD_PURCHASE,
    ].includes(type);
  }

  /**
   * Map transaction type to fee type string
   */
  private mapTransactionTypeToFeeType(type: TransactionType): string {
    const mapping: Record<TransactionType, string> = {
      [TransactionType.ADT_DEPOSIT]: 'ADT_DEPOSIT_FEE',
      [TransactionType.CASH_DEPOSIT]: 'CASH_DEPOSIT_FEE',
      [TransactionType.ATM_DEPOSIT]: 'ATM_DEPOSIT_FEE',
      [TransactionType.ATM_WITHDRAWAL]: 'ATM_WITHDRAWAL_FEE',
      [TransactionType.EFT_CREDIT]: 'EFT_CREDIT_FEE',
      [TransactionType.EFT_DEBIT]: 'EFT_DEBIT_FEE',
      [TransactionType.DEBIT_ORDER]: 'DEBIT_ORDER_FEE',
      [TransactionType.CARD_PURCHASE]: 'CARD_TRANSACTION_FEE',
      [TransactionType.CASH_WITHDRAWAL]: 'CASH_WITHDRAWAL_FEE',
      [TransactionType.TRANSFER]: 'TRANSFER_FEE',
      [TransactionType.RTC_PAYMENT]: 'RTC_PAYMENT_FEE',
      [TransactionType.FUEL_PURCHASE]: 'FUEL_CARD_FEE',
      [TransactionType.SEND_MONEY]: 'SEND_MONEY_FEE',
      [TransactionType.UNKNOWN]: 'UNKNOWN_FEE',
    };

    return mapping[type] || 'UNKNOWN_FEE';
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(charge: {
    id: string;
    tenantId: string;
    sourceTransactionId: string | null;
    sourceDescription: string;
    sourceDate: Date;
    sourceAmountCents: number;
    accruedAmountCents: number;
    feeType: string;
    feeDescription: string | null;
    status: AccruedBankChargeStatus;
    bankStatementMatchId: string | null;
    xeroTransactionId: string | null;
    xeroAmountCents: number | null;
    chargeTransactionId: string | null;
    chargeDate: Date | null;
    matchedAt: Date | null;
    matchedBy: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AccruedBankChargeResponseDto {
    return {
      id: charge.id,
      tenant_id: charge.tenantId,
      source_transaction_id: charge.sourceTransactionId,
      source_description: charge.sourceDescription,
      source_date: charge.sourceDate.toISOString().split('T')[0],
      source_amount_cents: charge.sourceAmountCents,
      accrued_amount_cents: charge.accruedAmountCents,
      fee_type: charge.feeType,
      fee_description: charge.feeDescription,
      status: charge.status as AccruedBankChargeStatusDto,
      bank_statement_match_id: charge.bankStatementMatchId,
      xero_transaction_id: charge.xeroTransactionId,
      xero_amount_cents: charge.xeroAmountCents,
      charge_transaction_id: charge.chargeTransactionId,
      charge_date: charge.chargeDate?.toISOString().split('T')[0] || null,
      matched_at: charge.matchedAt?.toISOString() || null,
      matched_by: charge.matchedBy,
      notes: charge.notes,
      created_at: charge.createdAt.toISOString(),
      updated_at: charge.updatedAt.toISOString(),
    };
  }
}
