/**
 * AttendanceResponseDto
 *
 * Shape returned by attendance endpoints.
 * No raw names in logs — consumer displays names from this DTO.
 */

import { AttendanceStatus } from '@prisma/client';

export class AttendanceResponseDto {
  id: string;
  tenantId: string;
  childId: string;
  classGroupId: string | null;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  arrivalAt: string | null; // ISO 8601 or null
  departureAt: string | null; // ISO 8601 or null
  note: string | null;
  markedById: string;
  markedAt: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  // Joined fields (present when query includes relations)
  child?: {
    firstName: string;
    lastName: string;
  };
  classGroup?: {
    name: string;
  } | null;
}

export class AttendanceListResponseDto {
  total: number;
  records: AttendanceResponseDto[];
}

export class AttendanceSummaryDto {
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  earlyPickupCount: number;
  /** Children with no attendance_records row for today */
  unmarkedCount: number;
  /**
   * Subset of unmarkedCount: unmarked children who have an active parent
   * pre-report for today. These appear in the Today tile as "REPORTED_ABSENT".
   */
  reportedAbsentCount: number;
}

export class ClassGroupDailyReportDto {
  classGroupId: string;
  classGroupName: string;
  date: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  earlyPickupCount: number;
  records: AttendanceResponseDto[];
  /**
   * Active parent pre-reports for children in this class group that have NOT
   * yet been marked by admin on this date. Teachers see "Lebo: REPORTED ABSENT"
   * rather than just "Lebo: unmarked".
   */
  parentPreReports: ParentPreReportDto[];
}

export class ParentAttendanceSummaryDto {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  totalSchoolDays: number;
}

/**
 * Slim shape for a parent absence pre-report, embedded in AdminDayViewDto.
 */
export class ParentPreReportDto {
  reportId: string;
  childId: string;
  parentId: string;
  reason: string | null;
  reportedAt: string; // ISO 8601
}

/**
 * Admin day-view response: full attendance records + any parent pre-reports for
 * children who do not yet have an attendance_records row on that date.
 * parentPreReports lists children not yet marked whose parent has sent a report.
 */
export class AdminDayViewDto {
  date: string; // YYYY-MM-DD
  records: AttendanceResponseDto[];
  parentPreReports: ParentPreReportDto[]; // pre-reports for still-unmarked children
}
