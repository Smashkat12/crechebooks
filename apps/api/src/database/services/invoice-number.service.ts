/**
 * Invoice Number Service
 * TASK-BILL-003 / TASK-BILL-041: Atomic Invoice Number Generation
 *
 * @module database/services/invoice-number
 * @description Provides atomic invoice number generation using PostgreSQL
 * UPDATE...RETURNING pattern to prevent race conditions in concurrent
 * invoice creation.
 *
 * CRITICAL: This service MUST be used for ALL invoice number generation.
 * DO NOT use SELECT MAX() + 1 pattern - it causes duplicate invoice numbers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationException } from '../../shared/exceptions';

/**
 * Result of reserving invoice numbers
 */
export interface InvoiceNumberReservation {
  /** Starting sequence number (inclusive) */
  startSequence: number;
  /** Ending sequence number (inclusive) */
  endSequence: number;
  /** Array of formatted invoice numbers */
  invoiceNumbers: string[];
}

@Injectable()
export class InvoiceNumberService {
  private readonly logger = new Logger(InvoiceNumberService.name);

  /** Invoice number format prefix */
  private readonly PREFIX = 'INV';

  /** Padding for sequence number (minimum digits) */
  private readonly PADDING = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next invoice number atomically
   *
   * Uses PostgreSQL INSERT...ON CONFLICT...RETURNING pattern to atomically
   * increment the counter and return the new value in a single operation.
   * This prevents race conditions where concurrent requests could get the
   * same invoice number.
   *
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the invoice (e.g., 2026)
   * @param tx - Optional transaction client for batch operations
   * @returns Formatted invoice number (e.g., "INV-2026-001")
   *
   * @example
   * ```typescript
   * // Single invoice generation
   * const invoiceNumber = await invoiceNumberService.generateNextNumber(tenantId, 2026);
   * // Returns: "INV-2026-001"
   *
   * // Within a transaction
   * await prisma.$transaction(async (tx) => {
   *   const invoiceNumber = await invoiceNumberService.generateNextNumber(tenantId, 2026, tx);
   *   // Use invoiceNumber in the same transaction
   * });
   * ```
   */
  async generateNextNumber(
    tenantId: string,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;

    // TASK-BILL-003: Use atomic counter increment via raw SQL
    // INSERT creates row if not exists, ON CONFLICT increments existing
    // RETURNING gives us the new value in a single atomic operation
    const result = await client.$queryRaw<[{ current_value: number }]>`
      INSERT INTO invoice_number_counters (tenant_id, year, current_value, created_at, updated_at)
      VALUES (${tenantId}::uuid, ${year}, 1, NOW(), NOW())
      ON CONFLICT (tenant_id, year)
      DO UPDATE SET
        current_value = invoice_number_counters.current_value + 1,
        updated_at = NOW()
      RETURNING current_value
    `;

    const sequential = result[0].current_value;

    this.logger.debug(
      `TASK-BILL-003: Atomic counter returned sequential ${sequential} for tenant ${tenantId}, year ${year}`,
    );

    return this.formatInvoiceNumber(year, sequential);
  }

