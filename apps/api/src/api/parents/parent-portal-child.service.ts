/**
 * Parent Portal Child Service
 * Provides whitelisted, parent-scoped updates to child fields.
 *
 * Security boundary: every method requires a verified parent ↔ child link
 * (child.parentId === parentId AND child.tenantId === tenantId).
 * A parent cannot edit another family's child.
 *
 * Identity fields (firstName, lastName, gender): parent may edit these.
 * Admin receives an in-app notification on every identity change so they can
 * manually rematch any in-flight bank transactions that used the old name
 * (payment-matching.service.ts:653-686 reads child.firstName/lastName live
 * via Levenshtein fuzzy matching — a rename mid-month silently degrades
 * confidence until the matcher re-runs).
 *
 * DOB is intentionally absent from the parent-editable surface:
 * enrollment.service.ts:1079-1081 uses DOB to set the graduation-cohort flag;
 * only admins may change it.
 *
 * PII note: child names/IDs are never emitted to structured logs; only
 * correlation IDs (childId, parentId UUIDs) are logged.
 */

import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import {
  UpdateParentChildDto,
  ParentChildUpdateResponseDto,
} from './dto/update-parent-child.dto';

/** Identity fields the parent may change — triggers admin notification on change. */
const IDENTITY_FIELDS = ['firstName', 'lastName', 'gender'] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

@Injectable()
export class ParentPortalChildService {
  private readonly logger = new Logger(ParentPortalChildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppNotifications: InAppNotificationService,
  ) {}

  /**
   * Update whitelisted fields on a child, enforcing the parent ↔ child
   * ownership boundary.
   *
   * Identity fields (firstName, lastName, gender):
   *   - Audit log records FULL before/after values (paper trail for admin).
   *   - On change: in-app SYSTEM_ALERT dispatched to all OWNER/ADMIN users of
   *     the tenant so they can manually verify payment-matching integrity.
   *
   * Non-identity fields (medicalNotes, emergencyContact, emergencyPhone):
   *   - Audit log records '[redacted]' placeholders (parent-authored free text).
   *
   * NOTE: quotes.child_name is a denormalized copy of the child's name at
   * quote creation time. It will NOT reflect renames made here — this is
   * acceptable because quotes are pre-enrollment display-only records and
   * the stale copy has no runtime impact.
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
        firstName: true,
        lastName: true,
        gender: true,
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
    // 2. Build the before/after snapshot (only changed fields).
    //    Identity fields: full before/after values (paper trail; admin needs them).
    //    Non-identity fields: redacted (parent-authored free text, PII-light).
    // -----------------------------------------------------------------------
    const beforeSnapshot: Prisma.JsonObject = {};
    const afterSnapshot: Prisma.JsonObject = {};
    const changedIdentityFields: IdentityField[] = [];

    // Identity fields — full values in audit log
    for (const field of IDENTITY_FIELDS) {
      if (dto[field] !== undefined && dto[field] !== child[field]) {
        beforeSnapshot[field] = child[field] ?? null;
        afterSnapshot[field] = dto[field];
        changedIdentityFields.push(field);
      }
    }

    // Non-identity fields — redacted in audit log
    if (
      dto.medicalNotes !== undefined &&
      dto.medicalNotes !== child.medicalNotes
    ) {
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
    const updateData: Prisma.ChildUpdateInput = {};

    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.medicalNotes !== undefined)
      updateData.medicalNotes = dto.medicalNotes;
    if (dto.emergencyContact !== undefined)
      updateData.emergencyContact = dto.emergencyContact;
    if (dto.emergencyPhone !== undefined)
      updateData.emergencyPhone = dto.emergencyPhone;

    // -----------------------------------------------------------------------
    // 4. Perform update + audit log in a transaction.
    // -----------------------------------------------------------------------
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.child.update({
        where: { id: childId },
        data: updateData,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gender: true,
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

    // -----------------------------------------------------------------------
    // 5. Dispatch in-app admin notification if any identity field changed.
    //    In-app only — NO WhatsApp/email (comms-safety rule for staging).
    //    Fires AFTER the transaction commits so the notification is not rolled
    //    back if it throws (best-effort; a failure here should not abort the
    //    parent's update).
    // -----------------------------------------------------------------------
    if (changedIdentityFields.length > 0) {
      await this.notifyAdminsOfIdentityChange(
        tenantId,
        childId,
        changedIdentityFields,
      ).catch((err: unknown) => {
        this.logger.error(
          `updateChildForParent: admin notification failed for child ${childId} in tenant ${tenantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      });
    }

    this.logger.debug(
      `updateChildForParent: child ${childId} updated by parent-session ${actorId} in tenant ${tenantId}`,
    );

    return {
      id: updated.id,
      firstName: updated.firstName ?? null,
      lastName: updated.lastName ?? null,
      gender:
        (updated.gender as ParentChildUpdateResponseDto['gender']) ?? null,
      medicalNotes: updated.medicalNotes ?? null,
      emergencyContact: updated.emergencyContact ?? null,
      emergencyPhone: updated.emergencyPhone ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Find all OWNER/ADMIN users for the tenant and send each an in-app
   * SYSTEM_ALERT notification about the identity change.
   *
   * Rationale: payment-matching.service.ts reads child.firstName/lastName live
   * for Levenshtein fuzzy matching (lines 653-686). A rename mid-month silently
   * degrades confidence on unprocessed transactions. Admins must manually
   * trigger a rematch for any in-flight bank transactions referencing the old
   * name.
   */
  private async notifyAdminsOfIdentityChange(
    tenantId: string,
    childId: string,
    changedFields: IdentityField[],
  ): Promise<void> {
    const adminUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['OWNER', 'ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    if (adminUsers.length === 0) {
      this.logger.warn(
        `notifyAdminsOfIdentityChange: no admin users found in tenant ${tenantId}`,
      );
      return;
    }

    const fieldsLabel = changedFields.join(', ');

    await Promise.all(
      adminUsers.map((user) =>
        this.inAppNotifications.create({
          tenantId,
          recipientType: 'USER',
          recipientId: user.id,
          type: 'SYSTEM_ALERT',
          priority: 'HIGH',
          title: 'Child identity updated via parent portal',
          body:
            `Parent updated child identity (childId: ${childId}): fields changed — ${fieldsLabel}. ` +
            `Verify payment-matching for any in-flight bank transactions referencing the old name.`,
          metadata: { childId, changedFields, source: 'parent-portal' },
        }),
      ),
    );

    this.logger.debug(
      `notifyAdminsOfIdentityChange: sent SYSTEM_ALERT to ${adminUsers.length} admin(s) in tenant ${tenantId} for child ${childId}`,
    );
  }
}
