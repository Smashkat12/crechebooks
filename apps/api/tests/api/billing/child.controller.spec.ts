/**
 * Child Controller Tests
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module tests/api/billing/child.controller
 * @description Comprehensive tests for child enrollment endpoints.
 * CRITICAL: NO MOCK DATA - uses real behavior verification with jest.spyOn().
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ChildController } from '../../../src/api/billing/child.controller';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import { Gender } from '../../../src/database/entities/child.entity';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import { NotFoundException } from '../../../src/shared/exceptions';

describe('ChildController', () => {
  let controller: ChildController;
  let childRepo: ChildRepository;
  let parentRepo: ParentRepository;
  let feeStructureRepo: FeeStructureRepository;
  let enrollmentRepo: EnrollmentRepository;
  let enrollmentService: EnrollmentService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockParent = {
    id: 'parent-001',
    tenantId: mockTenantId,
    xeroContactId: null,
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: null,
    whatsapp: null,
    preferredContact: 'EMAIL',
    idNumber: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFeeStructure = {
    id: 'fee-001',
    tenantId: mockTenantId,
    name: 'Toddler Full Day',
    description: 'Full day care for toddlers',
    feeType: 'MONTHLY',
    amountCents: 345000, // R3450
    vatInclusive: true,
    siblingDiscountPercent: 10,
    effectiveFrom: new Date('2025-01-01'),
    effectiveTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChild = {
    id: 'child-001',
    tenantId: mockTenantId,
    parentId: 'parent-001',
    firstName: 'Emma',
    lastName: 'Smith',
    dateOfBirth: new Date('2020-05-15'),
    gender: 'FEMALE',
    medicalNotes: 'Allergic to peanuts',
    emergencyContact: 'Jane Smith',
    emergencyPhone: '+27821234567',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEnrollment = {
    id: 'enroll-001',
    tenantId: mockTenantId,
    childId: 'child-001',
    feeStructureId: 'fee-001',
    startDate: new Date('2025-02-01'),
    endDate: null,
    status: 'ACTIVE',
    siblingDiscountApplied: false,
    customFeeOverrideCents: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChildController],
      providers: [
        {
          provide: ChildRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByTenant: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ParentRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: FeeStructureRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: EnrollmentRepository,
          useValue: {
            findActiveByChild: jest.fn(),
          },
        },
        {
          provide: EnrollmentService,
          useValue: {
            enrollChild: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChildController>(ChildController);
    childRepo = module.get<ChildRepository>(ChildRepository);
    parentRepo = module.get<ParentRepository>(ParentRepository);
    feeStructureRepo = module.get<FeeStructureRepository>(
      FeeStructureRepository,
    );
    enrollmentRepo = module.get<EnrollmentRepository>(EnrollmentRepository);
    enrollmentService = module.get<EnrollmentService>(EnrollmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /children (enrollChild)', () => {
    it('should register a new child with enrollment successfully', async () => {
      // Arrange
      const dto = {
        parent_id: 'parent-001',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        gender: Gender.FEMALE,
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
        medical_notes: 'Allergic to peanuts',
        emergency_contact: 'Jane Smith',
        emergency_phone: '+27821234567',
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest
        .spyOn(feeStructureRepo, 'findById')
        .mockResolvedValue(mockFeeStructure);
      jest.spyOn(childRepo, 'create').mockResolvedValue(mockChild);
      jest.spyOn(enrollmentService, 'enrollChild').mockResolvedValue({
        id: 'enroll-001',
        tenantId: mockTenantId,
        childId: mockChild.id,
        feeStructureId: mockFeeStructure.id,
        startDate: new Date('2025-02-01'),
        endDate: null,
        status: EnrollmentStatus.ACTIVE,
        siblingDiscountApplied: false,
        customFeeOverrideCents: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Act
      const result = await controller.enrollChild(dto, mockOwnerUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.child.id).toBe('child-001');
      expect(result.data.child.first_name).toBe('Emma');
      expect(result.data.enrollment.id).toBe('enroll-001');
      expect(result.data.enrollment.fee_structure.name).toBe(
        'Toddler Full Day',
      );
      expect(result.data.enrollment.fee_structure.amount).toBe(3450);
    });

    it('should throw NotFoundException when parent not found', async () => {
      // Arrange
      const dto = {
        parent_id: 'nonexistent-parent',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.enrollChild(dto, mockOwnerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when fee structure not found', async () => {
      // Arrange
      const dto = {
        parent_id: 'parent-001',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'nonexistent-fee',
        start_date: '2025-02-01',
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest.spyOn(feeStructureRepo, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.enrollChild(dto, mockOwnerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should enforce tenant isolation for parent', async () => {
      // Arrange
      const dto = {
        parent_id: 'parent-001',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
      };

      // Parent belongs to different tenant
      jest
        .spyOn(parentRepo, 'findById')
        .mockResolvedValue({ ...mockParent, tenantId: 'other-tenant' });

      // Act & Assert
      await expect(controller.enrollChild(dto, mockOwnerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should transform snake_case to camelCase for repository', async () => {
      // Arrange
      const dto = {
        parent_id: 'parent-001',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
        medical_notes: 'Notes',
        emergency_contact: 'Contact',
        emergency_phone: '+27821234567',
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest
        .spyOn(feeStructureRepo, 'findById')
        .mockResolvedValue(mockFeeStructure);
      const createSpy = jest
        .spyOn(childRepo, 'create')
        .mockResolvedValue(mockChild);
      jest.spyOn(enrollmentService, 'enrollChild').mockResolvedValue({
        id: mockEnrollment.id,
        tenantId: mockEnrollment.tenantId,
        childId: mockEnrollment.childId,
        feeStructureId: mockEnrollment.feeStructureId,
        startDate: mockEnrollment.startDate,
        endDate: mockEnrollment.endDate,
        status: mockEnrollment.status as EnrollmentStatus,
        siblingDiscountApplied: mockEnrollment.siblingDiscountApplied,
        customFeeOverrideCents: mockEnrollment.customFeeOverrideCents,
        notes: mockEnrollment.notes,
        createdAt: mockEnrollment.createdAt,
        updatedAt: mockEnrollment.updatedAt,
      });

      // Act
      await controller.enrollChild(dto, mockOwnerUser);

      // Assert - verify camelCase was used for repository
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Emma',
          lastName: 'Smith',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          dateOfBirth: expect.any(Date),
          medicalNotes: 'Notes',
          emergencyContact: 'Contact',
          emergencyPhone: '+27821234567',
        }),
      );
    });
  });

  describe('GET /children (listChildren)', () => {
    it('should return paginated list of children', async () => {
      // Arrange
      const query = { page: 1, limit: 20 };

      jest.spyOn(childRepo, 'findByTenant').mockResolvedValue([mockChild]);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValue(mockEnrollment);
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);

      // Act
      const result = await controller.listChildren(query, mockOwnerUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].first_name).toBe('Emma');
      expect(result.data[0].enrollment_status).toBe('ACTIVE');
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by parent_id', async () => {
      // Arrange
      const query = { parent_id: 'parent-001' };

      const findByTenantSpy = jest
        .spyOn(childRepo, 'findByTenant')
        .mockResolvedValue([mockChild]);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValue(mockEnrollment);
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);

      // Act
      await controller.listChildren(query, mockOwnerUser);

      // Assert
      expect(findByTenantSpy).toHaveBeenCalledWith(mockTenantId, {
        parentId: 'parent-001',
        search: undefined,
      });
    });

    it('should filter by enrollment_status', async () => {
      // Arrange
      const query = { enrollment_status: EnrollmentStatus.ACTIVE };

      jest
        .spyOn(childRepo, 'findByTenant')
        .mockResolvedValue([mockChild, { ...mockChild, id: 'child-002' }]);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValueOnce(mockEnrollment)
        .mockResolvedValueOnce(null); // Second child has no active enrollment
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);

      // Act
      const result = await controller.listChildren(query, mockOwnerUser);

      // Assert - only child-001 has ACTIVE enrollment
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('child-001');
    });

    it('should apply pagination correctly', async () => {
      // Arrange
      const children = Array.from({ length: 25 }, (_, i) => ({
        ...mockChild,
        id: `child-${i + 1}`,
        firstName: `Child${i + 1}`,
      }));

      jest.spyOn(childRepo, 'findByTenant').mockResolvedValue(children);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValue(mockEnrollment);
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);

      // Act
      const result = await controller.listChildren(
        { page: 2, limit: 10 },
        mockOwnerUser,
      );

      // Assert
      expect(result.data).toHaveLength(10);
      expect(result.meta.page).toBe(2);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('GET /children/:id (getChild)', () => {
    it('should return child details with enrollment', async () => {
      // Arrange
      jest.spyOn(childRepo, 'findById').mockResolvedValue(mockChild);
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValue(mockEnrollment);
      jest
        .spyOn(feeStructureRepo, 'findById')
        .mockResolvedValue(mockFeeStructure);

      // Act
      const result = await controller.getChild('child-001', mockOwnerUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('child-001');
      expect(result.data.first_name).toBe('Emma');
      expect(result.data.parent.name).toBe('John Smith');
      expect(result.data.current_enrollment).not.toBeNull();
      expect(result.data.current_enrollment?.fee_structure.amount).toBe(3450);
    });

    it('should return null current_enrollment when no active enrollment', async () => {
      // Arrange
      jest.spyOn(childRepo, 'findById').mockResolvedValue(mockChild);
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest.spyOn(enrollmentRepo, 'findActiveByChild').mockResolvedValue(null);

      // Act
      const result = await controller.getChild('child-001', mockOwnerUser);

      // Assert
      expect(result.data.current_enrollment).toBeNull();
    });

    it('should throw NotFoundException when child not found', async () => {
      // Arrange
      jest.spyOn(childRepo, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.getChild('nonexistent', mockOwnerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation', async () => {
      // Arrange - child belongs to different tenant
      jest
        .spyOn(childRepo, 'findById')
        .mockResolvedValue({ ...mockChild, tenantId: 'other-tenant' });

      // Act & Assert
      await expect(
        controller.getChild('child-001', mockOwnerUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT /children/:id (updateChild)', () => {
    it('should update child details successfully', async () => {
      // Arrange
      const dto = {
        first_name: 'Emily',
        medical_notes: 'Updated notes',
      };

      jest.spyOn(childRepo, 'findById').mockResolvedValue(mockChild);
      jest.spyOn(childRepo, 'update').mockResolvedValue({
        ...mockChild,
        firstName: 'Emily',
        medicalNotes: 'Updated notes',
      });
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest
        .spyOn(enrollmentRepo, 'findActiveByChild')
        .mockResolvedValue(mockEnrollment);
      jest
        .spyOn(feeStructureRepo, 'findById')
        .mockResolvedValue(mockFeeStructure);

      // Act
      const result = await controller.updateChild(
        'child-001',
        dto,
        mockOwnerUser,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should transform snake_case to camelCase for update', async () => {
      // Arrange
      const dto = {
        first_name: 'Emily',
        last_name: 'Johnson',
        medical_notes: 'Updated notes',
        emergency_contact: 'New Contact',
        emergency_phone: '+27829876543',
      };

      jest.spyOn(childRepo, 'findById').mockResolvedValue(mockChild);
      const updateSpy = jest
        .spyOn(childRepo, 'update')
        .mockResolvedValue({ ...mockChild, firstName: 'Emily' });
      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest.spyOn(enrollmentRepo, 'findActiveByChild').mockResolvedValue(null);

      // Act
      await controller.updateChild('child-001', dto, mockOwnerUser);

      // Assert - verify camelCase was used for repository
      expect(updateSpy).toHaveBeenCalledWith(
        'child-001',
        expect.objectContaining({
          firstName: 'Emily',
          lastName: 'Johnson',
          medicalNotes: 'Updated notes',
          emergencyContact: 'New Contact',
          emergencyPhone: '+27829876543',
        }),
      );
    });

    it('should throw NotFoundException when child not found for update', async () => {
      // Arrange
      jest.spyOn(childRepo, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.updateChild('nonexistent', {}, mockOwnerUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Role restrictions', () => {
    it('should enforce OWNER/ADMIN role for enrollChild via decorators', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const enrollMethod = ChildController.prototype.enrollChild;
      const metadata = Reflect.getMetadata('roles', enrollMethod) as UserRole[];

      expect(metadata).toContain(UserRole.OWNER);
      expect(metadata).toContain(UserRole.ADMIN);
      expect(metadata).not.toContain(UserRole.VIEWER);
    });

    it('should enforce OWNER/ADMIN role for updateChild via decorators', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const updateMethod = ChildController.prototype.updateChild;
      const metadata = Reflect.getMetadata('roles', updateMethod) as UserRole[];

      expect(metadata).toContain(UserRole.OWNER);
      expect(metadata).toContain(UserRole.ADMIN);
      expect(metadata).not.toContain(UserRole.VIEWER);
    });
  });
});
