/**
 * Statement Controller
 * TASK-STMT-004: Statement API Endpoints (Surface Layer)
 *
 * @module api/billing/statement
 * @description REST API endpoints for statement generation and retrieval.
 * All monetary values in responses are in CENTS (integers).
 */

import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Res,
  Header,
  Logger,
  HttpCode,
  UseGuards,
  BadRequestException,
  NotFoundException as NestNotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StatementGenerationService } from '../../database/services/statement-generation.service';
import { StatementPdfService } from '../../database/services/statement-pdf.service';
import { StatementRepository } from '../../database/repositories/statement.repository';
import { ParentAccountService } from '../../database/services/parent-account.service';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import {
  GenerateStatementDto,
  BulkGenerateStatementDto,
  ListStatementsQueryDto,
  StatementStatus,
  StatementListResponseDto,
  StatementDetailResponseDto,
  GenerateStatementResponseDto,
  BulkGenerateResponseDto,
  FinalizeStatementResponseDto,
  ParentStatementsResponseDto,
  ParentAccountResponseDto,
  StatementSummaryDto,
  StatementDetailDto,
  StatementLineDto,
  StatementParentDto,
  DeliverStatementDto,
  BulkDeliverStatementDto,
  DeliverStatementResponseDto,
  BulkDeliverResponseDto,
  ScheduleStatementGenerationDto,
  ScheduleStatementResponseDto,
} from './dto/statement.dto';
import { StatementDeliveryService } from '../../database/services/statement-delivery.service';
import { NotificationChannelType } from '../../notifications/types/notification.types';
import { SchedulerService } from '../../scheduler/scheduler.service';
import {
  QUEUE_NAMES,
  StatementGenerationJobData,
} from '../../scheduler/types/scheduler.types';

