/**
 * ParentAbsenceService
 *
 * Manages parent pre-reported absences (backlog #9).
 *
 * Design decisions:
 * - New table `parent_absence_reports` separate from `attendance_records` so
 *   admin facts and parent intent remain distinct.
 * - Ownership boundary: parentId + tenantId + child.parentId triple check,
 *   matching the pattern in parent-portal-child.service.ts.
 * - PII rule: child names and parent names are never written to the logger;
 *   only UUIDs appear in structured logs.
 * - Cancellation is a soft-delete (cancelledAt timestamp set, row kept for
 *   audit trail). Only the parent who created the report (or any parent on the
 *   same account) may cancel, and only while the absence date is still in the
 *   future.
 * - Admin override: when an admin marks attendance for a child that has an
 *   active (non-cancelled) absence report on that date, the service preserves
 *   the parent's reason in the AttendanceRecord.note if note is currently null.
 *   The AttendanceRecord is authoritative; the report is informational.
 * - Future-date validation: the report date must be today or later. Past dates
 *   are rejected (the absence already happened — no value in pre-reporting).
 *   Today is accepted because a parent might phone in the morning.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import type { ReportAbsenceDto } from './dto/parent-absence-report.dto';
import type {
  AbsenceReportResponseDto,
  AbsenceReportListResponseDto,
} from './dto/parent-absence-report.dto';

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
// Helper: reject past dates (before today UTC)
// ------------------------------------------------------------------
function rejectPastDate(dateStr: string): void {
  const d = parseDate(dateStr);
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  if (d < todayUTC) {
    throw new BadRequestException(
      `date must be today or in the future (got ${dateStr})`,
    );
  }
}

// ------------------------------------------------------------------
// Helper: map Prisma row → DTO
// ------------------------------------------------------------------
function toDto(row: {
  id: string;
  tenantId: string;
  childId: string;
  parentId: string;
  date: Date;
  reason: string | null;
  reportedAt: Date;
  cancelledAt: Date | null;
  cancelledByParentId: string | null;
}): AbsenceReportResponseDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    childId: row.childId,
    parentId: row.parentId,
    date: row.date.toISOString().slice(0, 10),
    reason: row.reason,
    reportedAt: row.reportedAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelledByParentId: row.cancelledByParentId,
  };
}

@Injectable()
export class ParentAbsenceService {
  private readonly logger = new Logger(ParentAbsenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ------------------------------------------------------------------
  // Resolve child ownership: parent must own the child in the tenant.
  // Returns the child row (throws ForbiddenException otherwise).
  // ------------------------------------------------------------------
  private async resolveOwnedChild(
    tenantId: string,
    parentId: string,
    childId: string,
  ) {
    const child = await this.prisma.child.findFirst({
      where: { id: childId, tenantId, parentId, deletedAt: null },
      select: { id: true },
    });
    if (!child) {
      throw new ForbiddenException(
        'Child not found or not associated with your account',
      );
    }
    return child;
  }

  // ------------------------------------------------------------------
  // POST — parent creates an absence report
  // ------------------------------------------------------------------
  async reportAbsence(
    tenantId: string,
    parentId: string,
    childId: string,
    dto: ReportAbsenceDto,
  ): Promise<AbsenceReportResponseDto> {
    rejectPastDate(dto.date);
    await this.resolveOwnedChild(tenantId, parentId, childId);

    const dateVal = parseDate(dto.date);

    // Check for an existing active (non-cancelled) report on this date
    const existing = await this.prisma.parentAbsenceReport.findUnique({
      where: { childId_date: { childId, date: dateVal } },
    });

    if (existing && !existing.cancelledAt) {
      throw new ConflictException(
        `An absence report already exists for this child on ${dto.date}`,
      );
    }

    // If there's a cancelled row for this slot, hard-delete it so we can insert
    // a new one (unique constraint on childId+date).
    if (existing && existing.cancelledAt) {
      await this.prisma.parentAbsenceReport.delete({
        where: { id: existing.id },
      });
    }

    const report = await this.prisma.parentAbsenceReport.create({
      data: {
        tenantId,
        childId,
        parentId,
        date: dateVal,
        reason: dto.reason ?? null,
      },
    });

    await this.auditLog.logCreate({
      tenantId,
      userId: parentId, // parent-portal actions use parentId as actor
      entityType: 'ParentAbsenceReport',
      entityId: report.id,
      afterValue: {
        childId,
        date: dto.date,
        reason: dto.reason ?? null,
        via: 'parent-portal',
      } as Prisma.InputJsonValue,
    });

    this.logger.debug(
      `reportAbsence: created report ${report.id} for child ${childId} in tenant ${tenantId} on ${dto.date}`,
    );

    return toDto(report);
  }

  // ------------------------------------------------------------------
  // GET — parent reads their own absence reports for a child
  // ------------------------------------------------------------------
  async listAbsences(
    tenantId: string,
    parentId: string,
    childId: string,
    from?: string,
    to?: string,
  ): Promise<AbsenceReportListResponseDto> {
    await this.resolveOwnedChild(tenantId, parentId, childId);

    const defaultFrom = new Date();
    defaultFrom.setUTCHours(0, 0, 0, 0);

    const dateFilter: Prisma.DateTimeFilter = {
      gte: from ? parseDate(from) : defaultFrom,
      ...(to ? { lte: parseDate(to) } : {}),
    };

    const rows = await this.prisma.parentAbsenceReport.findMany({
      where: { tenantId, childId, date: dateFilter },
      orderBy: { date: 'asc' },
    });

    return { total: rows.length, reports: rows.map(toDto) };
  }

  // ------------------------------------------------------------------
  // DELETE — parent cancels a future absence report
  // ------------------------------------------------------------------
  async cancelAbsence(
    tenantId: string,
    parentId: string,
    childId: string,
    reportId: string,
  ): Promise<void> {
    await this.resolveOwnedChild(tenantId, parentId, childId);

    const report = await this.prisma.parentAbsenceReport.findFirst({
      where: { id: reportId, tenantId, childId },
    });

    if (!report) {
      throw new NotFoundException(`Absence report ${reportId} not found`);
    }

    if (report.cancelledAt) {
      throw new BadRequestException('Absence report is already cancelled');
    }

    // Can only cancel future (or today's) reports
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    if (report.date < todayUTC) {
      throw new BadRequestException(
        'Cannot cancel an absence report for a past date',
      );
    }

    const now = new Date();

    await this.prisma.parentAbsenceReport.update({
      where: { id: reportId },
      data: {
        cancelledAt: now,
        cancelledByParentId: parentId,
      },
    });

    await this.auditLog.logAction({
      tenantId,
      userId: parentId,
      entityType: 'ParentAbsenceReport',
      entityId: reportId,
      action: AuditAction.DELETE,
      beforeValue: {
        childId,
        date: report.date.toISOString().slice(0, 10),
        reason: report.reason,
      } as Prisma.InputJsonValue,
      changeSummary: `Parent cancelled absence report for child ${childId} on ${report.date.toISOString().slice(0, 10)}`,
    });

    this.logger.debug(
      `cancelAbsence: soft-deleted report ${reportId} for child ${childId} in tenant ${tenantId}`,
    );
  }

  // ------------------------------------------------------------------
  // ADMIN: fetch active (non-cancelled) absence reports for a date.
  // Used by findByDate and todaySummary in AttendanceService.
  // ------------------------------------------------------------------
  async getActiveReportsForDate(
    tenantId: string,
    dateStr: string,
  ): Promise<
    {
      id: string;
      childId: string;
      parentId: string;
      reason: string | null;
      reportedAt: Date;
    }[]
  > {
    const dateVal = parseDate(dateStr);
    return this.prisma.parentAbsenceReport.findMany({
      where: { tenantId, date: dateVal, cancelledAt: null },
      select: {
        id: true,
        childId: true,
        parentId: true,
        reason: true,
        reportedAt: true,
      },
    });
  }

  // ------------------------------------------------------------------
  // ADMIN: find active report for a specific child on a date.
  // Called by AttendanceService.markAttendance to carry the reason forward.
  // ------------------------------------------------------------------
  async getActiveReportForChild(
    tenantId: string,
    childId: string,
    dateStr: string,
  ): Promise<{ id: string; reason: string | null } | null> {
    const dateVal = parseDate(dateStr);
    const row = await this.prisma.parentAbsenceReport.findFirst({
      where: { tenantId, childId, date: dateVal, cancelledAt: null },
      select: { id: true, reason: true },
    });
    return row ?? null;
  }
}
