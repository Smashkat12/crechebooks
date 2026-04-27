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
  unmarkedCount: number;
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
}

export class ParentAttendanceSummaryDto {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  totalSchoolDays: number;
}
