/**
 * Xero Transaction Split Service
 * TASK-RECON-037: Xero Transaction Splitting for Bank Reconciliation
 *
 * Service for splitting Xero transactions into net amount + accrued bank charge
 * to enable direct matching with bank statements.
 *
 * Use case:
 * - Xero transaction: R1,219.70 (GROSS deposited by customer)
 * - Bank statement: R1,200.00 (NET credited after bank fees)
 * - This service splits Xero transaction so:
 *   - Net R1,200.00 can match bank statement directly
 *   - Fee R19.70 is recorded as accrued bank charge
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccruedBankChargeService } from './accrued-bank-charge.service';
import { BankFeeService, TransactionType } from './bank-fee.service';
import {
  XeroTransactionSplitStatus,
  AccruedBankChargeStatus,
} from '@prisma/client';
import {
  SplitXeroTransactionDto,
  DetectSplitParamsDto,
  DetectSplitParamsResponseDto,
  ConfirmXeroSplitDto,
  CancelXeroSplitDto,
  XeroTransactionSplitResponseDto,
  XeroSplitWithChargeResponseDto,
  XeroSplitFilterDto,
  XeroSplitSummaryDto,
  XeroTransactionSplitStatusDto,
} from '../dto/xero-transaction-split.dto';

/**
 * Minimum fee amount to consider for splitting (in cents)
 */
const MIN_FEE_AMOUNT_CENTS = 50; // R0.50

/**
 * Maximum fee as percentage of transaction (sanity check)
 */
const MAX_FEE_PERCENTAGE = 0.1; // 10%

/**
 * Confidence threshold for auto-recommending splits
 */
const SPLIT_RECOMMENDATION_THRESHOLD = 0.75;

@Injectable()
export class XeroTransactionSplitService {
  private readonly logger = new Logger(XeroTransactionSplitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accruedChargeService: AccruedBankChargeService,
    private readonly bankFeeService: BankFeeService,
  ) {}

