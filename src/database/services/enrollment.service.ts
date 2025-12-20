/**
 * Enrollment Service
 * TASK-ENROL-002: Enrollment Service with Sibling Discount Logic
 *
 * @module database/services/enrollment
 * @description Orchestrates enrollment operations including validation,
 * sibling discount calculations, and enrollment lifecycle management.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Enrollment } from '@prisma/client';
import { EnrollmentRepository } from '../repositories/enrollment.repository';
import { ChildRepository } from '../repositories/child.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { AuditLogService } from './audit-log.service';
import { EnrollmentStatus, IEnrollment } from '../entities/enrollment.entity';
import { Decimal } from 'decimal.js';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from '../../shared/exceptions';
import { UpdateEnrollmentDto } from '../dto/enrollment.dto';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Enroll a child in a fee structure
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param childId - Child ID to enroll
   * @param feeStructureId - Fee structure to enroll child in
   * @param startDate - Enrollment start date
   * @param userId - User performing the enrollment
   * @returns Created enrollment
   * @throws NotFoundException if child or fee structure doesn't exist
   * @throws ConflictException if child already has active enrollment
   * @throws ValidationException if startDate is in the past
   */
  async enrollChild(
    tenantId: string,
    childId: string,
    feeStructureId: string,
    startDate: Date,
    userId: string,
  ): Promise<IEnrollment> {
    // 1. Validate child exists and belongs to tenant
    const child = await this.childRepo.findById(childId);
    if (!child || child.tenantId !== tenantId) {
      this.logger.error(
        `Child not found or tenant mismatch: ${childId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Child', childId);
    }

    // 2. Validate fee structure exists and belongs to tenant
    const feeStructure = await this.feeStructureRepo.findById(feeStructureId);
    if (!feeStructure || feeStructure.tenantId !== tenantId) {
      this.logger.error(
        `Fee structure not found or tenant mismatch: ${feeStructureId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('FeeStructure', feeStructureId);
    }

    // 3. Check no active enrollment exists for this child
    const existing = await this.enrollmentRepo.findActiveByChild(
      tenantId,
      childId,
    );
    if (existing) {
      this.logger.error(
        `Child ${childId} already has active enrollment: ${existing.id}`,
      );
      throw new ConflictException('Child already has an active enrollment', {
        childId,
        existingEnrollmentId: existing.id,
      });
    }

    // 4. Validate startDate not in past (allow today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startNorm = new Date(startDate);
    startNorm.setHours(0, 0, 0, 0);
    if (startNorm < today) {
      this.logger.error(
        `Start date ${startDate.toISOString()} is in the past (today: ${today.toISOString()})`,
      );
      throw new ValidationException('Start date cannot be in the past', [
        {
          field: 'startDate',
          message: 'Start date cannot be in the past',
          value: startDate,
        },
      ]);
    }

    // 5. Create enrollment
    const enrollment = await this.enrollmentRepo.create({
      tenantId,
      childId,
      feeStructureId,
      startDate,
      status: EnrollmentStatus.ACTIVE,
    });

    // 6. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollment.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(enrollment)),
    });

    this.logger.log(
      `Successfully enrolled child ${childId} in enrollment ${enrollment.id}`,
    );

    return enrollment as IEnrollment;
  }

  /**
   * Update an enrollment
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to update
   * @param updates - Updates to apply
   * @param userId - User performing the update
   * @returns Updated enrollment
   * @throws NotFoundException if enrollment or fee structure doesn't exist
   * @throws ValidationException if endDate <= startDate
   */
  async updateEnrollment(
    tenantId: string,
    enrollmentId: string,
    updates: UpdateEnrollmentDto,
    userId: string,
  ): Promise<IEnrollment> {
    // Fetch enrollment and validate tenant
    const enrollment = await this.enrollmentRepo.findById(enrollmentId);
    if (!enrollment || enrollment.tenantId !== tenantId) {
      this.logger.error(
        `Enrollment not found or tenant mismatch: ${enrollmentId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Store before value for audit
    const beforeValue = { ...enrollment };

    // Validate fee structure if provided
    if (updates.feeStructureId) {
      const feeStructure = await this.feeStructureRepo.findById(
        updates.feeStructureId,
      );
      if (!feeStructure || feeStructure.tenantId !== tenantId) {
        this.logger.error(
          `Fee structure not found or tenant mismatch: ${updates.feeStructureId} for tenant ${tenantId}`,
        );
        throw new NotFoundException('FeeStructure', updates.feeStructureId);
      }
    }

    // Validate endDate > startDate if provided
    if (updates.endDate) {
      const startDate = updates.startDate ?? enrollment.startDate;
      if (updates.endDate <= startDate) {
        this.logger.error(
          `End date ${updates.endDate.toISOString()} must be after start date ${startDate.toISOString()}`,
        );
        throw new ValidationException('End date must be after start date', [
          {
            field: 'endDate',
            message: 'End date must be after start date',
            value: updates.endDate,
          },
        ]);
      }
    }

    // Update enrollment
    const updated = await this.enrollmentRepo.update(enrollmentId, updates);

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: JSON.parse(JSON.stringify(beforeValue)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(updated)),
      changeSummary: 'Enrollment updated',
    });

    this.logger.log(`Successfully updated enrollment ${enrollmentId}`);

    return updated as IEnrollment;
  }

  /**
   * Withdraw a child from enrollment
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to withdraw
   * @param endDate - Withdrawal date
   * @param userId - User performing the withdrawal
   * @returns Updated enrollment with WITHDRAWN status
   * @throws NotFoundException if enrollment doesn't exist
   * @throws ConflictException if already withdrawn
   * @throws ValidationException if endDate <= startDate
   */
  async withdrawChild(
    tenantId: string,
    enrollmentId: string,
    endDate: Date,
    userId: string,
  ): Promise<IEnrollment> {
    // Fetch enrollment and validate tenant
    const enrollment = await this.enrollmentRepo.findById(enrollmentId);
    if (!enrollment || enrollment.tenantId !== tenantId) {
      this.logger.error(
        `Enrollment not found or tenant mismatch: ${enrollmentId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Check not already withdrawn
    if (enrollment.status === (EnrollmentStatus.WITHDRAWN as string)) {
      this.logger.error(
        `Enrollment ${enrollmentId} is already withdrawn (status: ${enrollment.status})`,
      );
      throw new ConflictException('Enrollment is already withdrawn', {
        enrollmentId,
        currentStatus: enrollment.status,
      });
    }

    // Validate endDate > startDate
    if (endDate <= enrollment.startDate) {
      this.logger.error(
        `End date ${endDate.toISOString()} must be after start date ${enrollment.startDate.toISOString()}`,
      );
      throw new ValidationException('End date must be after start date', [
        {
          field: 'endDate',
          message: 'End date must be after start date',
          value: endDate,
        },
      ]);
    }

    // Store before value for audit
    const beforeValue = { ...enrollment };

    // Update with withdrawn status
    const updated = await this.enrollmentRepo.update(enrollmentId, {
      status: EnrollmentStatus.WITHDRAWN,
      endDate,
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: JSON.parse(JSON.stringify(beforeValue)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(updated)),
      changeSummary: 'Child withdrawn from enrollment',
    });

    this.logger.log(
      `Successfully withdrew child from enrollment ${enrollmentId}`,
    );

    return updated as IEnrollment;
  }

  /**
   * Get all active enrollments for a tenant, optionally filtered by parent
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Optional parent ID to filter by
   * @returns Array of active enrollments
   */
  async getActiveEnrollments(
    tenantId: string,
    parentId?: string,
  ): Promise<Enrollment[]> {
    if (parentId) {
      return await this.enrollmentRepo.findActiveByParentId(tenantId, parentId);
    }
    return await this.enrollmentRepo.findByStatus(
      tenantId,
      EnrollmentStatus.ACTIVE,
    );
  }

  /**
   * Calculate sibling discount percentages for all children of a parent
   * Discount policy:
   * - 1 child: 0% discount
   * - 2 children: second child gets 10% discount
   * - 3+ children: second child gets 15%, third+ get 20%
   *
   * Children are ordered by enrollment startDate (oldest enrollment = first child)
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Parent ID to calculate discounts for
   * @returns Map of childId -> discount percentage (as Decimal)
   */
  async applySiblingDiscount(
    tenantId: string,
    parentId: string,
  ): Promise<Map<string, Decimal>> {
    const enrollments = await this.getActiveEnrollments(tenantId, parentId);
    const discountMap = new Map<string, Decimal>();

    if (enrollments.length < 2) {
      // No discount for single child
      for (const e of enrollments) {
        discountMap.set(e.childId, new Decimal(0));
      }
      this.logger.log(
        `No sibling discount for parent ${parentId} (${enrollments.length} active enrollment(s))`,
      );
      return discountMap;
    }

    // Sort by startDate (oldest first = first child)
    enrollments.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    for (let i = 0; i < enrollments.length; i++) {
      const childId = enrollments[i].childId;
      if (i === 0) {
        // First child: 0%
        discountMap.set(childId, new Decimal(0));
      } else if (enrollments.length === 2) {
        // 2 children: second gets 10%
        discountMap.set(childId, new Decimal(10));
      } else {
        // 3+ children
        if (i === 1) {
          // Second child: 15%
          discountMap.set(childId, new Decimal(15));
        } else {
          // Third+: 20%
          discountMap.set(childId, new Decimal(20));
        }
      }
    }

    this.logger.log(
      `Calculated sibling discounts for parent ${parentId}: ${enrollments.length} children`,
    );

    return discountMap;
  }
}
