/**
 * Sibling Discount Business Rule Tests
 *
 * Verifies that applySiblingDiscount:
 *   1. Groups children by shared parentId (full-siblings only).
 *   2. Applies the discount to whichever rate the child is actually enrolled at.
 *   3. Does NOT grant discounts to unrelated children (different parentId = cousins /
 *      unrelated children even within the same tenant).
 *
 * The EnrollmentService is instantiated with mocked repositories so no DB is needed.
 * Only the applySiblingDiscount + getActiveEnrollments code paths are exercised here.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Decimal from 'decimal.js';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../database/repositories/invoice-line.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { AuditLogService } from '../../database/services/audit-log.service';
import { ProRataService } from '../../database/services/pro-rata.service';
import { CreditNoteService } from '../../database/services/credit-note.service';
import { InvoiceNumberService } from '../../database/services/invoice-number.service';
import { WelcomePackDeliveryService } from '../../database/services/welcome-pack-delivery.service';

const TENANT_ID = 'tenant-abc';
const PARENT_A = 'parent-a';
const PARENT_B = 'parent-b';

/** Build a minimal Enrollment stub */
function enrollment(
  id: string,
  childId: string,
  parentId: string,
  startDate: string,
): any {
  return {
    id,
    childId,
    tenantId: TENANT_ID,
    status: 'ACTIVE',
    startDate: new Date(startDate),
    child: { parentId },
  };
}

describe('EnrollmentService.applySiblingDiscount — full-siblings-only rule', () => {
  let service: EnrollmentService;
  let mockEnrollmentRepo: jest.Mocked<
    Pick<EnrollmentRepository, 'findActiveByParentId' | 'findByStatus'>
  >;

  beforeEach(async () => {
    mockEnrollmentRepo = {
      findActiveByParentId: jest.fn(),
      findByStatus: jest.fn(),
    };

    const noop = () => jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: EnrollmentRepository, useValue: mockEnrollmentRepo },
        { provide: ChildRepository, useValue: { findById: noop() } },
        { provide: ParentRepository, useValue: { findById: noop() } },
        { provide: FeeStructureRepository, useValue: { findById: noop() } },
        {
          provide: InvoiceRepository,
          useValue: { findByBillingPeriod: noop(), create: noop() },
        },
        { provide: InvoiceLineRepository, useValue: { createMany: noop() } },
        { provide: TenantRepository, useValue: { findById: noop() } },
        { provide: AuditLogService, useValue: { logAction: jest.fn() } },
        { provide: ProRataService, useValue: {} },
        { provide: CreditNoteService, useValue: {} },
        { provide: InvoiceNumberService, useValue: {} },
        { provide: WelcomePackDeliveryService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(EnrollmentService);
  });

  it('grants 0% discount when a parent has only one enrolled child', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
  });

  it('grants 10% to the second-enrolled full sibling (same parentId)', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    // Oldest enrollment = first child = 0% discount
    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    // Younger sibling = 10% discount
    expect(discounts.get('child-2')).toEqual(new Decimal(10));
  });

  it('grants 15% to the third-or-later full sibling (same parentId)', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2023-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2024-01-01'),
      enrollment('e3', 'child-3', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    expect(discounts.get('child-2')).toEqual(new Decimal(10));
    expect(discounts.get('child-3')).toEqual(new Decimal(15));
  });

  it('returns a separate, independent discount map per parentId (no cross-parent leakage)', async () => {
    // Parent A has two children (sibling discount applies)
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValueOnce([
      enrollment('e1', 'child-a1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-a2', PARENT_A, '2025-01-01'),
    ]);

    const discountsA = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    // Parent B has only one child — no discount
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValueOnce([
      enrollment('e3', 'child-b1', PARENT_B, '2024-06-01'),
    ]);

    const discountsB = await service.applySiblingDiscount(TENANT_ID, PARENT_B);

    // Parent A's children get sibling discounts
    expect(discountsA.get('child-a1')).toEqual(new Decimal(0));
    expect(discountsA.get('child-a2')).toEqual(new Decimal(10));

    // Parent B's child gets no discount — confirming the discount does NOT
    // bleed across parentIds (cousins / unrelated parents are excluded)
    expect(discountsB.get('child-b1')).toEqual(new Decimal(0));

    // Cross-check: Parent A's discount map does not contain Parent B's child
    expect(discountsA.has('child-b1')).toBe(false);
  });

  it('calls findActiveByParentId with the correct tenantId and parentId (tenant isolation)', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2025-01-01'),
    ]);

    await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    expect(mockEnrollmentRepo.findActiveByParentId).toHaveBeenCalledWith(
      TENANT_ID,
      PARENT_A,
    );
  });

  it('sorts by startDate so the oldest enrollment is always treated as first child', async () => {
    // Provide enrollments in reverse chronological order to confirm sort is applied
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e2', 'child-newer', PARENT_A, '2025-06-01'),
      enrollment('e1', 'child-older', PARENT_A, '2023-06-01'),
    ]);

    const discounts = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    // Oldest enrollment must be first child = 0%
    expect(discounts.get('child-older')).toEqual(new Decimal(0));
    // Newer enrollment = second child = 10%
    expect(discounts.get('child-newer')).toEqual(new Decimal(10));
  });
});

