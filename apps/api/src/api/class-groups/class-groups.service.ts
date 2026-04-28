/**
 * ClassGroupsService
 *
 * Owns CRUD for class_groups.  Every method is tenant-scoped.
 * Soft delete: deletedAt: null on every read.
 * Audit log: every mutation calls AuditLogService.
 *
 * Design decision on DELETE /:id:
 *   Children's classGroupId is NOT nulled on group soft-delete.
 *   The FK is ON DELETE SET NULL at the DB level — that fires only on hard
 *   delete, which we never issue.  We keep the historical link intentionally
 *   so attendance / report history remains traceable.  This decision is
 *   recorded in the audit log via changeSummary.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ClassGroup, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { CreateClassGroupDto } from './dto/create-class-group.dto';
import { UpdateClassGroupDto } from './dto/update-class-group.dto';

const MAX_GROUPS = 200;

// Minimal child shape returned for the /:id/children endpoint
type ChildSummary = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string | null;
  isActive: boolean;
  classGroupId: string | null;
};

@Injectable()
export class ClassGroupsService {
  private readonly logger = new Logger(ClassGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ------------------------------------------------------------------
  // LIST
  // ------------------------------------------------------------------
  async findAll(
    tenantId: string,
    includeInactive = false,
  ): Promise<(ClassGroup & { childCount: number })[]> {
    const where: Prisma.ClassGroupWhereInput = {
      tenantId,
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [groups, total] = await Promise.all([
      this.prisma.classGroup.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        take: MAX_GROUPS,
      }),
      this.prisma.classGroup.count({ where }),
    ]);

    if (total >= MAX_GROUPS) {
      this.logger.warn(
        `tenant=${tenantId} has ${total} class groups — approaching list ceiling (${MAX_GROUPS})`,
      );
    }

    // Attach child counts in a single batched query
    const ids = groups.map((g) => g.id);
    const counts = await this.prisma.child.groupBy({
      by: ['classGroupId'],
      where: { classGroupId: { in: ids }, tenantId, deletedAt: null },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((c) => [c.classGroupId, c._count._all]),
    );

    return groups.map((g) => ({ ...g, childCount: countMap.get(g.id) ?? 0 }));
  }

  // ------------------------------------------------------------------
  // FIND ONE
  // ------------------------------------------------------------------
  async findOne(
    tenantId: string,
    id: string,
  ): Promise<ClassGroup & { childCount: number }> {
    const group = await this.prisma.classGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!group) throw new NotFoundException(`ClassGroup ${id} not found`);

    const childCount = await this.prisma.child.count({
      where: { classGroupId: id, tenantId, deletedAt: null },
    });

    return { ...group, childCount };
  }

  // ------------------------------------------------------------------
  // CREATE
  // ------------------------------------------------------------------
  async create(
    tenantId: string,
    userId: string,
    dto: CreateClassGroupDto,
  ): Promise<ClassGroup & { childCount: number }> {
    this.validateAgeRange(dto.ageMinMonths, dto.ageMaxMonths);

    let group: ClassGroup;
    try {
      group = await this.prisma.classGroup.create({
        data: {
          tenantId,
          name: dto.name,
          code: dto.code ?? null,
          description: dto.description ?? null,
          ageMinMonths: dto.ageMinMonths ?? null,
          ageMaxMonths: dto.ageMaxMonths ?? null,
          capacity: dto.capacity ?? null,
          displayOrder: dto.displayOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A class group named "${dto.name}" already exists for this tenant`,
        );
      }
      throw error;
    }

    await this.auditLog.logCreate({
      tenantId,
      userId,
      entityType: 'ClassGroup',
      entityId: group.id,
      afterValue: group as unknown as Prisma.InputJsonValue,
    });

    return { ...group, childCount: 0 };
  }

  // ------------------------------------------------------------------
  // UPDATE (PATCH)
  // ------------------------------------------------------------------
  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateClassGroupDto,
  ): Promise<ClassGroup & { childCount: number }> {
    const before = await this.prisma.classGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException(`ClassGroup ${id} not found`);

    const mergedMin =
      dto.ageMinMonths !== undefined ? dto.ageMinMonths : before.ageMinMonths;
    const mergedMax =
      dto.ageMaxMonths !== undefined ? dto.ageMaxMonths : before.ageMaxMonths;
    this.validateAgeRange(mergedMin ?? undefined, mergedMax ?? undefined);

    const updateData: Prisma.ClassGroupUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.ageMinMonths !== undefined)
      updateData.ageMinMonths = dto.ageMinMonths;
    if (dto.ageMaxMonths !== undefined)
      updateData.ageMaxMonths = dto.ageMaxMonths;
    if (dto.capacity !== undefined) updateData.capacity = dto.capacity;
    if (dto.displayOrder !== undefined)
      updateData.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    let after: ClassGroup;
    try {
      after = await this.prisma.classGroup.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `A class group named "${dto.name}" already exists for this tenant`,
        );
      }
      throw error;
    }

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'ClassGroup',
      entityId: id,
      beforeValue: before as unknown as Prisma.InputJsonValue,
      afterValue: after as unknown as Prisma.InputJsonValue,
    });

    const childCount = await this.prisma.child.count({
      where: { classGroupId: id, tenantId, deletedAt: null },
    });

    return { ...after, childCount };
  }

  // ------------------------------------------------------------------
  // DELETE (soft)
  // ------------------------------------------------------------------
  async remove(tenantId: string, id: string, userId: string): Promise<void> {
    const group = await this.prisma.classGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!group) throw new NotFoundException(`ClassGroup ${id} not found`);

    const now = new Date();
    await this.prisma.classGroup.update({
      where: { id },
      data: { deletedAt: now },
    });

    await this.auditLog.logAction({
      tenantId,
      userId,
      entityType: 'ClassGroup',
      entityId: id,
      action: AuditAction.DELETE,
      beforeValue: group as unknown as Prisma.InputJsonValue,
      changeSummary:
        `ClassGroup soft-deleted. children.classGroupId NOT nulled — ` +
        `historical link preserved for attendance/report traceability. ` +
        `FK ON DELETE SET NULL fires only on hard delete (never issued here).`,
    });
  }

  // ------------------------------------------------------------------
  // ASSIGN CHILDREN (bulk)
  // ------------------------------------------------------------------
  async assignChildren(
    tenantId: string,
    groupId: string,
    childIds: string[],
    userId: string,
  ): Promise<{ assigned: number }> {
    // Group must exist and belong to this tenant
    const group = await this.prisma.classGroup.findFirst({
      where: { id: groupId, tenantId, deletedAt: null },
    });
    if (!group) throw new NotFoundException(`ClassGroup ${groupId} not found`);

    // Verify all children belong to this tenant (cross-tenant assign → 400)
    const owned = await this.prisma.child.findMany({
      where: { id: { in: childIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    const foreign = childIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `Child IDs not found in tenant or already deleted: ${foreign.join(', ')}`,
      );
    }

    // Transactional bulk-assign
    await this.prisma.$transaction(async (tx) => {
      await tx.child.updateMany({
        where: { id: { in: childIds }, tenantId },
        data: { classGroupId: groupId },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'ClassGroup',
          entityId: groupId,
          action: 'UPDATE',
          beforeValue: Prisma.DbNull,
          afterValue: {
            action: 'bulk_assign_children',
            childCount: childIds.length,
            // No raw IDs in log — use count only (PII guard: IDs are UUIDs, not names,
            // but keeping minimal footprint per policy).
          } as unknown as Prisma.InputJsonValue,
          changeSummary: `Bulk-assigned ${childIds.length} children to class group`,
        },
      });
    });

    return { assigned: childIds.length };
  }

  // ------------------------------------------------------------------
  // UNASSIGN CHILD
  // ------------------------------------------------------------------
  async unassignChild(
    tenantId: string,
    groupId: string,
    childId: string,
    userId: string,
  ): Promise<void> {
    // Group existence
    const group = await this.prisma.classGroup.findFirst({
      where: { id: groupId, tenantId, deletedAt: null },
    });
    if (!group) throw new NotFoundException(`ClassGroup ${groupId} not found`);

    // Child must belong to tenant and currently assigned to this group
    const child = await this.prisma.child.findFirst({
      where: { id: childId, tenantId, classGroupId: groupId, deletedAt: null },
    });
    if (!child) {
      throw new NotFoundException(
        `Child ${childId} not found in group ${groupId}`,
      );
    }

    await this.prisma.child.update({
      where: { id: childId },
      data: { classGroupId: null },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'Child',
      entityId: childId,
      beforeValue: { classGroupId: groupId } as Prisma.InputJsonValue,
      afterValue: { classGroupId: null } as Prisma.InputJsonValue,
      changeSummary: `Child unassigned from class group ${groupId}`,
    });
  }

  // ------------------------------------------------------------------
  // LIST CHILDREN IN GROUP
  // ------------------------------------------------------------------
  async findChildren(
    tenantId: string,
    groupId: string,
  ): Promise<ChildSummary[]> {
    const group = await this.prisma.classGroup.findFirst({
      where: { id: groupId, tenantId, deletedAt: null },
    });
    if (!group) throw new NotFoundException(`ClassGroup ${groupId} not found`);

    return this.prisma.child.findMany({
      where: { classGroupId: groupId, tenantId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        isActive: true,
        classGroupId: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // ------------------------------------------------------------------
  // PRIVATE HELPERS
  // ------------------------------------------------------------------
  private validateAgeRange(min?: number, max?: number): void {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException(
        `ageMinMonths (${min}) must be <= ageMaxMonths (${max})`,
      );
    }
  }
}
