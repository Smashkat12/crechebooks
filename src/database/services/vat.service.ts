/**
 * VatService - VAT Calculation Service
 * TASK-SARS-011
 *
 * Handles all Value-Added Tax calculations for South African SARS compliance.
 * - Output VAT: Tax collected on sales/invoices
 * - Input VAT: Tax paid on purchases/expenses (claimable)
 * - Zero-rated: 0% VAT but input VAT is claimable
 * - Exempt: 0% VAT and input VAT is NOT claimable
 *
 * Current SA VAT rate: 15%
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { VatType, TransactionStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  VatCalculationResult,
  VatFlaggedItem,
  VatValidationResult,
} from '../dto/vat.dto';
import {
  VAT_CONSTANTS,
  ZERO_RATED_ACCOUNTS,
  EXEMPT_ACCOUNTS,
  ZERO_RATED_KEYWORDS,
  EXEMPT_KEYWORDS,
} from '../constants/vat.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class VatService {
  private readonly logger = new Logger(VatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate output VAT (VAT collected on sales) for a period
   * Uses invoices within the specified date range
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Start of VAT period (inclusive)
   * @param periodEnd - End of VAT period (inclusive)
   * @returns VAT calculation result with breakdown
   */
  async calculateOutputVat(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<VatCalculationResult> {
    this.logger.log(
      `Calculating output VAT for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate inputs
    if (!tenantId) {
      throw new Error('VAT calculation failed: tenantId is required');
    }
    if (periodStart > periodEnd) {
      throw new Error(
        'VAT calculation failed: periodStart must be before periodEnd',
      );
    }

    // Get invoices for the period (exclude DRAFT and VOID)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issueDate: {
          gte: periodStart,
          lte: periodEnd,
        },
        status: {
          notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOID],
        },
        isDeleted: false,
      },
      include: {
        lines: true,
      },
    });

    // Initialize totals using Decimal.js
    let totalExcluding = new Decimal(0);
    let totalVat = new Decimal(0);
    let standardRated = new Decimal(0);
    let zeroRated = new Decimal(0);
    let exempt = new Decimal(0);

    for (const invoice of invoices) {
      const subtotal = new Decimal(invoice.subtotalCents);
      const vat = new Decimal(invoice.vatCents);

      totalExcluding = totalExcluding.plus(subtotal);
      totalVat = totalVat.plus(vat);

      // Classify the invoice
      // For simplicity, if invoice has VAT, it's standard-rated
      if (invoice.vatCents > 0) {
        standardRated = standardRated.plus(subtotal);
      } else {
        // Check lines for zero-rated vs exempt
        const hasZeroRatedLine = invoice.lines.some((line) =>
          this.isZeroRatedAccount(line.accountCode || ''),
        );
        if (hasZeroRatedLine) {
          zeroRated = zeroRated.plus(subtotal);
        } else {
          exempt = exempt.plus(subtotal);
        }
      }
    }

    const totalIncluding = totalExcluding.plus(totalVat);

    return {
      totalExcludingVatCents: totalExcluding.round().toNumber(),
      vatAmountCents: totalVat.round().toNumber(),
      totalIncludingVatCents: totalIncluding.round().toNumber(),
      standardRatedCents: standardRated.round().toNumber(),
      zeroRatedCents: zeroRated.round().toNumber(),
      exemptCents: exempt.round().toNumber(),
      itemCount: invoices.length,
    };
  }

  /**
   * Calculate input VAT (VAT paid on purchases) for a period
   * Uses categorized expense transactions within the specified date range
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Start of VAT period (inclusive)
   * @param periodEnd - End of VAT period (inclusive)
   * @returns VAT calculation result with breakdown
   */
  async calculateInputVat(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<VatCalculationResult> {
    this.logger.log(
      `Calculating input VAT for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate inputs
    if (!tenantId) {
      throw new Error('VAT calculation failed: tenantId is required');
    }
    if (periodStart > periodEnd) {
      throw new Error(
        'VAT calculation failed: periodStart must be before periodEnd',
      );
    }

    // Get expense transactions (isCredit = false) that are categorized
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
        isCredit: false, // Expenses only
        status: TransactionStatus.CATEGORIZED,
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    // Initialize totals using Decimal.js
    let totalExcluding = new Decimal(0);
    let totalVat = new Decimal(0);
    let standardRated = new Decimal(0);
    let zeroRated = new Decimal(0);
    let exempt = new Decimal(0);

    for (const transaction of transactions) {
      // Get the primary categorization (first one)
      const categorization = transaction.categorizations[0];
      if (!categorization) continue;

      const amountCents = new Decimal(transaction.amountCents);
      const vatType = categorization.vatType;
      const vatAmountCents = categorization.vatAmountCents
        ? new Decimal(categorization.vatAmountCents)
        : new Decimal(0);

      // Calculate exclusive amount
      let exclusiveAmount: Decimal;
      if (vatAmountCents.greaterThan(0)) {
        exclusiveAmount = amountCents.minus(vatAmountCents);
      } else if (vatType === VatType.STANDARD) {
        // Extract VAT from inclusive amount
        exclusiveAmount = this.extractExclusiveFromInclusive(amountCents);
        totalVat = totalVat.plus(amountCents.minus(exclusiveAmount));
      } else {
        exclusiveAmount = amountCents;
      }

      totalExcluding = totalExcluding.plus(exclusiveAmount);

      if (vatAmountCents.greaterThan(0)) {
        totalVat = totalVat.plus(vatAmountCents);
      }

      // Classify by VAT type
      switch (vatType) {
        case VatType.STANDARD:
          standardRated = standardRated.plus(exclusiveAmount);
          break;
        case VatType.ZERO_RATED:
          zeroRated = zeroRated.plus(exclusiveAmount);
          break;
        case VatType.EXEMPT:
        case VatType.NO_VAT:
          exempt = exempt.plus(exclusiveAmount);
          break;
      }
    }

    const totalIncluding = totalExcluding.plus(totalVat);

    return {
      totalExcludingVatCents: totalExcluding.round().toNumber(),
      vatAmountCents: totalVat.round().toNumber(),
      totalIncludingVatCents: totalIncluding.round().toNumber(),
      standardRatedCents: standardRated.round().toNumber(),
      zeroRatedCents: zeroRated.round().toNumber(),
      exemptCents: exempt.round().toNumber(),
      itemCount: transactions.length,
    };
  }

  /**
   * Classify the VAT type based on account code and description
   *
   * @param accountCode - Accounting code
   * @param description - Transaction/item description
   * @param supplierVatNumber - Supplier's VAT number (optional)
   * @returns Classified VAT type
   */
  classifyVatType(
    accountCode: string,
    description: string,
    supplierVatNumber?: string,
  ): VatType {
    // Check account code first (most reliable)
    if (this.isZeroRatedAccount(accountCode)) {
      return VatType.ZERO_RATED;
    }
    if (this.isExemptAccount(accountCode)) {
      return VatType.EXEMPT;
    }

    // Check description keywords
    const lowerDescription = description.toLowerCase();

    if (ZERO_RATED_KEYWORDS.some((kw) => lowerDescription.includes(kw))) {
      return VatType.ZERO_RATED;
    }
    if (EXEMPT_KEYWORDS.some((kw) => lowerDescription.includes(kw))) {
      return VatType.EXEMPT;
    }

    // If no supplier VAT number, can't claim input VAT
    if (!supplierVatNumber || supplierVatNumber.trim() === '') {
      return VatType.NO_VAT;
    }

    // Default to standard-rated if supplier has valid VAT number
    return VatType.STANDARD;
  }

  /**
   * Validate VAT details for an item
   *
   * @param item - Transaction or invoice-like object
   * @returns Validation result with errors and warnings
   */
  validateVatDetails(item: {
    amountCents: number;
    vatCents?: number;
    vatType?: VatType;
    supplierVatNumber?: string;
    supplierName?: string;
    isExpense?: boolean;
  }): VatValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // For expenses (input VAT claims)
    if (item.isExpense) {
      // VAT number required for claims > R5000
      if (
        item.amountCents > VAT_CONSTANTS.VAT_NUMBER_REQUIRED_THRESHOLD_CENTS
      ) {
        if (
          !item.supplierVatNumber ||
          !VAT_CONSTANTS.VAT_NUMBER_REGEX.test(item.supplierVatNumber)
        ) {
          errors.push(
            'Supplier VAT number required for expenses exceeding R5,000',
          );
        }
      }

      // Supplier name recommended for > R2000
      if (
        item.amountCents > VAT_CONSTANTS.SUPPLIER_NAME_WARNING_THRESHOLD_CENTS
      ) {
        if (!item.supplierName || item.supplierName.trim() === '') {
          warnings.push(
            'Supplier name recommended for expenses exceeding R2,000',
          );
        }
      }
    }

    // For invoices (output VAT)
    if (!item.isExpense) {
      // Standard-rated should have VAT
      if (
        item.vatType === VatType.STANDARD &&
        (!item.vatCents || item.vatCents === 0)
      ) {
        errors.push('Missing VAT on standard-rated invoice');
      }

      // Verify VAT calculation if both values present
      if (item.vatCents !== undefined && item.vatCents > 0) {
        const expectedVat = this.calculateVatFromExclusive(
          new Decimal(item.amountCents - item.vatCents),
        );
        const actualVat = new Decimal(item.vatCents);
        const tolerance = new Decimal(1); // 1 cent tolerance

        if (expectedVat.minus(actualVat).abs().greaterThan(tolerance)) {
          warnings.push(
            `VAT calculation may be incorrect: expected ${expectedVat.toNumber()} cents, got ${item.vatCents} cents`,
          );
        }
      }
    }

    // Validate VAT number format if provided
    if (
      item.supplierVatNumber &&
      !VAT_CONSTANTS.VAT_NUMBER_REGEX.test(item.supplierVatNumber)
    ) {
      errors.push('Invalid VAT number format (must be 10 digits)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get items flagged for VAT compliance issues
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Start of period
   * @param periodEnd - End of period
   * @returns Array of flagged items
   */
  async getFlaggedItems(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<VatFlaggedItem[]> {
    this.logger.log(
      `Getting flagged VAT items for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    const flaggedItems: VatFlaggedItem[] = [];

    // Get expense transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
        isCredit: false,
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    for (const transaction of transactions) {
      const categorization = transaction.categorizations[0];

      // Check for missing VAT number on large expenses
      if (
        transaction.amountCents >
        VAT_CONSTANTS.VAT_NUMBER_REQUIRED_THRESHOLD_CENTS
      ) {
        // We don't have supplier VAT number on transactions currently
        // Flag as needing review
        flaggedItems.push({
          transactionId: transaction.id,
          description: transaction.description,
          issue:
            'Expense > R5,000 requires supplier VAT number for input VAT claim',
          amountCents: transaction.amountCents,
          severity: 'ERROR',
        });
      }

      // Check for uncategorized transactions
      if (
        !categorization &&
        transaction.status !== TransactionStatus.CATEGORIZED
      ) {
        flaggedItems.push({
          transactionId: transaction.id,
          description: transaction.description,
          issue: 'Transaction not categorized - VAT type unknown',
          amountCents: transaction.amountCents,
          severity: 'WARNING',
        });
      }
    }

    // Get invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issueDate: {
          gte: periodStart,
          lte: periodEnd,
        },
        status: {
          notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOID],
        },
        isDeleted: false,
      },
    });

    for (const invoice of invoices) {
      // Check if total = subtotal + VAT
      const expectedTotal = new Decimal(invoice.subtotalCents).plus(
        invoice.vatCents,
      );
      if (expectedTotal.toNumber() !== invoice.totalCents) {
        flaggedItems.push({
          invoiceId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber}`,
          issue: 'Invoice total does not equal subtotal + VAT',
          amountCents: invoice.totalCents,
          severity: 'ERROR',
        });
      }

      // Warn about zero VAT on non-zero invoices (might be intentional)
      if (invoice.subtotalCents > 0 && invoice.vatCents === 0) {
        flaggedItems.push({
          invoiceId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber}`,
          issue: 'Invoice has no VAT - confirm if zero-rated or exempt',
          amountCents: invoice.subtotalCents,
          severity: 'WARNING',
        });
      }
    }

    return flaggedItems;
  }

  /**
   * Calculate VAT amount from exclusive amount
   * VAT = exclusive * 0.15
   */
  calculateVatFromExclusive(exclusiveAmount: Decimal): Decimal {
    return exclusiveAmount.mul(VAT_CONSTANTS.VAT_RATE).round();
  }

  /**
   * Extract exclusive amount from VAT-inclusive amount
   * Exclusive = inclusive / 1.15
   */
  extractExclusiveFromInclusive(inclusiveAmount: Decimal): Decimal {
    return inclusiveAmount.div(VAT_CONSTANTS.VAT_DIVISOR).round();
  }

  /**
   * Extract VAT from VAT-inclusive amount
   * VAT = inclusive - (inclusive / 1.15)
   */
  extractVatFromInclusive(inclusiveAmount: Decimal): Decimal {
    const exclusive = this.extractExclusiveFromInclusive(inclusiveAmount);
    return inclusiveAmount.minus(exclusive);
  }

  /**
   * Check if account code is zero-rated
   */
  private isZeroRatedAccount(accountCode: string): boolean {
    return ZERO_RATED_ACCOUNTS.includes(accountCode);
  }

  /**
   * Check if account code is exempt
   */
  private isExemptAccount(accountCode: string): boolean {
    return EXEMPT_ACCOUNTS.includes(accountCode);
  }
}
