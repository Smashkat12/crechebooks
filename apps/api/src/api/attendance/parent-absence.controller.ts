/**
 * ParentAbsenceController — parent-portal absence pre-report routes.
 *
 * Route prefix: /parent-portal/children/:childId/absences
 * Auth: ParentAuthGuard (session token from parent-portal login).
 * Ownership: service verifies child.parentId === session.parentId + tenantId.
 */

import {
  Controller,
  Get,
  Post,
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
import { Public } from '../auth/decorators/public.decorator';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import {
  CurrentParent,
  type ParentSession,
} from '../auth/decorators/current-parent.decorator';
import { ParentAbsenceService } from './parent-absence.service';
import { ReportAbsenceDto } from './dto/parent-absence-report.dto';

@ApiTags('Parent Portal – Absences')
@ApiBearerAuth()
@Controller('parent-portal/children/:childId/absences')
@Public() // Skip global JwtAuthGuard — ParentAuthGuard handles auth
@UseGuards(ParentAuthGuard)
export class ParentAbsenceController {
  private readonly logger = new Logger(ParentAbsenceController.name);

  constructor(private readonly absenceService: ParentAbsenceService) {}

  // ------------------------------------------------------------------
  // POST /parent-portal/children/:childId/absences
  // ------------------------------------------------------------------
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pre-report a future absence for your child',
    description:
      'Date must be today or in the future. One active report per child per day.',
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiResponse({
    status: 201,
    description: 'AbsenceReportResponseDto — report created',
  })
  @ApiResponse({ status: 400, description: 'Validation error or past date' })
  @ApiResponse({
    status: 403,
    description: 'Child not associated with this parent',
  })
  @ApiResponse({
    status: 409,
    description: 'Active report already exists for this date',
  })
  async reportAbsence(
    @CurrentParent() session: ParentSession,
    @Param('childId') childId: string,
    @Body() dto: ReportAbsenceDto,
  ) {
    this.logger.debug(
      `reportAbsence: parentId=${session.parentId} childId=${childId}`,
    );
    return this.absenceService.reportAbsence(
      session.tenantId,
      session.parentId,
      childId,
      dto,
    );
  }

  // ------------------------------------------------------------------
  // GET /parent-portal/children/:childId/absences?from=&to=
  // ------------------------------------------------------------------
  @Get()
  @ApiOperation({
    summary: 'List own absence reports for a child',
    description:
      'Defaults to today onwards. Pass from/to (YYYY-MM-DD) to filter.',
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiResponse({
    status: 200,
    description: 'AbsenceReportListResponseDto — { total, reports[] }',
  })
  @ApiResponse({
    status: 403,
    description: 'Child not associated with this parent',
  })
  async listAbsences(
    @CurrentParent() session: ParentSession,
    @Param('childId') childId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.logger.debug(
      `listAbsences: parentId=${session.parentId} childId=${childId}`,
    );
    return this.absenceService.listAbsences(
      session.tenantId,
      session.parentId,
      childId,
      from,
      to,
    );
  }

  // ------------------------------------------------------------------
  // DELETE /parent-portal/children/:childId/absences/:id
  // ------------------------------------------------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel a future absence report',
    description:
      'Only cancellable while the absence date is today or in the future.',
  })
  @ApiParam({ name: 'childId', description: 'Child ID' })
  @ApiParam({ name: 'id', description: 'AbsenceReport ID' })
  @ApiResponse({ status: 204, description: 'Report cancelled (soft-deleted)' })
  @ApiResponse({
    status: 400,
    description: 'Already cancelled or date is in the past',
  })
  @ApiResponse({
    status: 403,
    description: 'Child not associated with this parent',
  })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async cancelAbsence(
    @CurrentParent() session: ParentSession,
    @Param('childId') childId: string,
    @Param('id') reportId: string,
  ) {
    this.logger.debug(
      `cancelAbsence: parentId=${session.parentId} childId=${childId} reportId=${reportId}`,
    );
    await this.absenceService.cancelAbsence(
      session.tenantId,
      session.parentId,
      childId,
      reportId,
    );
  }
}