  /**
   * Detect if a Xero transaction should be split to match a bank statement transaction.
   * Returns suggested split parameters if splitting is recommended.
   */
  async detectSplitParams(
    tenantId: string,
    dto: DetectSplitParamsDto,
  ): Promise<DetectSplitParamsResponseDto> {
    // Calculate the fee difference
    const feeDifference = dto.xero_amount_cents - dto.bank_amount_cents;

    // Quick validation - no split needed if amounts match or bank is higher
    if (feeDifference <= 0) {
      return {
        is_split_recommended: false,
        xero_amount_cents: dto.xero_amount_cents,
        suggested_net_amount_cents: dto.xero_amount_cents,
        suggested_fee_amount_cents: 0,
        suggested_fee_type: 'NONE',
        confidence: 0,
        explanation:
          'No split needed - amounts match or bank amount is higher than Xero',
      };
    }

    // Check if fee is too small to be meaningful
    if (feeDifference < MIN_FEE_AMOUNT_CENTS) {
      return {
        is_split_recommended: false,
        xero_amount_cents: dto.xero_amount_cents,
        suggested_net_amount_cents: dto.bank_amount_cents,
        suggested_fee_amount_cents: feeDifference,
        suggested_fee_type: 'UNKNOWN_FEE',
        confidence: 0.2,
        explanation: `Fee difference (R${(feeDifference / 100).toFixed(2)}) is too small for splitting`,
      };
    }

    // Check if fee is unreasonably high
    const feePercentage = feeDifference / dto.xero_amount_cents;
    if (feePercentage > MAX_FEE_PERCENTAGE) {
      return {
        is_split_recommended: false,
        xero_amount_cents: dto.xero_amount_cents,
        suggested_net_amount_cents: dto.bank_amount_cents,
        suggested_fee_amount_cents: feeDifference,
        suggested_fee_type: 'UNKNOWN_FEE',
        confidence: 0.3,
        explanation: `Fee percentage (${(feePercentage * 100).toFixed(1)}%) exceeds typical fee range - this may not be a fee-related difference`,
      };
    }

    // Detect transaction type from description
    const transactionType = this.bankFeeService.detectTransactionType(
      dto.description || '',
      dto.payee_name,
      null,
    );

    // Get expected fee for this transaction type
    const expectedFee = await this.bankFeeService.getTotalFeeForTransaction(
      tenantId,
      dto.description || '',
      dto.bank_amount_cents,
      dto.payee_name,
      null,
    );

    // Determine fee type
    const feeType = this.mapTransactionTypeToFeeType(transactionType);

    // Calculate confidence based on fee match
    let confidence = 0;
    let explanation = '';

    const tolerance = 50; // R0.50 tolerance
    const feeMatchesExpected =
      Math.abs(feeDifference - expectedFee) <= tolerance;

    if (feeMatchesExpected && expectedFee > 0) {
      confidence = 0.95;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) matches expected ${transactionType} fee (R${(expectedFee / 100).toFixed(2)})`;
    } else if (this.isFeeRelatedTransactionType(transactionType)) {
      confidence = 0.8;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) detected for ${transactionType} transaction`;
    } else if (feeDifference >= MIN_FEE_AMOUNT_CENTS && feePercentage <= 0.05) {
      confidence = 0.65;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) is within typical fee range`;
    } else {
      confidence = 0.4;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) detected but no matching fee rule found`;
    }

    return {
      is_split_recommended: confidence >= SPLIT_RECOMMENDATION_THRESHOLD,
      xero_amount_cents: dto.xero_amount_cents,
      suggested_net_amount_cents: dto.bank_amount_cents,
      suggested_fee_amount_cents: feeDifference,
      suggested_fee_type: feeType,
      expected_fee_cents: expectedFee > 0 ? expectedFee : undefined,
      confidence,
      explanation,
    };
  }

  /**
   * Split a Xero transaction into net amount + fee.
   * Creates both the split record and an accrued bank charge for the fee.
   */
  async splitXeroTransaction(
    tenantId: string,
    dto: SplitXeroTransactionDto,
    userId: string,
  ): Promise<XeroSplitWithChargeResponseDto> {
    this.logger.log(
      `Splitting Xero transaction ${dto.xero_transaction_id} for tenant ${tenantId}`,
      {
        netAmount: dto.net_amount_cents,
        feeAmount: dto.fee_amount_cents,
        feeType: dto.fee_type,
      },
    );

    // Validate amounts
    const originalAmount = dto.net_amount_cents + dto.fee_amount_cents;
    if (dto.fee_amount_cents < MIN_FEE_AMOUNT_CENTS) {
      throw new BadRequestException(
        `Fee amount (R${(dto.fee_amount_cents / 100).toFixed(2)}) is too small for splitting`,
      );
    }

    // Check if this Xero transaction has already been split
    const existingSplit = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        tenantId,
        xeroTransactionId: dto.xero_transaction_id,
        status: {
          in: [
            XeroTransactionSplitStatus.PENDING,
            XeroTransactionSplitStatus.CONFIRMED,
            XeroTransactionSplitStatus.MATCHED,
          ],
        },
      },
    });

    if (existingSplit) {
      throw new BadRequestException(
        `Xero transaction ${dto.xero_transaction_id} has already been split (split ID: ${existingSplit.id})`,
      );
    }

    // Create the split and accrued charge in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the accrued bank charge first
      const accruedCharge = await tx.accruedBankCharge.create({
        data: {
          tenantId,
          sourceDescription: `Xero transaction split - ${dto.xero_transaction_id}`,
          sourceDate: new Date(),
          sourceAmountCents: dto.net_amount_cents,
          accruedAmountCents: dto.fee_amount_cents,
          feeType: dto.fee_type,
          feeDescription:
            dto.fee_description || `Fee split from Xero transaction`,
          status: AccruedBankChargeStatus.ACCRUED,
          xeroTransactionId: dto.xero_transaction_id,
          xeroAmountCents: originalAmount,
          bankStatementMatchId: dto.bank_statement_match_id,
          notes: dto.notes,
        },
      });

      // Create the split record
      const split = await tx.xeroTransactionSplit.create({
        data: {
          tenantId,
          xeroTransactionId: dto.xero_transaction_id,
          originalAmountCents: originalAmount,
          netAmountCents: dto.net_amount_cents,
          feeAmountCents: dto.fee_amount_cents,
          feeType: dto.fee_type,
          feeDescription: dto.fee_description,
          status: XeroTransactionSplitStatus.PENDING,
          accruedChargeId: accruedCharge.id,
          bankTransactionId: dto.bank_transaction_id,
          bankStatementMatchId: dto.bank_statement_match_id,
          notes: dto.notes,
          createdBy: userId,
        },
      });

      return { split, accruedCharge };
    });

    this.logger.log(
      `Created Xero transaction split ${result.split.id} with accrued charge ${result.accruedCharge.id}`,
    );

    return this.mapToResponseWithCharge(result.split, result.accruedCharge);
  }

  /**
   * Confirm a pending split, making it ready for matching
   */
  async confirmSplit(
    tenantId: string,
    dto: ConfirmXeroSplitDto,
    userId: string,
  ): Promise<XeroSplitWithChargeResponseDto> {
    const split = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        id: dto.split_id,
        tenantId,
      },
      include: {
        accruedCharge: true,
      },
    });

    if (!split) {
      throw new NotFoundException(`Split ${dto.split_id} not found`);
    }

    if (split.status !== XeroTransactionSplitStatus.PENDING) {
      throw new BadRequestException(
        `Split ${dto.split_id} is not pending (current status: ${split.status})`,
      );
    }

    const updated = await this.prisma.xeroTransactionSplit.update({
      where: { id: dto.split_id },
      data: {
        status: XeroTransactionSplitStatus.CONFIRMED,
        bankTransactionId: dto.bank_transaction_id || split.bankTransactionId,
        confirmedBy: userId,
        confirmedAt: new Date(),
      },
      include: {
        accruedCharge: true,
      },
    });

    this.logger.log(`Confirmed split ${dto.split_id}`);

    return this.mapToResponseWithCharge(updated, updated.accruedCharge);
  }

  /**
   * Cancel a split and revert the accrued charge
   */
  async cancelSplit(
    tenantId: string,
    dto: CancelXeroSplitDto,
    userId: string,
  ): Promise<XeroSplitWithChargeResponseDto> {
    const split = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        id: dto.split_id,
        tenantId,
      },
      include: {
        accruedCharge: true,
      },
    });

    if (!split) {
      throw new NotFoundException(`Split ${dto.split_id} not found`);
    }

    if (split.status === XeroTransactionSplitStatus.CANCELLED) {
      throw new BadRequestException(
        `Split ${dto.split_id} is already cancelled`,
      );
    }

    // Cancel the split and reverse the accrued charge
    const result = await this.prisma.$transaction(async (tx) => {
      // Update the split status
      const updatedSplit = await tx.xeroTransactionSplit.update({
        where: { id: dto.split_id },
        data: {
          status: XeroTransactionSplitStatus.CANCELLED,
          notes: dto.reason
            ? `${split.notes || ''}\nCancelled: ${dto.reason}`.trim()
            : split.notes,
        },
      });

      // Reverse the accrued charge if it exists and is still pending
      let updatedCharge = split.accruedCharge;
      if (
        split.accruedChargeId &&
        split.accruedCharge?.status === AccruedBankChargeStatus.ACCRUED
      ) {
        updatedCharge = await tx.accruedBankCharge.update({
          where: { id: split.accruedChargeId },
          data: {
            status: AccruedBankChargeStatus.REVERSED,
            notes:
              `${split.accruedCharge.notes || ''}\nReversed due to split cancellation`.trim(),
          },
        });
      }

      return { split: updatedSplit, accruedCharge: updatedCharge };
    });

    this.logger.log(`Cancelled split ${dto.split_id}`);

    return this.mapToResponseWithCharge(result.split, result.accruedCharge);
  }

  /**
   * Mark a split as matched when the net amount is matched to a bank statement
   */
  async markSplitAsMatched(
    tenantId: string,
    splitId: string,
    bankTransactionId: string,
    bankStatementMatchId?: string,
  ): Promise<XeroSplitWithChargeResponseDto> {
    const split = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        id: splitId,
        tenantId,
      },
      include: {
        accruedCharge: true,
      },
    });

    if (!split) {
      throw new NotFoundException(`Split ${splitId} not found`);
    }

    const updated = await this.prisma.xeroTransactionSplit.update({
      where: { id: splitId },
      data: {
        status: XeroTransactionSplitStatus.MATCHED,
        bankTransactionId,
        bankStatementMatchId,
      },
      include: {
        accruedCharge: true,
      },
    });

    return this.mapToResponseWithCharge(updated, updated.accruedCharge);
  }

  /**
   * Get a split by ID
   */
  async getSplit(
    tenantId: string,
    splitId: string,
  ): Promise<XeroSplitWithChargeResponseDto> {
    const split = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        id: splitId,
        tenantId,
      },
      include: {
        accruedCharge: true,
      },
    });

    if (!split) {
      throw new NotFoundException(`Split ${splitId} not found`);
    }

    return this.mapToResponseWithCharge(split, split.accruedCharge);
  }

  /**
   * Get a split by Xero transaction ID
   */
  async getSplitByXeroTransactionId(
    tenantId: string,
    xeroTransactionId: string,
  ): Promise<XeroSplitWithChargeResponseDto | null> {
    const split = await this.prisma.xeroTransactionSplit.findFirst({
      where: {
        tenantId,
        xeroTransactionId,
        status: {
          not: XeroTransactionSplitStatus.CANCELLED,
        },
      },
      include: {
        accruedCharge: true,
      },
    });

    if (!split) {
      return null;
    }

    return this.mapToResponseWithCharge(split, split.accruedCharge);
  }

  /**
   * List splits with filtering
   */
  async listSplits(
    tenantId: string,
    filter: XeroSplitFilterDto,
  ): Promise<{
    data: XeroSplitWithChargeResponseDto[];
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
        status: filter.status as XeroTransactionSplitStatus,
      }),
      ...(filter.xero_transaction_id && {
        xeroTransactionId: filter.xero_transaction_id,
      }),
      ...(filter.fee_type && { feeType: filter.fee_type }),
      ...(filter.start_date && {
        createdAt: { gte: new Date(filter.start_date) },
      }),
      ...(filter.end_date && {
        createdAt: { lte: new Date(filter.end_date) },
      }),
    };

    const [splits, total] = await Promise.all([
      this.prisma.xeroTransactionSplit.findMany({
        where,
        include: {
          accruedCharge: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.xeroTransactionSplit.count({ where }),
    ]);

    return {
      data: splits.map((s) => this.mapToResponseWithCharge(s, s.accruedCharge)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get summary of Xero transaction splits
   */
  async getSummary(tenantId: string): Promise<XeroSplitSummaryDto> {
    const splits = await this.prisma.xeroTransactionSplit.findMany({
      where: { tenantId },
      select: {
        status: true,
        originalAmountCents: true,
        netAmountCents: true,
        feeAmountCents: true,
        feeType: true,
      },
    });

    const byStatus: Record<XeroTransactionSplitStatusDto, number> = {
      [XeroTransactionSplitStatusDto.PENDING]: 0,
      [XeroTransactionSplitStatusDto.CONFIRMED]: 0,
      [XeroTransactionSplitStatusDto.MATCHED]: 0,
      [XeroTransactionSplitStatusDto.CANCELLED]: 0,
    };

    const byFeeType: Record<
      string,
      { count: number; total_fee_cents: number }
    > = {};

    let totalOriginalCents = 0;
    let totalNetCents = 0;
    let totalFeeCents = 0;

    for (const split of splits) {
      byStatus[split.status as XeroTransactionSplitStatusDto]++;

      if (!byFeeType[split.feeType]) {
        byFeeType[split.feeType] = { count: 0, total_fee_cents: 0 };
      }
      byFeeType[split.feeType].count++;
      byFeeType[split.feeType].total_fee_cents += split.feeAmountCents;

      totalOriginalCents += split.originalAmountCents;
      totalNetCents += split.netAmountCents;
      totalFeeCents += split.feeAmountCents;
    }

    return {
      total_count: splits.length,
      by_status: byStatus,
      total_original_cents: totalOriginalCents,
      total_net_cents: totalNetCents,
      total_fee_cents: totalFeeCents,
      by_fee_type: byFeeType,
    };
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
      [TransactionType.UNKNOWN]: 'UNKNOWN_FEE',
    };

    return mapping[type] || 'UNKNOWN_FEE';
  }

  /**
   * Map split to response DTO
   */
  private mapToResponse(split: {
    id: string;
    tenantId: string;
    xeroTransactionId: string;
    originalAmountCents: number;
    netAmountCents: number;
    feeAmountCents: number;
    feeType: string;
    feeDescription: string | null;
    status: XeroTransactionSplitStatus;
    accruedChargeId: string | null;
    bankTransactionId: string | null;
    bankStatementMatchId: string | null;
    notes: string | null;
    createdBy: string | null;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): XeroTransactionSplitResponseDto {
    return {
      id: split.id,
      tenant_id: split.tenantId,
      xero_transaction_id: split.xeroTransactionId,
      original_amount_cents: split.originalAmountCents,
      net_amount_cents: split.netAmountCents,
      fee_amount_cents: split.feeAmountCents,
      fee_type: split.feeType,
      fee_description: split.feeDescription,
      status: split.status as XeroTransactionSplitStatusDto,
      accrued_charge_id: split.accruedChargeId,
      bank_transaction_id: split.bankTransactionId,
      bank_statement_match_id: split.bankStatementMatchId,
      notes: split.notes,
      created_by: split.createdBy,
      confirmed_by: split.confirmedBy,
      confirmed_at: split.confirmedAt?.toISOString() || null,
      created_at: split.createdAt.toISOString(),
      updated_at: split.updatedAt.toISOString(),
    };
  }

  /**
   * Map split with accrued charge to response DTO
   */
  private mapToResponseWithCharge(
    split: {
      id: string;
      tenantId: string;
      xeroTransactionId: string;
      originalAmountCents: number;
      netAmountCents: number;
      feeAmountCents: number;
      feeType: string;
      feeDescription: string | null;
      status: XeroTransactionSplitStatus;
      accruedChargeId: string | null;
      bankTransactionId: string | null;
      bankStatementMatchId: string | null;
      notes: string | null;
      createdBy: string | null;
      confirmedBy: string | null;
      confirmedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    accruedCharge: {
      id: string;
      status: AccruedBankChargeStatus;
      feeType: string;
      accruedAmountCents: number;
      matchedAt: Date | null;
    } | null,
  ): XeroSplitWithChargeResponseDto {
    const response = this.mapToResponse(
      split,
    ) as XeroSplitWithChargeResponseDto;

    if (accruedCharge) {
      response.accrued_charge = {
        id: accruedCharge.id,
        status: accruedCharge.status,
        fee_type: accruedCharge.feeType,
        accrued_amount_cents: accruedCharge.accruedAmountCents,
        matched_at: accruedCharge.matchedAt?.toISOString() || null,
      };
    }

    return response;
  }
}
