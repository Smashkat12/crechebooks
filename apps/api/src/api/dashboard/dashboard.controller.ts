import { Controller, Get, Query, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { DashboardMetricsResponseDto } from './dto/dashboard-metrics.dto';
import { DashboardTrendsResponseDto } from './dto/dashboard-trends.dto';
import { AccuracyMetricsService } from '../../database/services/accuracy-metrics.service';
import type { LearningModeProgress } from '../../database/dto/accuracy.dto';

@Controller('dashboard')
@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly accuracyMetricsService: AccuracyMetricsService,
  ) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Get dashboard metrics',
    description:
      'Returns aggregated metrics for revenue, expenses, arrears, and enrollment',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Period for metrics (e.g., "current_month", "last_quarter")',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Calendar year to filter by (e.g., 2024, 2025)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics retrieved successfully',
    type: DashboardMetricsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getMetrics(
    @CurrentUser() user: IUser,
    @Query('period') period?: string,
    @Query('year') year?: string,
  ): Promise<DashboardMetricsResponseDto> {
    this.logger.debug(
      `Getting metrics for tenant ${user.tenantId}, year=${year || 'auto'}`,
    );
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getMetrics(user.tenantId, period, yearNum);
  }

  @Get('trends')
  @ApiOperation({
    summary: 'Get dashboard trends',
    description:
      'Returns time-series data for revenue, expenses, and arrears over time',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Period for trends (e.g., "last_6_months", "last_year")',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description:
      'Calendar year to filter by (e.g., 2024, 2025). Shows all 12 months when specified.',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard trends retrieved successfully',
    type: DashboardTrendsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getTrends(
    @CurrentUser() user: IUser,
    @Query('period') period?: string,
    @Query('year') year?: string,
  ): Promise<DashboardTrendsResponseDto> {
    this.logger.debug(
      `Getting trends for tenant ${user.tenantId}, year=${year || 'auto'}`,
    );
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.dashboardService.getTrends(user.tenantId, period, yearNum);
  }

  @Get('available-periods')
  @ApiOperation({
    summary: 'Get available data periods',
    description:
      'Returns the date range of available transaction data and available financial years for filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available periods retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getAvailablePeriods(@CurrentUser() user: IUser) {
    this.logger.debug(`Getting available periods for tenant ${user.tenantId}`);
    return this.dashboardService.getAvailablePeriods(user.tenantId);
  }

  @Get('learning-mode')
  @ApiOperation({
    summary: 'Get learning mode progress',
    description:
      'Returns learning mode status and progress for the tenant. Learning mode is active during first 90 days OR with <100 corrections.',
  })
  @ApiResponse({
    status: 200,
    description: 'Learning mode progress retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  async getLearningMode(
    @CurrentUser() user: IUser,
  ): Promise<LearningModeProgress> {
    this.logger.debug(
      `Getting learning mode progress for tenant ${user.tenantId}`,
    );
    return this.accuracyMetricsService.getLearningModeProgress(user.tenantId);
  }
}
