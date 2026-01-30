/**
 * Reports Controller
 * TASK-REPORTS-002: Reports API Module
 *
 * @module modules/reports/reports.controller
 * @description REST API endpoints for reports - data, insights, and exports.
 *
 * CRITICAL RULES:
 * - Tenant isolation via user context
 * - Role-based access control
 * - All endpoints documented with Swagger
 * - NO WORKAROUNDS - fail fast with proper errors
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  Logger,
  BadRequestException,
  ParseEnumPipe,
  HttpStatus,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../api/auth/decorators/roles.decorator';
import { CurrentUser } from '../../api/auth/decorators/current-user.decorator';
import { getTenantId } from '../../api/auth/utils/tenant-assertions';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { ReportsService } from './reports.service';
import {
  ReportQueryDto,
  ReportDataResponseDto,
  ReportType,
} from './dto/report-data.dto';
import {
  InsightsRequestDto,
  AIInsightsResponseDto,
} from './dto/ai-insights.dto';
import {
  ExportQueryDto,
  ExportFormat,
  EXPORT_CONTENT_TYPES,
} from './dto/export-report.dto';

@Controller('reports')
@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Get report data for dashboard display.
   * Returns JSON data suitable for charts and data tables.
   */
  @Get(':type/data')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get report data for dashboard display',
    description:
      'Returns report data as JSON with chart-ready transformations. ' +
      'Includes summary, sections, chart data, and historical comparison. ' +
      'Cached for 5 minutes per tenant/type/period combination.',
  })
  @ApiParam({
    name: 'type',
    description: 'Report type',
    enum: ReportType,
    example: 'INCOME_STATEMENT',
  })
  @ApiQuery({
    name: 'start',
    description: 'Period start date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'end',
    description: 'Period end date (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'includeHistorical',
    description: 'Include 12-month historical comparison data',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Report data retrieved successfully',
    type: ReportDataResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid report type or date range',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - insufficient permissions',
  })
  async getReportData(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Query() query: ReportQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ReportDataResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `GET /reports/${type}/data for tenant ${tenantId}, period ${query.start.toISOString()} to ${query.end.toISOString()}`,
    );

    return this.reportsService.getReportData(
      type,
      query.start,
      query.end,
      tenantId,
      query.includeHistorical,
    );
  }

  /**
   * Generate AI insights for a report.
   * Uses Claude AI for analysis with rule-based fallback.
   */
  @Post(':type/insights')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Generate AI insights for report',
    description:
      'Generates AI-powered insights including executive summary, key findings, ' +
      'trend analysis, anomaly detection, and recommendations. ' +
      'Uses Claude AI when available, with rule-based fallback. ' +
      'Cached for 10 minutes per tenant/type/period combination.',
  })
  @ApiParam({
    name: 'type',
    description: 'Report type',
    enum: ReportType,
    example: 'INCOME_STATEMENT',
  })
  @ApiBody({
    description: 'Report data to analyze',
    type: InsightsRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'AI insights generated successfully',
    type: AIInsightsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid report type or data',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - VIEWER role cannot generate insights',
  })
  async generateInsights(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Body() body: InsightsRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<AIInsightsResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(`POST /reports/${type}/insights for tenant ${tenantId}`);

    return this.reportsService.generateInsights(
      type,
      body.reportData,
      tenantId,
    );
  }

  /**
   * Export report as PDF, Excel, or CSV.
   * Streams the file to the client.
   */
  @Get(':type/export')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Export report as PDF, Excel, or CSV',
    description:
      'Generates and downloads a report in the specified format. ' +
      'PDF and Excel include formatting and branding. ' +
      'Optionally includes AI-generated insights.',
  })
  @ApiParam({
    name: 'type',
    description: 'Report type',
    enum: ReportType,
    example: 'INCOME_STATEMENT',
  })
  @ApiQuery({
    name: 'start',
    description: 'Period start date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'end',
    description: 'Period end date (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'format',
    description: 'Export format',
    enum: ExportFormat,
    example: 'PDF',
  })
  @ApiQuery({
    name: 'includeInsights',
    description: 'Include AI-generated insights in the export',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Report file streamed to client',
    content: {
      'application/pdf': {},
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
      'text/csv': {},
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid report type, date range, or format',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - VIEWER role cannot export reports',
  })
  async exportReport(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `GET /reports/${type}/export for tenant ${tenantId}, format ${query.format}`,
    );

    const result = await this.reportsService.exportReport(
      type,
      query.start,
      query.end,
      query.format,
      query.includeInsights ?? true,
      tenantId,
    );

    // Set response headers
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);

    // Stream the buffer
    res.status(HttpStatus.OK).send(result.buffer);
  }

  /**
   * Get available report types and their descriptions.
   */
  @Get('types')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get available report types',
    description: 'Returns a list of available report types with descriptions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Report types retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getReportTypes(@CurrentUser() user: IUser): Promise<{
    types: Array<{
      type: ReportType;
      name: string;
      description: string;
      available: boolean;
    }>;
  }> {
    const tenantId = getTenantId(user);
    this.logger.debug(`GET /reports/types for tenant ${tenantId}`);

    return {
      types: [
        {
          type: ReportType.INCOME_STATEMENT,
          name: 'Income Statement',
          description:
            'Profit & Loss report showing income and expenses for a period',
          available: true,
        },
        {
          type: ReportType.BALANCE_SHEET,
          name: 'Balance Sheet',
          description:
            'Snapshot of assets, liabilities, and equity at a point in time',
          available: true,
        },
        {
          type: ReportType.CASH_FLOW,
          name: 'Cash Flow Statement',
          description: 'Analysis of cash inflows and outflows',
          available: false,
        },
        {
          type: ReportType.VAT_REPORT,
          name: 'VAT Report',
          description: 'VAT201 report for SARS submission',
          available: false,
        },
        {
          type: ReportType.AGED_RECEIVABLES,
          name: 'Aged Receivables',
          description: 'Outstanding invoices grouped by age',
          available: false,
        },
        {
          type: ReportType.AGED_PAYABLES,
          name: 'Aged Payables',
          description: 'Outstanding payables grouped by age',
          available: false,
        },
      ],
    };
  }

  /**
   * Get available export formats.
   */
  @Get('formats')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get available export formats',
    description:
      'Returns a list of available export formats with descriptions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Export formats retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getExportFormats(@CurrentUser() user: IUser): Promise<{
    formats: Array<{
      format: ExportFormat;
      name: string;
      contentType: string;
      description: string;
    }>;
  }> {
    const tenantId = getTenantId(user);
    this.logger.debug(`GET /reports/formats for tenant ${tenantId}`);

    return {
      formats: [
        {
          format: ExportFormat.PDF,
          name: 'PDF',
          contentType: EXPORT_CONTENT_TYPES[ExportFormat.PDF],
          description: 'Portable Document Format with branding and formatting',
        },
        {
          format: ExportFormat.EXCEL,
          name: 'Excel',
          contentType: EXPORT_CONTENT_TYPES[ExportFormat.EXCEL],
          description:
            'Microsoft Excel spreadsheet with formulas and formatting',
        },
        {
          format: ExportFormat.CSV,
          name: 'CSV',
          contentType: EXPORT_CONTENT_TYPES[ExportFormat.CSV],
          description: 'Comma-separated values for import into other systems',
        },
      ],
    };
  }
}
