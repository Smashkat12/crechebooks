/**
 * Fee Structure Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { FeeStructure, FeeType } from '@prisma/client';
import { generateUniqueId } from '../utils';

export interface FeeStructureFactoryOptions {
  tenantId: string;
  name?: string;
  description?: string;
  feeType?: FeeType;
  amountCents?: number;
  registrationFeeCents?: number;
  vatInclusive?: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  isActive?: boolean;
}

/**
 * Create a test fee structure with sensible defaults
 */
export async function createFeeStructure(
  prisma: PrismaService,
  opts: FeeStructureFactoryOptions,
): Promise<FeeStructure> {
  const uniqueId = generateUniqueId();

  return prisma.feeStructure.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name ?? `Fee-${uniqueId.slice(0, 5)}`,
      description: opts.description ?? null,
      feeType: opts.feeType ?? 'FULL_DAY',
      amountCents: opts.amountCents ?? 300000, // Default R3,000
      registrationFeeCents: opts.registrationFeeCents ?? 0,
      vatInclusive: opts.vatInclusive ?? false,
      effectiveFrom: opts.effectiveFrom ?? new Date('2025-01-01'),
      effectiveTo: opts.effectiveTo ?? null,
      isActive: opts.isActive ?? true,
    },
  });
}

/**
 * Create standard fee structures (Full Day, Half Day, Hourly)
 */
export async function createStandardFeeStructures(
  prisma: PrismaService,
  tenantId: string,
): Promise<{
  fullDay: FeeStructure;
  halfDay: FeeStructure;
  hourly: FeeStructure;
}> {
  const fullDay = await createFeeStructure(prisma, {
    tenantId,
    name: 'Full Day Care',
    feeType: 'FULL_DAY',
    amountCents: 300000, // R3,000
  });

  const halfDay = await createFeeStructure(prisma, {
    tenantId,
    name: 'Half Day Care',
    feeType: 'HALF_DAY',
    amountCents: 200000, // R2,000
  });

  const hourly = await createFeeStructure(prisma, {
    tenantId,
    name: 'Hourly Care',
    feeType: 'HOURLY',
    amountCents: 15000, // R150/hour
  });

  return { fullDay, halfDay, hourly };
}
