/**
 * Recipient Resolver Service
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Resolves recipients based on filter criteria for broadcast messages.
 * Supports parent, staff, and custom recipient types with channel-specific filtering.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma, EnrollmentStatus, EmploymentType } from '@prisma/client';
import {
  RecipientType,
  CommunicationChannel,
  RecipientFilterCriteria,
  ParentFilter,
  StaffFilter,
  ResolvedRecipient,
} from '../types/communication.types';

@Injectable()
export class RecipientResolverService {
  private readonly logger = new Logger(RecipientResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve recipients based on type, filter criteria, and channel
   *
   * @param tenantId - Tenant ID for isolation
   * @param recipientType - Type of recipient (PARENT, STAFF, CUSTOM)
   * @param filter - Optional filter criteria
   * @param channel - Optional communication channel (affects opt-in filtering)
   * @returns Array of resolved recipients with contact details
   */
  async resolve(
    tenantId: string,
    recipientType: RecipientType,
    filter?: RecipientFilterCriteria,
    channel?: CommunicationChannel,
  ): Promise<ResolvedRecipient[]> {
    this.logger.debug(
      `Resolving recipients: type=${recipientType}, channel=${channel}, tenantId=${tenantId}`,
    );

    if (recipientType === RecipientType.PARENT) {
      return this.resolveParents(tenantId, filter?.parentFilter, channel);
    } else if (recipientType === RecipientType.STAFF) {
      return this.resolveStaff(tenantId, filter?.staffFilter, channel);
    } else if (recipientType === RecipientType.CUSTOM) {
      return this.resolveByIds(tenantId, filter?.selectedIds ?? []);
    }

    return [];
  }

  /**
   * Resolve parent recipients with optional filters
   */
  private async resolveParents(
    tenantId: string,
    filter?: ParentFilter,
    channel?: CommunicationChannel,
  ): Promise<ResolvedRecipient[]> {
    const where: Prisma.ParentWhereInput = {
      tenantId,
      deletedAt: null,
    };

    // Apply isActive filter if specified
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    // Channel-specific filtering based on opt-in preferences
    if (channel === CommunicationChannel.WHATSAPP) {
      where.whatsappOptIn = true;
      where.whatsapp = { not: null };
    } else if (channel === CommunicationChannel.SMS) {
      where.smsOptIn = true;
      where.phone = { not: null };
    } else if (channel === CommunicationChannel.EMAIL) {
      where.email = { not: null };
    }

    // For ALL channel, we need at least one contact method
    // (filtering happens per-channel at send time)

    // Handle enrollment-based filters
    if (filter?.enrollmentStatus?.length || filter?.feeStructureId) {
      where.children = {
        some: {
          enrollments: {
            some: {
              ...(filter.enrollmentStatus?.length && {
                status: { in: filter.enrollmentStatus as EnrollmentStatus[] },
              }),
              ...(filter.feeStructureId && {
                feeStructureId: filter.feeStructureId,
              }),
            },
          },
        },
      };
    }

    // Handle arrears filter - parents with outstanding invoices
    if (filter?.hasOutstandingBalance) {
      where.invoices = {
        some: {
          status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
          isDeleted: false,
        },
      };
    }

    // Handle days overdue filter
    if (filter?.daysOverdue !== undefined && filter.daysOverdue > 0) {
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - filter.daysOverdue);

      where.invoices = {
        some: {
          status: 'OVERDUE',
          dueDate: { lte: overdueDate },
          isDeleted: false,
        },
      };
    }

    const parents = await this.prisma.parent.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        whatsapp: true,
        preferredContact: true,
      },
    });

    this.logger.debug(`Resolved ${parents.length} parent recipients`);

    return parents.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      email: p.email ?? undefined,
      phone: p.whatsapp ?? p.phone ?? undefined,
      preferredContact: p.preferredContact ?? undefined,
    }));
  }

  /**
   * Resolve staff recipients with optional filters
   */
  private async resolveStaff(
    tenantId: string,
    filter?: StaffFilter,
    channel?: CommunicationChannel,
  ): Promise<ResolvedRecipient[]> {
    const where: Prisma.StaffWhereInput = {
      tenantId,
    };

    // Apply isActive filter if specified
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    // Apply employment type filter
    if (filter?.employmentType?.length) {
      where.employmentType = { in: filter.employmentType as EmploymentType[] };
    }

    // Apply department filter
    if (filter?.department) {
      where.department = filter.department;
    }

    // Apply position filter
    if (filter?.position) {
      where.position = filter.position;
    }

    // Channel-specific filtering
    if (channel === CommunicationChannel.EMAIL) {
      where.email = { not: null };
    } else if (
      channel === CommunicationChannel.WHATSAPP ||
      channel === CommunicationChannel.SMS
    ) {
      where.phone = { not: null };
    }

    const staff = await this.prisma.staff.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    this.logger.debug(`Resolved ${staff.length} staff recipients`);

    return staff.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      email: s.email ?? undefined,
      phone: s.phone ?? undefined,
    }));
  }

  /**
   * Resolve recipients by explicit IDs (CUSTOM type)
   * Tries parents first, then staff for any remaining IDs
   */
  private async resolveByIds(
    tenantId: string,
    ids: string[],
  ): Promise<ResolvedRecipient[]> {
    if (ids.length === 0) {
      return [];
    }

    // Try to find as parents first
    const parents = await this.prisma.parent.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        whatsapp: true,
      },
    });

    // Get IDs that weren't found as parents
    const parentIds = parents.map((p) => p.id);
    const staffIds = ids.filter((id) => !parentIds.includes(id));

    // Try to find remaining as staff
    const staff = await this.prisma.staff.findMany({
      where: {
        id: { in: staffIds },
        tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    const resolved = [
      ...parents.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email ?? undefined,
        phone: p.whatsapp ?? p.phone ?? undefined,
      })),
      ...staff.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        email: s.email ?? undefined,
        phone: s.phone ?? undefined,
      })),
    ];

    this.logger.debug(
      `Resolved ${resolved.length} custom recipients from ${ids.length} IDs`,
    );

    return resolved;
  }

  /**
   * Preview recipient count without resolving full details
   * Useful for UI to show estimated recipient count before sending
   */
  async previewCount(
    tenantId: string,
    recipientType: RecipientType,
    filter?: RecipientFilterCriteria,
    channel?: CommunicationChannel,
  ): Promise<number> {
    // For now, just resolve and count - can be optimized with COUNT queries later
    const recipients = await this.resolve(
      tenantId,
      recipientType,
      filter,
      channel,
    );
    return recipients.length;
  }
}
