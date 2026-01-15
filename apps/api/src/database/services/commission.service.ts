/**
 * Commission Calculation Service
 * TASK-STAFF-007: Fix Commission Calculation
 *
 * Supports multiple commission structures:
 * - Flat rate: Fixed amount per transaction/sale
 * - Percentage: Percentage of transaction value
 * - Tiered: Different rates based on performance thresholds
 *
 * Features:
 * - Commission caps and minimums
 * - Monthly commission totals
 * - Payroll integration
 * - Audit trail for all calculations
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  NotFoundException,
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export enum CommissionType {
  FLAT_RATE = 'FLAT_RATE',
  PERCENTAGE = 'PERCENTAGE',
  TIERED = 'TIERED',
}

export enum CommissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  VOID = 'VOID',
}

export interface ICommissionStructure {
  id: string;
  name: string;
  type: CommissionType;
  isActive: boolean;
  // For FLAT_RATE
  flatRateCents?: number;
  // For PERCENTAGE
  percentageRate?: number;
  // For TIERED
  tiers?: ICommissionTier[];
  // Caps and minimums
  minimumCommissionCents?: number;
  maximumCommissionCents?: number;
  monthlyCapCents?: number;
  // Eligibility criteria
  eligibleTransactionTypes?: string[];
  minimumTransactionAmountCents?: number;
}

export interface ICommissionTier {
  thresholdCents: number; // Lower bound of tier
  rate: number; // Rate for this tier (decimal, e.g., 0.05 for 5%)
  flatBonusCents?: number; // Optional flat bonus when reaching tier
}

export interface ICommissionTransaction {
  id: string;
  staffId: string;
  transactionId: string;
  transactionType: string;
  transactionAmountCents: number;
  transactionDate: Date;
  commissionStructureId: string;
  commissionAmountCents: number;
  status: CommissionStatus;
  calculatedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
  paidAt?: Date;
  notes?: string;
}

export interface ICommissionCalculation {
  transactionAmountCents: number;
  commissionType: CommissionType;
  commissionAmountCents: number;
  appliedRate: number;
  appliedTier?: ICommissionTier;
  capped: boolean;
  originalAmountCents: number;
  breakdown: {
    baseCommissionCents: number;
    tierBonusCents: number;
    adjustmentCents: number;
    capAppliedCents: number;
  };
}

export interface IMonthlyCommissionSummary {
  staffId: string;
  staffName: string;
  month: number;
  year: number;
  totalTransactions: number;
  totalTransactionValueCents: number;
  totalCommissionCents: number;
  pendingCommissionCents: number;
  approvedCommissionCents: number;
  paidCommissionCents: number;
  cappedAmount: number;
  transactions: ICommissionTransaction[];
}

export interface ICommissionRequest {
  staffId: string;
  transactionId: string;
  transactionType: string;
  transactionAmountCents: number;
  transactionDate: Date;
  commissionStructureId: string;
  notes?: string;
}

// In-memory storage (would be database in production)
const commissionStructures: Map<string, ICommissionStructure> = new Map();
const commissionTransactions: Map<string, ICommissionTransaction> = new Map();

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    // Initialize default commission structures
    this.initializeDefaultStructures();
  }

  /**
   * Calculate commission for a transaction
   */
  calculateCommission(
    transactionAmountCents: number,
    structure: ICommissionStructure,
  ): ICommissionCalculation {
    if (transactionAmountCents < 0) {
      throw new ValidationException('Transaction amount cannot be negative', [
        {
          field: 'transactionAmountCents',
          message: 'Amount cannot be negative',
        },
      ]);
    }

    // Check minimum transaction amount
    if (
      structure.minimumTransactionAmountCents &&
      transactionAmountCents < structure.minimumTransactionAmountCents
    ) {
      return {
        transactionAmountCents,
        commissionType: structure.type,
        commissionAmountCents: 0,
        appliedRate: 0,
        capped: false,
        originalAmountCents: 0,
        breakdown: {
          baseCommissionCents: 0,
          tierBonusCents: 0,
          adjustmentCents: 0,
          capAppliedCents: 0,
        },
      };
    }

    let baseCommissionCents = 0;
    let appliedRate = 0;
    let appliedTier: ICommissionTier | undefined;
    let tierBonusCents = 0;

    switch (structure.type) {
      case CommissionType.FLAT_RATE:
        baseCommissionCents = structure.flatRateCents || 0;
        appliedRate =
          transactionAmountCents > 0
            ? new Decimal(baseCommissionCents)
                .div(transactionAmountCents)
                .toNumber()
            : 0;
        break;

      case CommissionType.PERCENTAGE:
        appliedRate = structure.percentageRate || 0;
        baseCommissionCents = new Decimal(transactionAmountCents)
          .mul(appliedRate)
          .round()
          .toNumber();
        break;

      case CommissionType.TIERED:
        if (structure.tiers && structure.tiers.length > 0) {
          const { tier, commission, bonus } = this.calculateTieredCommission(
            transactionAmountCents,
            structure.tiers,
          );
          appliedTier = tier;
          baseCommissionCents = commission;
          tierBonusCents = bonus;
          appliedRate = tier?.rate || 0;
        }
        break;
    }

    // Apply minimum commission
    let originalAmountCents = baseCommissionCents + tierBonusCents;
    let adjustmentCents = 0;

    if (
      structure.minimumCommissionCents &&
      originalAmountCents < structure.minimumCommissionCents &&
      originalAmountCents > 0
    ) {
      adjustmentCents = structure.minimumCommissionCents - originalAmountCents;
      originalAmountCents = structure.minimumCommissionCents;
    }

    // Apply maximum commission cap
    let capped = false;
    let capAppliedCents = 0;

    if (
      structure.maximumCommissionCents &&
      originalAmountCents > structure.maximumCommissionCents
    ) {
      capAppliedCents = originalAmountCents - structure.maximumCommissionCents;
      originalAmountCents = structure.maximumCommissionCents;
      capped = true;
    }

    return {
      transactionAmountCents,
      commissionType: structure.type,
      commissionAmountCents: originalAmountCents,
      appliedRate,
      appliedTier,
      capped,
      originalAmountCents: baseCommissionCents + tierBonusCents,
      breakdown: {
        baseCommissionCents,
        tierBonusCents,
        adjustmentCents,
        capAppliedCents,
      },
    };
  }

  /**
   * Calculate tiered commission
   */
  private calculateTieredCommission(
    amountCents: number,
    tiers: ICommissionTier[],
  ): { tier: ICommissionTier | undefined; commission: number; bonus: number } {
    // Sort tiers by threshold descending to find highest applicable tier
    const sortedTiers = [...tiers].sort(
      (a, b) => b.thresholdCents - a.thresholdCents,
    );

    for (const tier of sortedTiers) {
      if (amountCents >= tier.thresholdCents) {
        const commission = new Decimal(amountCents)
          .mul(tier.rate)
          .round()
          .toNumber();
        const bonus = tier.flatBonusCents || 0;
        return { tier, commission, bonus };
      }
    }

    // If no tier matched, use first tier (lowest threshold)
    const lowestTier = sortedTiers[sortedTiers.length - 1];
    if (lowestTier) {
      const commission = new Decimal(amountCents)
        .mul(lowestTier.rate)
        .round()
        .toNumber();
      return { tier: lowestTier, commission, bonus: 0 };
    }

    return { tier: undefined, commission: 0, bonus: 0 };
  }

  /**
   * Record a commission-eligible transaction
   */
  async recordCommission(
    tenantId: string,
    request: ICommissionRequest,
    userId: string,
  ): Promise<ICommissionTransaction> {
    this.logger.log(
      `Recording commission for transaction ${request.transactionId}`,
    );

    // Validate staff exists
    const staff = await this.prisma.staff.findFirst({
      where: { id: request.staffId, tenantId, isActive: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', request.staffId);
    }

    // Get commission structure
    const structure = commissionStructures.get(request.commissionStructureId);
    if (!structure) {
      throw new NotFoundException(
        'CommissionStructure',
        request.commissionStructureId,
      );
    }

    if (!structure.isActive) {
      throw new BusinessException(
        'Commission structure is not active',
        'STRUCTURE_INACTIVE',
        { structureId: request.commissionStructureId },
      );
    }

    // Check transaction type eligibility
    if (
      structure.eligibleTransactionTypes &&
      structure.eligibleTransactionTypes.length > 0 &&
      !structure.eligibleTransactionTypes.includes(request.transactionType)
    ) {
      throw new BusinessException(
        'Transaction type not eligible for this commission structure',
        'TRANSACTION_NOT_ELIGIBLE',
        { transactionType: request.transactionType },
      );
    }

    // Calculate commission
    const calculation = this.calculateCommission(
      request.transactionAmountCents,
      structure,
    );

    // Check monthly cap
    const { cappedAmount, newCommission } = await this.applyMonthlyCap(
      request.staffId,
      structure,
      calculation.commissionAmountCents,
      request.transactionDate,
    );

    const transaction: ICommissionTransaction = {
      id: this.generateId(),
      staffId: request.staffId,
      transactionId: request.transactionId,
      transactionType: request.transactionType,
      transactionAmountCents: request.transactionAmountCents,
      transactionDate: request.transactionDate,
      commissionStructureId: request.commissionStructureId,
      commissionAmountCents: newCommission,
      status: CommissionStatus.PENDING,
      calculatedAt: new Date(),
      notes: request.notes,
    };

    commissionTransactions.set(transaction.id, transaction);

    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'CommissionTransaction',
      entityId: transaction.id,
      afterValue: {
        staffId: request.staffId,
        transactionId: request.transactionId,
        commissionAmountCents: newCommission,
        originalAmountCents: calculation.commissionAmountCents,
        cappedAmount,
      },
    });

    return transaction;
  }

  /**
   * Apply monthly commission cap
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async applyMonthlyCap(
    staffId: string,
    structure: ICommissionStructure,
    commissionCents: number,
    date: Date,
  ): Promise<{ cappedAmount: number; newCommission: number }> {
    if (!structure.monthlyCapCents) {
      return { cappedAmount: 0, newCommission: commissionCents };
    }

    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const monthlyTotal = this.getMonthlyCommissionTotal(staffId, month, year);

    const remainingCap = Math.max(0, structure.monthlyCapCents - monthlyTotal);
    const cappedAmount = Math.max(0, commissionCents - remainingCap);
    const newCommission = Math.min(commissionCents, remainingCap);

    return { cappedAmount, newCommission };
  }

  /**
   * Approve pending commissions
   */
  async approveCommission(
    tenantId: string,
    commissionId: string,
    userId: string,
  ): Promise<ICommissionTransaction> {
    const transaction = commissionTransactions.get(commissionId);
    if (!transaction) {
      throw new NotFoundException('CommissionTransaction', commissionId);
    }

    if (transaction.status !== CommissionStatus.PENDING) {
      throw new BusinessException(
        'Only pending commissions can be approved',
        'INVALID_STATUS',
        { status: transaction.status },
      );
    }

    transaction.status = CommissionStatus.APPROVED;
    transaction.approvedAt = new Date();
    transaction.approvedBy = userId;

    commissionTransactions.set(commissionId, transaction);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'CommissionTransaction',
      entityId: commissionId,
      beforeValue: { status: CommissionStatus.PENDING },
      afterValue: { status: CommissionStatus.APPROVED },
    });

    return transaction;
  }

  /**
   * Mark commission as paid (integrated with payroll)
   */
  async markCommissionPaid(
    tenantId: string,
    commissionId: string,
    userId: string,
  ): Promise<ICommissionTransaction> {
    const transaction = commissionTransactions.get(commissionId);
    if (!transaction) {
      throw new NotFoundException('CommissionTransaction', commissionId);
    }

    if (transaction.status !== CommissionStatus.APPROVED) {
      throw new BusinessException(
        'Only approved commissions can be marked as paid',
        'INVALID_STATUS',
        { status: transaction.status },
      );
    }

    transaction.status = CommissionStatus.PAID;
    transaction.paidAt = new Date();

    commissionTransactions.set(commissionId, transaction);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'CommissionTransaction',
      entityId: commissionId,
      beforeValue: { status: CommissionStatus.APPROVED },
      afterValue: { status: CommissionStatus.PAID, paidAt: transaction.paidAt },
    });

    return transaction;
  }

  /**
   * Get monthly commission summary for a staff member
   */
  async getMonthlyCommissionSummary(
    tenantId: string,
    staffId: string,
    month: number,
    year: number,
  ): Promise<IMonthlyCommissionSummary> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const transactions = this.getMonthlyTransactions(staffId, month, year);

    const totalTransactionValueCents = transactions.reduce(
      (sum, t) => sum + t.transactionAmountCents,
      0,
    );

    const totalCommissionCents = transactions.reduce(
      (sum, t) => sum + t.commissionAmountCents,
      0,
    );

    const pendingCommissionCents = transactions
      .filter((t) => t.status === CommissionStatus.PENDING)
      .reduce((sum, t) => sum + t.commissionAmountCents, 0);

    const approvedCommissionCents = transactions
      .filter((t) => t.status === CommissionStatus.APPROVED)
      .reduce((sum, t) => sum + t.commissionAmountCents, 0);

    const paidCommissionCents = transactions
      .filter((t) => t.status === CommissionStatus.PAID)
      .reduce((sum, t) => sum + t.commissionAmountCents, 0);

    return {
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      month,
      year,
      totalTransactions: transactions.length,
      totalTransactionValueCents,
      totalCommissionCents,
      pendingCommissionCents,
      approvedCommissionCents,
      paidCommissionCents,
      cappedAmount: 0, // Would calculate from cap history
      transactions,
    };
  }

  /**
   * Get commissions ready for payroll integration
   */
  async getCommissionsForPayroll(
    tenantId: string,
    month: number,
    year: number,
  ): Promise<{ staffId: string; totalCommissionCents: number }[]> {
    const staffList = await this.prisma.staff.findMany({
      where: { tenantId, isActive: true },
    });

    const results: { staffId: string; totalCommissionCents: number }[] = [];

    for (const staff of staffList) {
      const transactions = this.getMonthlyTransactions(staff.id, month, year);
      const approvedTotal = transactions
        .filter((t) => t.status === CommissionStatus.APPROVED)
        .reduce((sum, t) => sum + t.commissionAmountCents, 0);

      if (approvedTotal > 0) {
        results.push({
          staffId: staff.id,
          totalCommissionCents: approvedTotal,
        });
      }
    }

    return results;
  }

  /**
   * Create a commission structure
   */
  createCommissionStructure(
    structure: ICommissionStructure,
  ): ICommissionStructure {
    // Validate structure
    if (
      structure.type === CommissionType.FLAT_RATE &&
      !structure.flatRateCents
    ) {
      throw new ValidationException(
        'Flat rate commission requires flatRateCents',
        [
          {
            field: 'flatRateCents',
            message: 'Required for flat rate commission',
          },
        ],
      );
    }

    if (
      structure.type === CommissionType.PERCENTAGE &&
      structure.percentageRate === undefined
    ) {
      throw new ValidationException(
        'Percentage commission requires percentageRate',
        [
          {
            field: 'percentageRate',
            message: 'Required for percentage commission',
          },
        ],
      );
    }

    if (
      structure.type === CommissionType.TIERED &&
      (!structure.tiers || structure.tiers.length === 0)
    ) {
      throw new ValidationException(
        'Tiered commission requires at least one tier',
        [{ field: 'tiers', message: 'At least one tier required' }],
      );
    }

    const id = this.generateId();
    const newStructure = { ...structure, id };
    commissionStructures.set(id, newStructure);

    return newStructure;
  }

  /**
   * Get commission structure by ID
   */
  getCommissionStructure(id: string): ICommissionStructure | undefined {
    return commissionStructures.get(id);
  }

  /**
   * List all commission structures
   */
  listCommissionStructures(): ICommissionStructure[] {
    return Array.from(commissionStructures.values());
  }

  /**
   * Get monthly transactions for a staff member
   */
  private getMonthlyTransactions(
    staffId: string,
    month: number,
    year: number,
  ): ICommissionTransaction[] {
    const transactions: ICommissionTransaction[] = [];

    for (const transaction of commissionTransactions.values()) {
      if (
        transaction.staffId === staffId &&
        transaction.transactionDate.getMonth() + 1 === month &&
        transaction.transactionDate.getFullYear() === year &&
        transaction.status !== CommissionStatus.VOID
      ) {
        transactions.push(transaction);
      }
    }

    return transactions.sort(
      (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
    );
  }

  /**
   * Get monthly commission total
   */
  private getMonthlyCommissionTotal(
    staffId: string,
    month: number,
    year: number,
  ): number {
    const transactions = this.getMonthlyTransactions(staffId, month, year);
    return transactions.reduce((sum, t) => sum + t.commissionAmountCents, 0);
  }

  /**
   * Initialize default commission structures
   */
  private initializeDefaultStructures(): void {
    // Flat rate structure
    commissionStructures.set('default-flat', {
      id: 'default-flat',
      name: 'Flat Rate Commission',
      type: CommissionType.FLAT_RATE,
      isActive: true,
      flatRateCents: 5000, // R50 per transaction
      minimumTransactionAmountCents: 100000, // R1000 minimum
    });

    // Percentage structure
    commissionStructures.set('default-percentage', {
      id: 'default-percentage',
      name: 'Percentage Commission',
      type: CommissionType.PERCENTAGE,
      isActive: true,
      percentageRate: 0.05, // 5%
      minimumCommissionCents: 2500, // R25 minimum
      maximumCommissionCents: 500000, // R5000 maximum per transaction
      monthlyCapCents: 5000000, // R50,000 monthly cap
    });

    // Tiered structure
    commissionStructures.set('default-tiered', {
      id: 'default-tiered',
      name: 'Tiered Commission',
      type: CommissionType.TIERED,
      isActive: true,
      tiers: [
        { thresholdCents: 0, rate: 0.02 }, // 2% for R0-R10,000
        { thresholdCents: 1000000, rate: 0.03 }, // 3% for R10,001-R50,000
        { thresholdCents: 5000000, rate: 0.05, flatBonusCents: 10000 }, // 5% + R100 bonus for R50,001+
      ],
      monthlyCapCents: 10000000, // R100,000 monthly cap
    });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `comm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Clear all data (for testing)
   */
  clearAllData(): void {
    commissionTransactions.clear();
    commissionStructures.clear();
    this.initializeDefaultStructures();
  }
}