  /**
   * Reserve a batch of invoice numbers atomically
   *
   * Atomically increments the counter by the specified count and returns
   * the range of reserved sequence numbers. This is useful for batch
   * invoice generation where multiple invoices need to be created together.
   *
   * The reservation is atomic - no other request can get overlapping numbers.
   * Gaps in sequences are acceptable (e.g., if a transaction rolls back).
   *
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the invoice numbering
   * @param count - Number of invoice numbers to reserve (must be positive)
   * @param tx - Optional transaction client for batch operations
   * @returns Reservation with start/end sequences and formatted numbers
   *
   * @throws ValidationException if count is not positive
   *
   * @example
   * ```typescript
   * // Reserve 5 invoice numbers
   * const reservation = await invoiceNumberService.reserveNumbers(tenantId, 2026, 5);
   * // Returns: {
   * //   startSequence: 10,
   * //   endSequence: 14,
   * //   invoiceNumbers: ["INV-2026-010", "INV-2026-011", ..., "INV-2026-014"]
   * // }
   * ```
   */
  async reserveNumbers(
    tenantId: string,
    year: number,
    count: number,
    tx?: Prisma.TransactionClient,
  ): Promise<InvoiceNumberReservation> {
    if (count <= 0) {
      throw new ValidationException('Count must be positive', [
        {
          field: 'count',
          message: `Expected positive number, got ${count}`,
          value: count,
        },
      ]);
    }

    const client = tx ?? this.prisma;

    // TASK-BILL-003: Atomically increment counter by count and return the END value
    // Then calculate start value as (end - count + 1)
    const result = await client.$queryRaw<[{ current_value: number }]>`
      INSERT INTO invoice_number_counters (tenant_id, year, current_value, created_at, updated_at)
      VALUES (${tenantId}::uuid, ${year}, ${count}, NOW(), NOW())
      ON CONFLICT (tenant_id, year)
      DO UPDATE SET
        current_value = invoice_number_counters.current_value + ${count},
        updated_at = NOW()
      RETURNING current_value
    `;

    const endSequence = result[0].current_value;
    const startSequence = endSequence - count + 1;

    // Generate all invoice numbers in the range
    const invoiceNumbers: string[] = [];
    for (let seq = startSequence; seq <= endSequence; seq++) {
      invoiceNumbers.push(this.formatInvoiceNumber(year, seq));
    }

    this.logger.debug(
      `TASK-BILL-003: Reserved ${count} invoice numbers (${startSequence}-${endSequence}) for tenant ${tenantId}, year ${year}`,
    );

    return {
      startSequence,
      endSequence,
      invoiceNumbers,
    };
  }

  /**
   * Peek at the next invoice sequence number without incrementing
   *
   * This is useful for previews or estimates. The actual number generated
   * may be different if other invoices are created before this one.
   *
   * WARNING: Do NOT use this for actual invoice creation. Always use
   * generateNextNumber() or reserveNumbers() for real invoices.
   *
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the invoice numbering
   * @returns Next sequence number that would be generated
   *
   * @example
   * ```typescript
   * const nextSeq = await invoiceNumberService.peekNextSequential(tenantId, 2026);
   * console.log(`Next invoice would be: INV-2026-${nextSeq.toString().padStart(3, '0')}`);
   * ```
   */
  async peekNextSequential(tenantId: string, year: number): Promise<number> {
    const counter = await this.prisma.invoiceNumberCounter.findUnique({
      where: {
        tenantId_year: { tenantId, year },
      },
    });

    return (counter?.currentValue ?? 0) + 1;
  }

  /**
   * Format an invoice number from year and sequence
   *
   * @param year - Year for the invoice (e.g., 2026)
   * @param sequential - Sequential number (e.g., 1, 42, 999)
   * @returns Formatted invoice number (e.g., "INV-2026-001")
   */
  formatInvoiceNumber(year: number, sequential: number): string {
    const sequentialPadded = sequential.toString().padStart(this.PADDING, '0');
    return `${this.PREFIX}-${year}-${sequentialPadded}`;
  }

  /**
   * Parse an invoice number to extract year and sequence
   *
   * @param invoiceNumber - Invoice number to parse (e.g., "INV-2026-001")
   * @returns Parsed components or null if invalid format
   */
  parseInvoiceNumber(
    invoiceNumber: string,
  ): { year: number; sequence: number } | null {
    const match = invoiceNumber.match(/^INV-(\d{4})-(\d+)$/);
    if (!match) {
      return null;
    }
    return {
      year: parseInt(match[1], 10),
      sequence: parseInt(match[2], 10),
    };
  }

  /**
   * Get current counter value for a tenant/year
   *
   * @param tenantId - Tenant ID
   * @param year - Year
   * @returns Current counter value (0 if no invoices yet)
   */
  async getCurrentValue(tenantId: string, year: number): Promise<number> {
    const counter = await this.prisma.invoiceNumberCounter.findUnique({
      where: {
        tenantId_year: { tenantId, year },
      },
    });
    return counter?.currentValue ?? 0;
  }
}
