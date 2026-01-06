/**
 * Enrollment Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { Enrollment, EnrollmentStatus } from '@prisma/client';

export interface EnrollmentFactoryOptions {
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate?: Date;
  endDate?: Date | null;
  status?: EnrollmentStatus;
  siblingDiscountApplied?: boolean;
  customFeeOverrideCents?: number | null;
}

/**
 * Create a test enrollment with sensible defaults
 */
export async function createEnrollment(
  prisma: PrismaService,
  opts: EnrollmentFactoryOptions,
): Promise<Enrollment> {
  return prisma.enrollment.create({
    data: {
      tenantId: opts.tenantId,
      childId: opts.childId,
      feeStructureId: opts.feeStructureId,
      startDate: opts.startDate ?? new Date('2025-01-01'),
      endDate: opts.endDate ?? null,
      status: opts.status ?? 'ACTIVE',
      siblingDiscountApplied: opts.siblingDiscountApplied ?? false,
      customFeeOverrideCents: opts.customFeeOverrideCents ?? null,
    },
  });
}

/**
 * Create enrollment with pro-rata start (mid-month)
 */
export async function createMidMonthEnrollment(
  prisma: PrismaService,
  opts: Omit<EnrollmentFactoryOptions, 'startDate'> & {
    year: number;
    month: number;
    day: number;
  },
): Promise<Enrollment> {
  const startDate = new Date(opts.year, opts.month - 1, opts.day);

  return createEnrollment(prisma, {
    ...opts,
    startDate,
  });
}