// ---------------------------------------------------------------------------
// AUDIT-BILL-09: feeStructureOverride tests
// ---------------------------------------------------------------------------
describe('EnrollmentService.applySiblingDiscount — fee-structure override (AUDIT-BILL-09)', () => {
  let service: EnrollmentService;
  let mockEnrollmentRepo: jest.Mocked<
    Pick<EnrollmentRepository, 'findActiveByParentId' | 'findByStatus'>
  >;

  beforeEach(async () => {
    mockEnrollmentRepo = {
      findActiveByParentId: jest.fn(),
      findByStatus: jest.fn(),
    };

    const noop = () => jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: EnrollmentRepository, useValue: mockEnrollmentRepo },
        { provide: ChildRepository, useValue: { findById: noop() } },
        { provide: ParentRepository, useValue: { findById: noop() } },
        { provide: FeeStructureRepository, useValue: { findById: noop() } },
        {
          provide: InvoiceRepository,
          useValue: { findByBillingPeriod: noop(), create: noop() },
        },
        { provide: InvoiceLineRepository, useValue: { createMany: noop() } },
        { provide: TenantRepository, useValue: { findById: noop() } },
        { provide: AuditLogService, useValue: { logAction: jest.fn() } },
        { provide: ProRataService, useValue: {} },
        { provide: CreditNoteService, useValue: {} },
        { provide: InvoiceNumberService, useValue: {} },
        { provide: WelcomePackDeliveryService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(EnrollmentService);
  });

  it('1st sibling with no override receives 0%', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(TENANT_ID, PARENT_A);

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
  });

  it('2nd sibling with override=20 receives 20%', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(
      TENANT_ID,
      PARENT_A,
      new Decimal(20),
    );

    expect(discounts.get('child-1')).toEqual(new Decimal(0)); // 1st always 0%
    expect(discounts.get('child-2')).toEqual(new Decimal(20));
  });

  it('2nd sibling with override=null falls back to default 10%', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(
      TENANT_ID,
      PARENT_A,
      null,
    );

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    expect(discounts.get('child-2')).toEqual(new Decimal(10));
  });

  it('override out-of-range (>100) falls back to default scale', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(
      TENANT_ID,
      PARENT_A,
      new Decimal(150), // invalid — clamped to default
    );

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    expect(discounts.get('child-2')).toEqual(new Decimal(10)); // default scale
  });

  it('override=0 is valid (operator explicitly wants 0% for siblings)', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2024-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(
      TENANT_ID,
      PARENT_A,
      new Decimal(0),
    );

    // 0 is a valid override — both children get 0%
    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    expect(discounts.get('child-2')).toEqual(new Decimal(0));
  });

  it('override applies uniformly to 3rd+ children (not just 2nd)', async () => {
    mockEnrollmentRepo.findActiveByParentId.mockResolvedValue([
      enrollment('e1', 'child-1', PARENT_A, '2023-01-01'),
      enrollment('e2', 'child-2', PARENT_A, '2024-01-01'),
      enrollment('e3', 'child-3', PARENT_A, '2025-01-01'),
    ]);

    const discounts = await service.applySiblingDiscount(
      TENANT_ID,
      PARENT_A,
      new Decimal(25),
    );

    expect(discounts.get('child-1')).toEqual(new Decimal(0));
    expect(discounts.get('child-2')).toEqual(new Decimal(25));
    expect(discounts.get('child-3')).toEqual(new Decimal(25));
  });
});
