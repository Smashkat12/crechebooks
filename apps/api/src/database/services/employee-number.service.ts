/**
 * Employee Number Service
 * TASK-ACCT-011: Atomic Employee Number Generation
 *
 * @module database/services/employee-number
 * @description Provides atomic employee number generation using PostgreSQL
 * INSERT...ON CONFLICT...RETURNING pattern to prevent race conditions in
 * concurrent staff creation.
 *
 * Follows the same pattern as InvoiceNumberService (TASK-BILL-041).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeeNumberService {
  private readonly logger = new Logger(EmployeeNumberService.name);

  /** Employee number format prefix */
  private readonly PREFIX = 'EMP';

  /** Padding for sequence number (minimum digits) */
  private readonly PADDING = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next employee number atomically.
   *
   * Uses PostgreSQL INSERT...ON CONFLICT...RETURNING pattern to atomically
   * increment the counter and return the new value in a single operation.
   *
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the employee number (e.g., 2026)
   * @param tx - Optional transaction client
   * @returns Formatted employee number (e.g., "EMP-2026-001")
   */
  async generateNextNumber(
    tenantId: string,
    year?: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const targetYear = year ?? new Date().getFullYear();
    const client = tx ?? this.prisma;

    const result = await client.$queryRaw<[{ current_value: number }]>`
      INSERT INTO employee_number_counters (tenant_id, year, current_value, created_at, updated_at)
      VALUES (${tenantId}, ${targetYear}, 1, NOW(), NOW())
      ON CONFLICT (tenant_id, year)
      DO UPDATE SET
        current_value = employee_number_counters.current_value + 1,
        updated_at = NOW()
      RETURNING current_value
    `;

    const sequential = result[0].current_value;

    this.logger.debug(
      `TASK-ACCT-011: Atomic counter returned sequential ${sequential} for tenant ${tenantId}, year ${targetYear}`,
    );

    return this.formatEmployeeNumber(targetYear, sequential);
  }

  /**
   * Format an employee number from year and sequence.
   *
   * @param year - Year (e.g., 2026)
   * @param sequential - Sequential number (e.g., 1, 42, 999)
   * @returns Formatted employee number (e.g., "EMP-2026-001")
   */
  formatEmployeeNumber(year: number, sequential: number): string {
    const sequentialPadded = sequential
      .toString()
      .padStart(this.PADDING, '0');
    return `${this.PREFIX}-${year}-${sequentialPadded}`;
  }

  /**
   * Get current counter value for a tenant/year.
   *
   * @param tenantId - Tenant ID
   * @param year - Year
   * @returns Current counter value (0 if no employees yet)
   */
  async getCurrentValue(tenantId: string, year: number): Promise<number> {
    const counter = await this.prisma.employeeNumberCounter.findUnique({
      where: {
        tenantId_year: { tenantId, year },
      },
    });
    return counter?.currentValue ?? 0;
  }
}
