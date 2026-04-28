/**
 * ParentAttendanceController — parent-portal read-only attendance routes.
 *
 * Route prefix: /parent-portal/attendance
 * Auth: ParentAuthGuard (session token from parent-portal login).
 * Ownership: service verifies child.parentId === session.parentId.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import {
  CurrentParent,
  type ParentSession,
} from '../auth/decorators/current-parent.decorator';
import { AttendanceService } from './attendance.service';

@ApiTags('Parent Portal – Attendance')
@ApiBearerAuth()
@Controller('parent-portal/attendance')
@Public() // Skip global JwtAuthGuard — ParentAuthGuard handles auth
@UseGuards(ParentAuthGuard)
export class ParentAttendanceController {
  private readonly logger = new Logger(ParentAttendanceController.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  // ------------------------------------------------------------------
  // GET /parent-portal/attendance/child/:childId
  // ------------------------------------------------------------------
  @Get('child/:childId')
  @ApiOperation({
    summary: "Read own child's attendance history (default last 30 days)",
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'AttendanceResponseDto[]' })
  @ApiResponse({
    status: 403,
    description: 'Child not associated with this parent',
  })
  async childAttendance(
    @CurrentParent() session: ParentSession,
    @Param('childId') childId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.parentChildAttendance(
      session.tenantId,
      session.parentId,
      childId,
      from,
      to,
    );
  }

  // ------------------------------------------------------------------
  // GET /parent-portal/attendance/child/:childId/summary
  // ------------------------------------------------------------------
  @Get('child/:childId/summary')
  @ApiOperation({
    summary: 'Child attendance summary for current month (parent view)',
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({ status: 200, description: 'ParentAttendanceSummaryDto' })
  @ApiResponse({
    status: 403,
    description: 'Child not associated with this parent',
  })
  async childSummary(
    @CurrentParent() session: ParentSession,
    @Param('childId') childId: string,
  ) {
    return this.attendanceService.parentChildSummary(
      session.tenantId,
      session.parentId,
      childId,
    );
  }
}