@Controller('statements')
@ApiTags('Statements')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class StatementController {
  private readonly logger = new Logger(StatementController.name);

  constructor(
    private readonly statementGenerationService: StatementGenerationService,
    private readonly statementPdfService: StatementPdfService,
    private readonly statementRepository: StatementRepository,
    private readonly parentAccountService: ParentAccountService,
    private readonly parentRepository: ParentRepository,
    private readonly statementDeliveryService: StatementDeliveryService,
    @Optional()
    @Inject(SchedulerService)
    private readonly schedulerService: SchedulerService | null,
  ) {}

  /**
   * List all statements with filtering and pagination
   */
  @Get()
  @ApiOperation({
    summary: 'List statements with filtering and pagination',
    description:
      'Returns paginated list of statements for the authenticated tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Statements retrieved successfully',
    type: StatementListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async findAll(
    @Query() query: ListStatementsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<StatementListResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Listing statements for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // Build filter
    const filter: {
      parentId?: string;
      status?: 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED';
      periodStart?: Date;
      periodEnd?: Date;
    } = {};

    if (query.parent_id) {
      filter.parentId = query.parent_id;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.period_start) {
      filter.periodStart = new Date(query.period_start);
    }
    if (query.period_end) {
      filter.periodEnd = new Date(query.period_end);
    }

    // Fetch statements
    const allStatements = await this.statementRepository.findByTenant(
      tenantId,
      filter,
    );

    // Calculate pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = allStatements.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedStatements = allStatements.slice(skip, skip + limit);

    // Fetch parent data for all statements
    const parentIds = [...new Set(paginatedStatements.map((s) => s.parentId))];
    const parentMap = new Map<string, StatementParentDto>();

    for (const parentId of parentIds) {
      const parent = await this.parentRepository.findById(parentId);
      if (parent) {
        parentMap.set(parentId, {
          id: parent.id,
          name: `${parent.firstName} ${parent.lastName}`,
          email: parent.email,
          phone: parent.phone,
        });
      }
    }

    // Transform to response DTOs
    const data: StatementSummaryDto[] = paginatedStatements.map((statement) => {
      const parent = parentMap.get(statement.parentId);
      if (!parent) {
        throw new Error(`Parent data not found for statement ${statement.id}`);
      }

      return {
        id: statement.id,
        statement_number: statement.statementNumber,
        parent,
        period_start: statement.periodStart.toISOString().split('T')[0],
        period_end: statement.periodEnd.toISOString().split('T')[0],
        opening_balance_cents: statement.openingBalanceCents,
        total_charges_cents: statement.totalChargesCents,
        total_payments_cents: statement.totalPaymentsCents,
        total_credits_cents: statement.totalCreditsCents ?? 0,
        closing_balance_cents: statement.closingBalanceCents,
        status: statement.status as StatementStatus,
        generated_at: statement.createdAt,
      };
    });

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get statement by ID with lines
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get statement details by ID',
    description: 'Returns a single statement with all lines',
  })
  @ApiParam({ name: 'id', description: 'Statement ID' })
  @ApiResponse({
    status: 200,
    description: 'Statement retrieved successfully',
    type: StatementDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<StatementDetailResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(`Getting statement ${id} for tenant ${tenantId}`);

    try {
      const statement =
        await this.statementGenerationService.getStatementWithLines(
          tenantId,
          id,
        );

      // Get parent data
      const parent = await this.parentRepository.findById(statement.parentId);
      if (!parent) {
        throw new Error(`Parent not found for statement ${id}`);
      }

      const parentDto: StatementParentDto = {
        id: parent.id,
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.email,
        phone: parent.phone,
      };

      // Transform lines
      const lines: StatementLineDto[] = statement.lines.map((line) => ({
        id: line.id,
        date: line.date.toISOString().split('T')[0],
        description: line.description,
        line_type: line.lineType,
        reference_number: line.referenceNumber,
        debit_cents: line.debitCents,
        credit_cents: line.creditCents,
        balance_cents: line.balanceCents,
      }));

      const data: StatementDetailDto = {
        id: statement.id,
        statement_number: statement.statementNumber,
        parent: parentDto,
        period_start: statement.periodStart.toISOString().split('T')[0],
        period_end: statement.periodEnd.toISOString().split('T')[0],
        opening_balance_cents: statement.openingBalanceCents,
        total_charges_cents: statement.totalChargesCents,
        total_payments_cents: statement.totalPaymentsCents,
        total_credits_cents: statement.totalCreditsCents ?? 0,
        closing_balance_cents: statement.closingBalanceCents,
        status: statement.status as StatementStatus,
        generated_at: statement.createdAt,
        lines,
      };

      return {
        success: true,
        data,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      throw error;
    }
  }

  /**
   * Download statement as PDF
   */
  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Download statement as PDF',
    description: 'Generates and downloads a PDF version of the statement',
  })
  @ApiParam({ name: 'id', description: 'Statement ID' })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description: 'PDF file stream',
    content: {
      'application/pdf': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = user.tenantId;

    this.logger.log(`Downloading PDF for statement ${id}`);

    try {
      // Generate PDF
      const pdfBuffer = await this.statementPdfService.generatePdf(
        tenantId,
        id,
        {
          includePaymentInstructions: true,
        },
      );

      // Get statement for filename
      const statement = await this.statementRepository.findById(id, tenantId);
      if (!statement) {
        throw new NotFoundException('Statement', id);
      }

      // Set response headers
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Statement_${statement.statementNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      // Send PDF buffer
      res.end(pdfBuffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      throw error;
    }
  }

  /**
   * Generate statement for a single parent
   */
  @Post('generate')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Generate statement for a single parent',
    description:
      'Generates an account statement for the specified parent and period',
  })
  @ApiResponse({
    status: 201,
    description: 'Statement generated successfully',
    type: GenerateStatementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or period' })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async generate(
    @Body() dto: GenerateStatementDto,
    @CurrentUser() user: IUser,
  ): Promise<GenerateStatementResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(
      `Generating statement for parent ${dto.parent_id}, period ${dto.period_start} to ${dto.period_end}`,
    );

    // Validate dates
    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);

    if (periodStart >= periodEnd) {
      throw new BadRequestException('Period start must be before period end');
    }

    try {
      const statement = await this.statementGenerationService.generateStatement(
        {
          tenantId,
          parentId: dto.parent_id,
          periodStart,
          periodEnd,
          userId: user.id,
        },
      );

      // Get parent data
      const parent = await this.parentRepository.findById(statement.parentId);
      if (!parent) {
        throw new Error(`Parent not found for statement ${statement.id}`);
      }

      const parentDto: StatementParentDto = {
        id: parent.id,
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.email,
        phone: parent.phone,
      };

      // Transform lines
      const lines: StatementLineDto[] = statement.lines.map((line) => ({
        id: line.id,
        date: line.date.toISOString().split('T')[0],
        description: line.description,
        line_type: line.lineType,
        reference_number: line.referenceNumber,
        debit_cents: line.debitCents,
        credit_cents: line.creditCents,
        balance_cents: line.balanceCents,
      }));

      const data: StatementDetailDto = {
        id: statement.id,
        statement_number: statement.statementNumber,
        parent: parentDto,
        period_start: statement.periodStart.toISOString().split('T')[0],
        period_end: statement.periodEnd.toISOString().split('T')[0],
        opening_balance_cents: statement.openingBalanceCents,
        total_charges_cents: statement.totalChargesCents,
        total_payments_cents: statement.totalPaymentsCents,
        total_credits_cents: statement.totalCreditsCents ?? 0,
        closing_balance_cents: statement.closingBalanceCents,
        status: statement.status as StatementStatus,
        generated_at: statement.createdAt,
        lines,
      };

      return {
        success: true,
        data,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      if (error instanceof BusinessException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Bulk generate statements
   */
  @Post('generate/bulk')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Bulk generate statements',
    description:
      'Generates statements for multiple parents. Can filter to only parents with activity or balance.',
  })
  @ApiResponse({
    status: 201,
    description: 'Bulk generation completed',
    type: BulkGenerateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or period' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async bulkGenerate(
    @Body() dto: BulkGenerateStatementDto,
    @CurrentUser() user: IUser,
  ): Promise<BulkGenerateResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(
      `Bulk generating statements for tenant ${tenantId}, period ${dto.period_start} to ${dto.period_end}`,
    );

    // Validate dates
    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);

    if (periodStart >= periodEnd) {
      throw new BadRequestException('Period start must be before period end');
    }

    const result = await this.statementGenerationService.bulkGenerateStatements(
      {
        tenantId,
        periodStart,
        periodEnd,
        userId: user.id,
        parentIds: dto.parent_ids,
        onlyWithActivity: dto.only_with_activity,
        onlyWithBalance: dto.only_with_balance,
      },
    );

    return {
      success: true,
      data: {
        generated: result.generated,
        skipped: result.skipped,
        errors: result.errors.map((e) => ({
          parent_id: e.parentId,
          error: e.error,
        })),
        statement_ids: result.statementIds,
      },
    };
  }

  /**
   * Finalize a statement
   */
  @Post(':id/finalize')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Finalize a statement',
    description:
      'Changes statement status from DRAFT to FINAL. Finalized statements cannot be modified.',
  })
  @ApiParam({ name: 'id', description: 'Statement ID' })
  @ApiResponse({
    status: 200,
    description: 'Statement finalized successfully',
    type: FinalizeStatementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Statement is not in DRAFT status' })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async finalize(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<FinalizeStatementResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(`Finalizing statement ${id} for tenant ${tenantId}`);

    try {
      const statement = await this.statementGenerationService.finalizeStatement(
        tenantId,
        id,
        user.id,
      );

      // Get parent data
      const parent = await this.parentRepository.findById(statement.parentId);
      if (!parent) {
        throw new Error(`Parent not found for statement ${id}`);
      }

      const parentDto: StatementParentDto = {
        id: parent.id,
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.email,
        phone: parent.phone,
      };

      const data: StatementSummaryDto = {
        id: statement.id,
        statement_number: statement.statementNumber,
        parent: parentDto,
        period_start: statement.periodStart.toISOString().split('T')[0],
        period_end: statement.periodEnd.toISOString().split('T')[0],
        opening_balance_cents: statement.openingBalanceCents,
        total_charges_cents: statement.totalChargesCents,
        total_payments_cents: statement.totalPaymentsCents,
        total_credits_cents: statement.totalCreditsCents ?? 0,
        closing_balance_cents: statement.closingBalanceCents,
        status: statement.status as StatementStatus,
        generated_at: statement.createdAt,
      };

      return {
        success: true,
        message: 'Statement finalized successfully',
        data,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      if (error instanceof BusinessException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Get statements for a specific parent
   */
  @Get('parents/:parentId')
  @ApiOperation({
    summary: 'Get statements for a parent',
    description: 'Returns all statements for the specified parent',
  })
  @ApiParam({ name: 'parentId', description: 'Parent ID' })
  @ApiResponse({
    status: 200,
    description: 'Statements retrieved successfully',
    type: ParentStatementsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getForParent(
    @Param('parentId') parentId: string,
    @CurrentUser() user: IUser,
  ): Promise<ParentStatementsResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Getting statements for parent ${parentId} in tenant ${tenantId}`,
    );

    // Verify parent exists and belongs to tenant
    const parent = await this.parentRepository.findById(parentId);
    if (!parent || parent.tenantId !== tenantId) {
      throw new NestNotFoundException(`Parent with ID ${parentId} not found`);
    }

    const statements =
      await this.statementGenerationService.getStatementsForParent(
        tenantId,
        parentId,
      );

    const parentDto: StatementParentDto = {
      id: parent.id,
      name: `${parent.firstName} ${parent.lastName}`,
      email: parent.email,
      phone: parent.phone,
    };

    const data: StatementSummaryDto[] = statements.map((statement) => ({
      id: statement.id,
      statement_number: statement.statementNumber,
      parent: parentDto,
      period_start: statement.periodStart.toISOString().split('T')[0],
      period_end: statement.periodEnd.toISOString().split('T')[0],
      opening_balance_cents: statement.openingBalanceCents,
      total_charges_cents: statement.totalChargesCents,
      total_payments_cents: statement.totalPaymentsCents,
      total_credits_cents: statement.totalCreditsCents ?? 0,
      closing_balance_cents: statement.closingBalanceCents,
      status: statement.status as StatementStatus,
      generated_at: statement.createdAt,
    }));

    return {
      success: true,
      data,
    };
  }

  /**
   * Get parent account summary
   */
  @Get('parents/:parentId/account')
  @ApiOperation({
    summary: 'Get parent account summary',
    description:
      'Returns account summary including outstanding balance and credits',
  })
  @ApiParam({ name: 'parentId', description: 'Parent ID' })
  @ApiResponse({
    status: 200,
    description: 'Account summary retrieved successfully',
    type: ParentAccountResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Parent not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getParentAccount(
    @Param('parentId') parentId: string,
    @CurrentUser() user: IUser,
  ): Promise<ParentAccountResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Getting account summary for parent ${parentId} in tenant ${tenantId}`,
    );

    try {
      const summary = await this.parentAccountService.getAccountSummary(
        tenantId,
        parentId,
      );

      return {
        success: true,
        data: {
          parent_id: summary.parentId,
          parent_name: summary.parentName,
          email: summary.email,
          phone: summary.phone,
          total_outstanding_cents: summary.totalOutstandingCents,
          credit_balance_cents: summary.creditBalanceCents,
          net_balance_cents: summary.netBalanceCents,
          child_count: summary.childCount,
          oldest_outstanding_date: summary.oldestOutstandingDate
            ? summary.oldestOutstandingDate.toISOString().split('T')[0]
            : null,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      if (error instanceof BusinessException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Deliver a single statement to its parent
   */
  @Post(':id/deliver')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Deliver statement to parent',
    description:
      'Sends the statement to the parent via their preferred notification channel',
  })
  @ApiParam({ name: 'id', description: 'Statement ID' })
  @ApiResponse({
    status: 200,
    description: 'Statement delivered successfully',
    type: DeliverStatementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Statement is not in FINAL status' })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async deliver(
    @Param('id') id: string,
    @Body() dto: DeliverStatementDto,
    @CurrentUser() user: IUser,
  ): Promise<DeliverStatementResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(`Delivering statement ${id} for tenant ${tenantId}`);

    try {
      const result = await this.statementDeliveryService.deliverStatement({
        tenantId,
        statementId: id,
        userId: user.id,
        channel: dto.channel
          ? (dto.channel as NotificationChannelType)
          : undefined,
      });

      return {
        success: result.success,
        message: result.success
          ? 'Statement delivered successfully'
          : `Delivery failed: ${result.error}`,
        data: {
          statement_id: result.statementId,
          parent_id: result.parentId,
          success: result.success,
          channel: result.channel,
          message_id: result.messageId,
          error: result.error,
          delivered_at: result.deliveredAt,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NestNotFoundException(error.message);
      }
      if (error instanceof BusinessException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Bulk deliver statements
   */
  @Post('deliver/bulk')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Bulk deliver statements',
    description: 'Sends multiple statements to their respective parents',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk delivery completed',
    type: BulkDeliverResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async bulkDeliver(
    @Body() dto: BulkDeliverStatementDto,
    @CurrentUser() user: IUser,
  ): Promise<BulkDeliverResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(
      `Bulk delivering ${dto.statement_ids.length} statements for tenant ${tenantId}`,
    );

    const result = await this.statementDeliveryService.bulkDeliverStatements({
      tenantId,
      statementIds: dto.statement_ids,
      userId: user.id,
      channel: dto.channel
        ? (dto.channel as NotificationChannelType)
        : undefined,
    });

    return {
      success: true,
      data: {
        sent: result.sent,
        failed: result.failed,
        results: result.results.map((r) => ({
          statement_id: r.statementId,
          parent_id: r.parentId,
          success: r.success,
          channel: r.channel,
          message_id: r.messageId,
          error: r.error,
          delivered_at: r.deliveredAt,
        })),
      },
    };
  }

  /**
   * Schedule monthly statement generation
   */
  @Post('schedule')
  @HttpCode(202)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Schedule monthly statement generation',
    description:
      'Queues a background job to generate statements for a specific month. Requires Redis to be configured.',
  })
  @ApiResponse({
    status: 202,
    description: 'Statement generation job scheduled',
    type: ScheduleStatementResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or scheduler not available',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async scheduleGeneration(
    @Body() dto: ScheduleStatementGenerationDto,
    @CurrentUser() user: IUser,
  ): Promise<ScheduleStatementResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(
      `Scheduling statement generation for tenant ${tenantId}, month ${dto.statement_month}`,
    );

    // Check if scheduler is available (Redis configured)
    if (!this.schedulerService) {
      throw new BadRequestException(
        'Scheduler not available. Redis must be configured to use scheduled jobs. ' +
          'Use the /generate/bulk endpoint for immediate generation instead.',
      );
    }

    try {
      // Build job data
      const jobData: StatementGenerationJobData = {
        tenantId,
        statementMonth: dto.statement_month,
        parentIds: dto.parent_ids,
        onlyWithActivity: dto.only_with_activity,
        onlyWithBalance: dto.only_with_balance,
        dryRun: dto.dry_run,
        autoFinalize: dto.auto_finalize,
        autoDeliver: dto.auto_deliver,
        triggeredBy: 'manual',
        scheduledAt: new Date(),
      };

      // Queue the job
      const job = await this.schedulerService.scheduleJob(
        QUEUE_NAMES.STATEMENT_GENERATION,
        jobData,
      );

      return {
        success: true,
        message: 'Statement generation job scheduled successfully',
        data: {
          job_id: String(job.id),
          queue: QUEUE_NAMES.STATEMENT_GENERATION,
          status: 'waiting',
          statement_month: dto.statement_month,
          scheduled_at: new Date(),
        },
      };
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        },
        file: 'statement.controller.ts',
        function: 'scheduleGeneration',
        inputs: { tenantId, statementMonth: dto.statement_month },
        timestamp: new Date().toISOString(),
      });

      if (error instanceof BusinessException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
