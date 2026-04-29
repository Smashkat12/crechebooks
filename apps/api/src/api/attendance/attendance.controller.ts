/**
 * AttendanceController — admin/staff routes
 *
 * Route prefix: /attendance  (registered under /api/v1/ via global prefix)
 * Roles: OWNER, ADMIN, VIEWER for read+write; OWNER, ADMIN for delete.
 * Note: the Prisma UserRole enum has no STAFF value. VIEWER is the closest
 * role for teaching staff (read/mark). If a STAFF role is added in future,
 * update these decorators accordingly.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
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
import { AttendanceStatus } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(RolesGuard)
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  // ------------------------------------------------------------------
  // POST /attendance  — mark single record (upsert)
  // ------------------------------------------------------------------
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark or update a single child attendance record' })
  @ApiResponse({ status: 200, description: 'AttendanceRecord created/updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Child not found in tenant' })
  async mark(@CurrentUser() user: IUser, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(
      getTenantId(user),
      user.id,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // POST /attendance/bulk
  // ------------------------------------------------------------------
  @Post('bulk')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk mark attendance for multiple children' })
  @ApiResponse({
    status: 200,
    description: '{ marked: N, date: YYYY-MM-DD }',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or cross-tenant child IDs',
  })
  async bulkMark(
    @CurrentUser() user: IUser,
    @Body() dto: BulkMarkAttendanceDto,
  ) {
    return this.attendanceService.bulkMarkAttendance(
      getTenantId(user),
      user.id,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // GET /attendance  — list with filters
  // ------------------------------------------------------------------
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'List attendance records with optional filters' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'classGroupId', required: false })
  @ApiQuery({ name: 'childId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: AttendanceStatus })
  @ApiResponse({ status: 200, description: '{ total, records[] }' })
  async list(
    @CurrentUser() user: IUser,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classGroupId') classGroupId?: string,
    @Query('childId') childId?: string,
    @Query('status') status?: AttendanceStatus,
  ) {
    return this.attendanceService.list(getTenantId(user), {
      date,
      from,
      to,
      classGroupId,
      childId,
      status,
    });
  }

  // ------------------------------------------------------------------
  // GET /attendance/summary/today  — Today tile counts
  // ------------------------------------------------------------------
  @Get('summary/today')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary:
      'Today attendance summary counts (present/absent/late/excused/earlyPickup/unmarked)',
  })
  @ApiResponse({ status: 200, description: 'AttendanceSummaryDto' })
  async todaySummary(@CurrentUser() user: IUser) {
    return this.attendanceService.todaySummary(getTenantId(user));
  }

  // ------------------------------------------------------------------
  // GET /attendance/by-date/:date
  // Returns AdminDayViewDto: records[] + parentPreReports[] for unmarked children
  // ------------------------------------------------------------------
  @Get('by-date/:date')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary:
      'All records for a date with child name + class group (Today tile data). ' +
      'Also includes parentPreReports for unmarked children whose parent sent a pre-report.',
  })
  @ApiParam({ name: 'date', description: 'YYYY-MM-DD' })
  @ApiResponse({
    status: 200,
    description: 'AdminDayViewDto: { date, records[], parentPreReports[] }',
  })
  async byDate(@CurrentUser() user: IUser, @Param('date') date: string) {
    return this.attendanceService.findByDate(getTenantId(user), date);
  }

  // ------------------------------------------------------------------
  // GET /attendance/child/:childId
  // ------------------------------------------------------------------
  @Get('child/:childId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Attendance history for a child (default last 90 days)',
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'AttendanceResponseDto[]' })
  @ApiResponse({ status: 404, description: 'Child not found' })
  async childHistory(
    @CurrentUser() user: IUser,
    @Param('childId') childId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.findByChild(
      getTenantId(user),
      childId,
      from,
      to,
    );
  }

  // ------------------------------------------------------------------
  // GET /attendance/class-group/:classGroupId/by-date/:date
  // ------------------------------------------------------------------
  @Get('class-group/:classGroupId/by-date/:date')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Daily class report: status counts + per-child rows',
  })
  @ApiParam({ name: 'classGroupId', description: 'ClassGroup ID' })
  @ApiParam({ name: 'date', description: 'YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'ClassGroupDailyReportDto' })
  @ApiResponse({ status: 404, description: 'ClassGroup not found' })
  async classGroupDailyReport(
    @CurrentUser() user: IUser,
    @Param('classGroupId') classGroupId: string,
    @Param('date') date: string,
  ) {
    return this.attendanceService.classGroupDailyReport(
      getTenantId(user),
      classGroupId,
      date,
    );
  }

  // ------------------------------------------------------------------
  // PATCH /attendance/:id
  // ------------------------------------------------------------------
  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  @ApiOperation({ summary: 'Edit an existing attendance record' })
  @ApiParam({ name: 'id', description: 'AttendanceRecord ID' })
  @ApiResponse({ status: 200, description: 'Updated AttendanceResponseDto' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async update(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.updateAttendance(
      getTenantId(user),
      id,
      user.id,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /attendance/:id  — hard delete, OWNER+ADMIN only
  // ------------------------------------------------------------------
  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard-delete an attendance record (factual correction)',
  })
  @ApiParam({ name: 'id', description: 'AttendanceRecord ID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async remove(@CurrentUser() user: IUser, @Param('id') id: string) {
    await this.attendanceService.deleteAttendance(
      getTenantId(user),
      id,
      user.id,
    );
  }
}
