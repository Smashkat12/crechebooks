/**
 * ChildController — AUDIT-BILL-08 fee-type guard tests
 *
 * Verifies that enrollChild and enrollExistingChild both throw
 * BadRequestException when a fee structure with an unsupported feeType
 * (HALF_DAY, HOURLY, CUSTOM) is supplied, and pass through for FULL_DAY.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChildController } from './child.controller';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { InvoiceGenerationService } from '../../database/services/invoice-generation.service';
import { WelcomePackDeliveryService } from '../../database/services/welcome-pack-delivery.service';
import { FeeType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CHILD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const FEE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockUser = {
  id: 'user-1',
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
};

const mockParent = {
  id: PARENT_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@test.com',
  phone: '0821234567',
  deletedAt: null,
};

const mockChild = {
  id: CHILD_ID,
  tenantId: TENANT_ID,
  parentId: PARENT_ID,
  firstName: 'Leo',
  lastName: 'Smith',
  dateOfBirth: new Date('2020-01-01'),
  status: 'ENROLLED',
  deletedAt: null,
};

function makeFeeStructure(feeType: FeeType) {
  return {
    id: FEE_ID,
    tenantId: TENANT_ID,
    name: 'Test Fee',
    feeType,
    amountCents: 50000,
    registrationFeeCents: 0,
    reRegistrationFeeCents: 0,
    vatInclusive: false,
    isActive: true,
    effectiveFrom: new Date('2025-01-01'),
    effectiveTo: null,
    siblingDiscountPercent: null,
    deletedAt: null,
  };
}

const enrollChildDto = {
  parent_id: PARENT_ID,
  fee_structure_id: FEE_ID,
  first_name: 'Leo',
  last_name: 'Smith',
  date_of_birth: '2020-01-01',
  gender: 'MALE',
  start_date: '2025-03-01',
  medical_notes: null,
  emergency_contact: null,
  emergency_phone: null,
};

const enrollExistingDto = {
  child_id: CHILD_ID,
  fee_structure_id: FEE_ID,
  start_date: '2025-03-01',
};

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
function buildModule(feeType: FeeType): Promise<ChildController> {
  const feeStructure = makeFeeStructure(feeType);

  const childRepoStub = {
    create: jest.fn().mockResolvedValue(mockChild),
    findById: jest.fn().mockResolvedValue(mockChild),
    update: jest.fn().mockResolvedValue(mockChild),
    findByTenant: jest.fn().mockResolvedValue([]),
  };

  const parentRepoStub = {
    findById: jest.fn().mockResolvedValue(mockParent),
  };

  const feeRepoStub = {
    findById: jest.fn().mockResolvedValue(feeStructure),
  };

  const enrollmentRepoStub = {
    findById: jest.fn().mockResolvedValue(null),
    findActiveByChild: jest.fn().mockResolvedValue(null),
  };

  const enrollmentServiceStub = {
    enrollChild: jest.fn().mockResolvedValue({
      enrollment: {
        id: 'enroll-1',
        childId: CHILD_ID,
        feeStructureId: FEE_ID,
        startDate: new Date(),
        endDate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      invoice: null,
      invoiceError: null,
      welcomePackSent: false,
      welcomePackError: null,
    }),
  };

  const invoiceGenStub = {
    generateCatchUpInvoices: jest
      .fn()
      .mockResolvedValue({ generated: 0, skipped: 0, errors: [] }),
  };

  const welcomePackStub = {
    sendWelcomePack: jest.fn().mockResolvedValue({ success: true }),
  };

  return Test.createTestingModule({
    controllers: [ChildController],
    providers: [
      { provide: ChildRepository, useValue: childRepoStub },
      { provide: ParentRepository, useValue: parentRepoStub },
      { provide: FeeStructureRepository, useValue: feeRepoStub },
      { provide: EnrollmentRepository, useValue: enrollmentRepoStub },
      { provide: EnrollmentService, useValue: enrollmentServiceStub },
      { provide: InvoiceGenerationService, useValue: invoiceGenStub },
      { provide: WelcomePackDeliveryService, useValue: welcomePackStub },
    ],
  })
    .compile()
    .then((m: TestingModule) => m.get(ChildController));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ChildController — AUDIT-BILL-08 feeType guard', () => {
  describe('enrollChild (POST /children)', () => {
    it('accepts FULL_DAY fee structure without throwing', async () => {
      const controller = await buildModule(FeeType.FULL_DAY);
      await expect(
        controller.enrollChild(enrollChildDto as any, mockUser as any),
      ).resolves.toBeDefined();
    });

    it('rejects HALF_DAY fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.HALF_DAY);
      await expect(
        controller.enrollChild(enrollChildDto as any, mockUser as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects HOURLY fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.HOURLY);
      await expect(
        controller.enrollChild(enrollChildDto as any, mockUser as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects CUSTOM fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.CUSTOM);
      await expect(
        controller.enrollChild(enrollChildDto as any, mockUser as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BadRequestException message names the unsupported feeType', async () => {
      const controller = await buildModule(FeeType.HOURLY);
      await expect(
        controller.enrollChild(enrollChildDto as any, mockUser as any),
      ).rejects.toMatchObject({
        message: expect.stringContaining('HOURLY'),
      });
    });
  });

  describe('enrollExistingChild (POST /children/:id/enroll)', () => {
    it('accepts FULL_DAY fee structure without throwing', async () => {
      const controller = await buildModule(FeeType.FULL_DAY);
      await expect(
        controller.enrollExistingChild(
          enrollExistingDto as any,
          mockUser as any,
        ),
      ).resolves.toBeDefined();
    });

    it('rejects HALF_DAY fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.HALF_DAY);
      await expect(
        controller.enrollExistingChild(
          enrollExistingDto as any,
          mockUser as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects HOURLY fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.HOURLY);
      await expect(
        controller.enrollExistingChild(
          enrollExistingDto as any,
          mockUser as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects CUSTOM fee structure with BadRequestException', async () => {
      const controller = await buildModule(FeeType.CUSTOM);
      await expect(
        controller.enrollExistingChild(
          enrollExistingDto as any,
          mockUser as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BadRequestException message names the unsupported feeType', async () => {
      const controller = await buildModule(FeeType.HALF_DAY);
      await expect(
        controller.enrollExistingChild(
          enrollExistingDto as any,
          mockUser as any,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('HALF_DAY'),
      });
    });
  });
});
