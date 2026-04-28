/**
 * AttendanceService
 *
 * Owns all attendance record logic.  Every method is tenant-scoped.
 *
 * Key design decisions:
 * - markAttendance performs an upsert on (childId, date) unique constraint.
 *   classGroupId is snapshotted from the child's current group at write time —
 *   the caller MUST NOT supply it directly.
 * - Hard delete: attendance records are factual data.  If a record was created
 *   in error (wrong child) it must be gone entirely, not soft-deleted.
 * - arrivalAt/departureAt: we validate that departureAt > arrivalAt in the
 *   service when both are provided, but we do NOT enforce same-calendar-day.
 *   Cross-midnight care scenarios (very early pickup, overnight) are valid in
 *   principle; the marker is trusted.  This is documented here and in the DTO.
 * - PII: child names are never written to structured logger; only UUIDs appear.
 * - Audit log via AuditLogService (logCreate / logUpdate / logAction) matching
 *   the pattern used by ClassGroupsService.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceRecord, AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import {
  BulkMarkAttendanceDto,
  BulkChildAttendanceDto,
} from './dto/bulk-mark-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import type {
  AttendanceResponseDto,
  AttendanceListResponseDto,
  AttendanceSummaryDto,
  ClassGroupDailyReportDto,
  ParentAttendanceSummaryDto,
  AdminDayViewDto,
  ParentPreReportDto,
} from './dto/attendance-response.dto';

const MAX_ROWS = 1000;

// ------------------------------------------------------------------
// Helper: parse YYYY-MM-DD → UTC midnight Date
// ------------------------------------------------------------------
function parseDate(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  return d;
}

// ------------------------------------------------------------------
// Helper: reject future dates
// ------------------------------------------------------------------
function rejectFutureDate(dateStr: string): void {
  const d = parseDate(dateStr);
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  if (d > todayUTC) {
    throw new BadRequestException(
      `date must not be in the future (got ${dateStr})`,
    );
  }
}

// ------------------------------------------------------------------
// Helper: validate arrival/departure ordering
// ------------------------------------------------------------------
function validateTimestamps(
  arrivalAt?: string | null,
  departureAt?: string | null,
): void {
  if (arrivalAt && departureAt) {
    if (new Date(departureAt) <= new Date(arrivalAt)) {
      throw new BadRequestException('departureAt must be after arrivalAt');
    }
  }
}

// ------------------------------------------------------------------
// Helper: map Prisma record → DTO
// ------------------------------------------------------------------
function toDto(
  record: AttendanceRecord & {
    child?: { firstName: string; lastName: string };
    classGroup?: { name: string } | null;
  },
): AttendanceResponseDto {
  return {
    id: record.id,
    tenantId: record.tenantId,
    childId: record.childId,
    classGroupId: record.classGroupId,
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
    arrivalAt: record.arrivalAt ? record.arrivalAt.toISOString() : null,
    departureAt: record.departureAt ? record.departureAt.toISOString() : null,
    note: record.note,
    markedById: record.markedById,
    markedAt: record.markedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.child ? { child: record.child } : {}),
    ...(record.classGroup !== undefined
      ? { classGroup: record.classGroup }
      : {}),
  };
}

// ------------------------------------------------------------------
// List filter shape
// ------------------------------------------------------------------
export interface AttendanceListFilter {
  date?: string;
  from?: string;
  to?: string;
  classGroupId?: string;
  childId?: string;
  status?: AttendanceStatus;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ------------------------------------------------------------------
  // MARK (upsert single)
  // ------------------------------------------------------------------
  async markAttendance(
    tenantId: string,
    userId: string,
    dto: MarkAttendanceDto,
  ): Promise<AttendanceResponseDto> {
    rejectFutureDate(dto.date);
    validateTimestamps(dto.arrivalAt, dto.departureAt);

    // Verify child belongs to this tenant
    const child = await this.prisma.child.findFirst({
      where: { id: dto.childId, tenantId, deletedAt: null },
      select: { id: true, classGroupId: true },
    });
    if (!child) {
      throw new NotFoundException(`Child ${dto.childId} not found in tenant`);
    }

    const dateVal = parseDate(dto.date);
    const now = new Date();

    // Check for existing record to determine create vs update for audit
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { childId_date: { childId: dto.childId, date: dateVal } },
    });

    // Check for an active parent pre-report on this date.
    // If admin provides no note, carry the parent's reason forward as the note
    // so the context isn't lost.
    const parentPreReport = await this.prisma.parentAbsenceReport.findFirst({
      where: {
        tenantId,
        childId: dto.childId,
        date: dateVal,
        cancelledAt: null,
      },
      select: { reason: true },
    });

    const resolvedNote =
      dto.note ??
      (parentPreReport?.reason
        ? `Parent reported: ${parentPreReport.reason}`
        : null);

    const data: Prisma.AttendanceRecordUncheckedCreateInput = {
      tenantId,
      childId: dto.childId,
      classGroupId: child.classGroupId, // snapshot at write time
      date: dateVal,
      status: dto.status,
      arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : null,
      departureAt: dto.departureAt ? new Date(dto.departureAt) : null,
      note: resolvedNote,
      markedById: userId,
      markedAt: now,
    };

    let record: AttendanceRecord;

    if (existing) {
      // For an update: if admin supplies no note and existing note is null,
      // carry the parent pre-report reason if available.
      const updateNote =
        dto.note !== undefined
          ? dto.note
          : (existing.note ??
            (parentPreReport?.reason
              ? `Parent reported: ${parentPreReport.reason}`
              : null));

      record = await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : null,
          departureAt: dto.departureAt ? new Date(dto.departureAt) : null,
          note: updateNote,
          markedById: userId,
          markedAt: now,
          // classGroupId: re-snapshot on every mark (child may have moved group)
          classGroupId: child.classGroupId,
        },
      });

      await this.auditLog.logUpdate({
        tenantId,
        userId,
        entityType: 'AttendanceRecord',
        entityId: record.id,
        beforeValue: {
          status: existing.status,
          classGroupId: existing.classGroupId,
        } as Prisma.InputJsonValue,
        afterValue: {
          status: record.status,
          classGroupId: record.classGroupId,
        } as Prisma.InputJsonValue,
        changeSummary: `Attendance upsert (update) for child ${dto.childId} on ${dto.date}`,
      });
    } else {
      record = await this.prisma.attendanceRecord.create({ data });

      await this.auditLog.logCreate({
        tenantId,
        userId,
        entityType: 'AttendanceRecord',
        entityId: record.id,
        afterValue: {
          status: record.status,
          date: dto.date,
          childId: dto.childId,
        } as Prisma.InputJsonValue,
      });
    }

    this.logger.debug(
      `markAttendance: ${existing ? 'updated' : 'created'} record ${record.id} for child ${dto.childId} in tenant ${tenantId}`,
    );

    return toDto(record);
  }

  // ------------------------------------------------------------------
  // BULK MARK
  // ------------------------------------------------------------------
  async bulkMarkAttendance(
    tenantId: string,
    userId: string,
    dto: BulkMarkAttendanceDto,
  ): Promise<{ marked: number; date: string }> {
    rejectFutureDate(dto.date);

    // Validate timestamps per record
    for (const r of dto.records) {
      validateTimestamps(r.arrivalAt, r.departureAt);
    }

    const childIds = dto.records.map((r) => r.childId);

    // Verify all children belong to tenant (cross-tenant → 400)
    const owned = await this.prisma.child.findMany({
      where: { id: { in: childIds }, tenantId, deletedAt: null },
      select: { id: true, classGroupId: true },
    });
    const ownedMap = new Map(owned.map((c) => [c.id, c.classGroupId]));

    const foreign = childIds.filter((id) => !ownedMap.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `Child IDs not found in tenant: ${foreign.join(', ')}`,
      );
    }

    const dateVal = parseDate(dto.date);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const rec of dto.records) {
        const classGroupId = ownedMap.get(rec.childId) ?? null;

        await tx.attendanceRecord.upsert({
          where: { childId_date: { childId: rec.childId, date: dateVal } },
          create: {
            tenantId,
            childId: rec.childId,
            classGroupId,
            date: dateVal,
            status: rec.status,
            arrivalAt: rec.arrivalAt ? new Date(rec.arrivalAt) : null,
            departureAt: rec.departureAt ? new Date(rec.departureAt) : null,
            note: rec.note ?? null,
            markedById: userId,
            markedAt: now,
          },
          update: {
            classGroupId,
            status: rec.status,
            arrivalAt: rec.arrivalAt ? new Date(rec.arrivalAt) : null,
            departureAt: rec.departureAt ? new Date(rec.departureAt) : null,
            note: rec.note ?? null,
            markedById: userId,
            markedAt: now,
          },
        });
      }

      // Single audit entry for the bulk operation
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          agentId: null,
          entityType: 'AttendanceRecord',
          entityId: `bulk:${dto.date}`,
          action: AuditAction.CREATE,
          beforeValue: Prisma.DbNull,
          afterValue: {
            date: dto.date,
            childCount: dto.records.length,
          } as unknown as Prisma.InputJsonValue,
          changeSummary: `Bulk attendance mark for ${dto.records.length} children on ${dto.date}`,
          ipAddress: null,
          userAgent: null,
        },
      });
    });

    this.logger.debug(
      `bulkMarkAttendance: ${dto.records.length} records for date ${dto.date} in tenant ${tenantId}`,
    );

    return { marked: dto.records.length, date: dto.date };
  }

  // ------------------------------------------------------------------
  // LIST
  // ------------------------------------------------------------------
  async list(
    tenantId: string,
    filter: AttendanceListFilter,
  ): Promise<AttendanceListResponseDto> {
    const where: Prisma.AttendanceRecordWhereInput = { tenantId };

    if (filter.date) {
      where.date = parseDate(filter.date);
    } else if (filter.from || filter.to) {
      where.date = {
        ...(filter.from ? { gte: parseDate(filter.from) } : {}),
        ...(filter.to ? { lte: parseDate(filter.to) } : {}),
      };
    }

    if (filter.classGroupId) where.classGroupId = filter.classGroupId;
    if (filter.childId) where.childId = filter.childId;
    if (filter.status) where.status = filter.status;

    const [records, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
        take: MAX_ROWS,
        include: {
          child: { select: { firstName: true, lastName: true } },
          classGroup: { select: { name: true } },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return { total, records: records.map(toDto) };
  }

  // ------------------------------------------------------------------
  // BY DATE (for Today tile join — includes child name + class group)
  // Also joins parent pre-reports for children not yet marked.
  // ------------------------------------------------------------------
  async findByDate(
    tenantId: string,
    dateStr: string,
  ): Promise<AdminDayViewDto> {
    const dateVal = parseDate(dateStr);

    const [records, allPreReports] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, date: dateVal },
        orderBy: [{ classGroupId: 'asc' }, { createdAt: 'asc' }],
        include: {
          child: { select: { firstName: true, lastName: true } },
          classGroup: { select: { name: true } },
        },
      }),
      this.prisma.parentAbsenceReport.findMany({
        where: { tenantId, date: dateVal, cancelledAt: null },
        select: {
          id: true,
          childId: true,
          parentId: true,
          reason: true,
          reportedAt: true,
        },
      }),
    ]);

    // Only surface pre-reports for children that do NOT yet have a record
    const markedChildIds = new Set(records.map((r) => r.childId));
    const parentPreReports: ParentPreReportDto[] = allPreReports
      .filter((pr) => !markedChildIds.has(pr.childId))
      .map((pr) => ({
        reportId: pr.id,
        childId: pr.childId,
        parentId: pr.parentId,
        reason: pr.reason,
        reportedAt: pr.reportedAt.toISOString(),
      }));

    return {
      date: dateStr,
      records: records.map(toDto),
      parentPreReports,
    };
  }

  // ------------------------------------------------------------------
  // CHILD HISTORY
  // ------------------------------------------------------------------
  async findByChild(
    tenantId: string,
    childId: string,
    from?: string,
    to?: string,
  ): Promise<AttendanceResponseDto[]> {
    // Verify child is in tenant
    const child = await this.prisma.child.findFirst({
      where: { id: childId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!child) {
      throw new NotFoundException(`Child ${childId} not found in tenant`);
    }

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 90);
    defaultFrom.setUTCHours(0, 0, 0, 0);

    const dateFilter: Prisma.DateTimeFilter = {
      gte: from ? parseDate(from) : defaultFrom,
      ...(to ? { lte: parseDate(to) } : {}),
    };

    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, childId, date: dateFilter },
      orderBy: { date: 'desc' },
      include: {
        classGroup: { select: { name: true } },
      },
    });

    return records.map(toDto);
  }

  // ------------------------------------------------------------------
  // CLASS GROUP DAILY REPORT
  // Returns status counts, per-child records, and parent pre-reports for
  // children in this group who have NOT yet been marked on this date.
  // ------------------------------------------------------------------
  async classGroupDailyReport(
    tenantId: string,
    classGroupId: string,
    dateStr: string,
  ): Promise<ClassGroupDailyReportDto> {
    const group = await this.prisma.classGroup.findFirst({
      where: { id: classGroupId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!group) {
      throw new NotFoundException(`ClassGroup ${classGroupId} not found`);
    }

    const dateVal = parseDate(dateStr);

    // Fetch attendance records and the group's current active children in parallel.
    // We need the child list to know which childIds to query for pre-reports and
    // to restrict pre-reports to THIS group only (prevent leaking other groups).
    const [records, groupChildren] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, classGroupId, date: dateVal },
        orderBy: { createdAt: 'asc' },
        include: {
          child: { select: { firstName: true, lastName: true } },
          classGroup: { select: { name: true } },
        },
      }),
      this.prisma.child.findMany({
        where: { tenantId, classGroupId, deletedAt: null, isActive: true },
        select: { id: true },
      }),
    ]);

    const dtos = records.map(toDto);
    const markedChildIds = new Set(dtos.map((r) => r.childId));
    const groupChildIds = groupChildren.map((c) => c.id);

    // Only fetch pre-reports for children that:
    //   (a) belong to this class group (groupChildIds), and
    //   (b) have not yet been marked today (not in markedChildIds).
    // This ensures we never leak pre-reports for children in other groups.
    const unmarkedGroupChildIds = groupChildIds.filter(
      (id) => !markedChildIds.has(id),
    );

    let parentPreReports: ParentPreReportDto[] = [];
    if (unmarkedGroupChildIds.length > 0) {
      const rawReports = await this.prisma.parentAbsenceReport.findMany({
        where: {
          tenantId,
          childId: { in: unmarkedGroupChildIds },
          date: dateVal,
          cancelledAt: null,
        },
        select: {
          id: true,
          childId: true,
          parentId: true,
          reason: true,
          reportedAt: true,
        },
      });

      parentPreReports = rawReports.map((pr) => ({
        reportId: pr.id,
        childId: pr.childId,
        parentId: pr.parentId,
        reason: pr.reason,
        reportedAt: pr.reportedAt.toISOString(),
      }));
    }

    return {
      classGroupId,
      classGroupName: group.name,
      date: dateStr,
      presentCount: dtos.filter((r) => r.status === 'PRESENT').length,
      absentCount: dtos.filter((r) => r.status === 'ABSENT').length,
      lateCount: dtos.filter((r) => r.status === 'LATE').length,
      excusedCount: dtos.filter((r) => r.status === 'EXCUSED').length,
      earlyPickupCount: dtos.filter((r) => r.status === 'EARLY_PICKUP').length,
      records: dtos,
      parentPreReports,
    };
  }

  // ------------------------------------------------------------------
  // UPDATE (PATCH)
  // ------------------------------------------------------------------
  async updateAttendance(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateAttendanceDto,
  ): Promise<AttendanceResponseDto> {
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`AttendanceRecord ${id} not found`);
    }

    const resolvedArrival =
      dto.arrivalAt !== undefined
        ? dto.arrivalAt
          ? new Date(dto.arrivalAt)
          : null
        : existing.arrivalAt;
    const resolvedDeparture =
      dto.departureAt !== undefined
        ? dto.departureAt
          ? new Date(dto.departureAt)
          : null
        : existing.departureAt;

    validateTimestamps(
      resolvedArrival?.toISOString(),
      resolvedDeparture?.toISOString(),
    );

    const updateData: Prisma.AttendanceRecordUpdateInput = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.arrivalAt !== undefined)
      updateData.arrivalAt = dto.arrivalAt ? new Date(dto.arrivalAt) : null;
    if (dto.departureAt !== undefined)
      updateData.departureAt = dto.departureAt
        ? new Date(dto.departureAt)
        : null;
    if (dto.note !== undefined) updateData.note = dto.note;

    const updated = await this.prisma.attendanceRecord.update({
      where: { id },
      data: updateData,
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'AttendanceRecord',
      entityId: id,
      beforeValue: {
        status: existing.status,
        note: existing.note,
      } as Prisma.InputJsonValue,
      afterValue: {
        status: updated.status,
        note: updated.note,
      } as Prisma.InputJsonValue,
      changeSummary: `AttendanceRecord updated by user ${userId}`,
    });

    return toDto(updated);
  }

  // ------------------------------------------------------------------
  // DELETE (hard)
  // ------------------------------------------------------------------
  async deleteAttendance(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`AttendanceRecord ${id} not found`);
    }

    await this.prisma.attendanceRecord.delete({ where: { id } });

    await this.auditLog.logAction({
      tenantId,
      userId,
      entityType: 'AttendanceRecord',
      entityId: id,
      action: AuditAction.DELETE,
      beforeValue: {
        status: existing.status,
        childId: existing.childId,
        date: existing.date.toISOString().slice(0, 10),
      } as Prisma.InputJsonValue,
      changeSummary: `AttendanceRecord hard-deleted (factual correction) by user ${userId}`,
    });

    this.logger.debug(
      `deleteAttendance: record ${id} hard-deleted in tenant ${tenantId}`,
    );
  }

  // ------------------------------------------------------------------
  // SUMMARY — TODAY TILE
  // Includes reportedAbsentCount: subset of unmarked children whose parent
  // has an active pre-report for today.
  // ------------------------------------------------------------------
  async todaySummary(tenantId: string): Promise<AttendanceSummaryDto> {
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    const todayStr = todayUTC.toISOString().slice(0, 10);

    // Count records for today grouped by status
    const [statusCounts, totalActive, todayPreReports] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { tenantId, date: todayUTC },
        _count: { _all: true },
      }),
      this.prisma.child.count({
        where: { tenantId, isActive: true, deletedAt: null },
      }),
      this.prisma.parentAbsenceReport.findMany({
        where: { tenantId, date: todayUTC, cancelledAt: null },
        select: { childId: true },
      }),
    ]);

    const countMap = new Map(
      statusCounts.map((s) => [s.status, s._count._all]),
    );

    const markedCount = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
    const unmarkedCount = Math.max(0, totalActive - markedCount);

    // Count how many of the unmarked children have a parent pre-report
    // We need the set of marked childIds to compute the intersection
    const markedChildren = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, date: todayUTC },
      select: { childId: true },
    });
    const markedChildIds = new Set(markedChildren.map((r) => r.childId));

    const reportedAbsentCount = todayPreReports.filter(
      (pr) => !markedChildIds.has(pr.childId),
    ).length;

    this.logger.debug(
      `todaySummary: tenant=${tenantId} date=${todayStr} unmarked=${unmarkedCount} reported=${reportedAbsentCount}`,
    );

    return {
      presentCount: countMap.get(AttendanceStatus.PRESENT) ?? 0,
      absentCount: countMap.get(AttendanceStatus.ABSENT) ?? 0,
      lateCount: countMap.get(AttendanceStatus.LATE) ?? 0,
      excusedCount: countMap.get(AttendanceStatus.EXCUSED) ?? 0,
      earlyPickupCount: countMap.get(AttendanceStatus.EARLY_PICKUP) ?? 0,
      unmarkedCount,
      reportedAbsentCount,
    };
  }

  // ------------------------------------------------------------------
  // PARENT: read own child's attendance
  // ------------------------------------------------------------------
  async parentChildAttendance(
    tenantId: string,
    parentId: string,
    childId: string,
    from?: string,
    to?: string,
  ): Promise<AttendanceResponseDto[]> {
    // Verify parent owns this child (matching pattern from parent-portal-child.service.ts)
    const child = await this.prisma.child.findFirst({
      where: { id: childId, tenantId, parentId, deletedAt: null },
      select: { id: true },
    });
    if (!child) {
      throw new ForbiddenException(
        'Child not found or not associated with your account',
      );
    }

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    defaultFrom.setUTCHours(0, 0, 0, 0);

    const dateFilter: Prisma.DateTimeFilter = {
      gte: from ? parseDate(from) : defaultFrom,
      ...(to ? { lte: parseDate(to) } : {}),
    };

    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, childId, date: dateFilter },
      orderBy: { date: 'desc' },
      include: { classGroup: { select: { name: true } } },
    });

    return records.map(toDto);
  }

  // ------------------------------------------------------------------
  // PARENT: child attendance summary
  // ------------------------------------------------------------------
  async parentChildSummary(
    tenantId: string,
    parentId: string,
    childId: string,
  ): Promise<ParentAttendanceSummaryDto> {
    // Verify ownership
    const child = await this.prisma.child.findFirst({
      where: { id: childId, tenantId, parentId, deletedAt: null },
      select: { id: true },
    });
    if (!child) {
      throw new ForbiddenException(
        'Child not found or not associated with your account',
      );
    }

    // Current calendar month
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );

    const statusCounts = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        tenantId,
        childId,
        date: { gte: monthStart, lte: monthEnd },
      },
      _count: { _all: true },
    });

    const countMap = new Map(
      statusCounts.map((s) => [s.status, s._count._all]),
    );

    const totalSchoolDays = statusCounts.reduce(
      (sum, s) => sum + s._count._all,
      0,
    );

    return {
      presentDays: countMap.get(AttendanceStatus.PRESENT) ?? 0,
      absentDays: countMap.get(AttendanceStatus.ABSENT) ?? 0,
      lateDays: countMap.get(AttendanceStatus.LATE) ?? 0,
      excusedDays: countMap.get(AttendanceStatus.EXCUSED) ?? 0,
      totalSchoolDays,
    };
  }
}
