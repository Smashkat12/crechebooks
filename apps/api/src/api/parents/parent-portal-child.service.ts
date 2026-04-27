/**
 * Parent Portal Child Service
 * Provides whitelisted, parent-scoped updates to non-identity child fields.
 *
 * Security boundary: every method requires a verified parent ↔ child link
 * (child.parentId === parentId AND child.tenantId === tenantId).
 * A parent cannot edit another family's child.
 *
 * PII note: child names/IDs are never emitted to structured logs; only
 * correlation IDs (childId, parentId UUIDs) are logged.
 */

import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import {
  UpdateParentChildDto,
  ParentChildUpdateResponseDto,
} from './dto/update-parent-child.dto';

@Injectable()
export class ParentPortalChildService {
  private readonly logger = new Logger(ParentPortalChildService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update whitelisted non-identity fields on a child, enforcing the
   * parent ↔ child ownership boundary.
   *
   * @param parentId  - Authenticated parent's ID (from ParentSession)
   * @param childId   - Path param from the request
   * @param dto       - Validated partial-update body
   * @param tenantId  - Tenant from session — all queries are scoped to this
   * @param actorId   - session.id used for audit userId (parent portal session id)
   * @returns Whitelisted child update response
   * @throws ForbiddenException when parent does not own the child
   * @throws NotFoundException when child not found in tenant
   */
  async updateChildForParent(
    parentId: string,
    childId: string,
    dto: UpdateParentChildDto,
    tenantId: string,
    actorId: string,
  ): Promise<ParentChildUpdateResponseDto> {
    // -----------------------------------------------------------------------
    // 1. Verify parent owns this child — the security boundary.
    //    Query is tenant-scoped AND parent-scoped AND soft-delete aware.
    // -----------------------------------------------------------------------
    const child = await this.prisma.child.findFirst({
      where: {
        id: childId,
        tenantId,
        parentId, // ← ownership check: parent MUST be the direct parent
        deletedAt: null,
      },
      select: {
        id: true,
        medicalNotes: true,
        emergencyContact: true,
        emergencyPhone: true,
        updatedAt: true,
      },
    });

    if (!child) {
      // Do NOT distinguish between "not found" and "not owned" to avoid
      // enumeration — treat both as 403 from the parent's perspective.
      this.logger.warn(
        `updateChildForParent: child ${childId} not accessible for parent ${parentId} in tenant ${tenantId}`,
      );
      throw new ForbiddenException(
        'Child not found or not associated with your account',
      );
    }

    // -----------------------------------------------------------------------
    // 2. Build the before snapshot (only changed fields).
    // -----------------------------------------------------------------------
    const beforeSnapshot: Prisma.JsonObject = {};
    const afterSnapshot: Prisma.JsonObject = {};

    if (
      dto.medicalNotes !== undefined &&
      dto.medicalNotes !== child.medicalNotes
    ) {
      // Redact content from logs — store only field presence
      beforeSnapshot.medicalNotes = '[redacted]';
      afterSnapshot.medicalNotes = '[redacted]';
    }
    if (
      dto.emergencyContact !== undefined &&
      dto.emergencyContact !== child.emergencyContact
    ) {
      beforeSnapshot.emergencyContact = '[redacted]';
      afterSnapshot.emergencyContact = '[redacted]';
    }
    if (
      dto.emergencyPhone !== undefined &&
      dto.emergencyPhone !== child.emergencyPhone
    ) {
      beforeSnapshot.emergencyPhone = '[redacted]';
      afterSnapshot.emergencyPhone = '[redacted]';
    }

    // -----------------------------------------------------------------------
    // 3. Build prisma update data from dto (only defined fields).
    // -----------------------------------------------------------------------
    const updateData: {
      medicalNotes?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
    } = {};

    if (dto.medicalNotes !== undefined) {
      updateData.medicalNotes = dto.medicalNotes;
    }
    if (dto.emergencyContact !== undefined) {
      updateData.emergencyContact = dto.emergencyContact;
    }
    if (dto.emergencyPhone !== undefined) {
      updateData.emergencyPhone = dto.emergencyPhone;
    }

    // -----------------------------------------------------------------------
    // 4. Perform update + audit log in a transaction.
    // -----------------------------------------------------------------------
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.child.update({
        where: { id: childId },
        data: updateData,
        select: {
          id: true,
          medicalNotes: true,
          emergencyContact: true,
          emergencyPhone: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          agentId: null,
          entityType: 'Child',
          entityId: childId,
          action: AuditAction.UPDATE,
          beforeValue:
            Object.keys(beforeSnapshot).length > 0 ? beforeSnapshot : undefined,
          afterValue:
            Object.keys(afterSnapshot).length > 0
              ? { ...afterSnapshot, via: 'parent-portal' }
              : { via: 'parent-portal' },
          changeSummary: `Parent-portal update: fields [${Object.keys(updateData).join(', ')}]`,
          ipAddress: null,
          userAgent: null,
        },
      });

      return result;
    });

    this.logger.debug(
      `updateChildForParent: child ${childId} updated by parent-session ${actorId} in tenant ${tenantId}`,
    );

    return {
      id: updated.id,
      medicalNotes: updated.medicalNotes ?? null,
      emergencyContact: updated.emergencyContact ?? null,
      emergencyPhone: updated.emergencyPhone ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
