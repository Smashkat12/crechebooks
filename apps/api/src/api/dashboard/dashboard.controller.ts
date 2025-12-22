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

@Controller('dashboard')
@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

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
  ): Promise<DashboardMetricsResponseDto> {
    this.logger.debug(`Getting metrics for tenant ${user.tenantId}`);
    return this.dashboardService.getMetrics(user.tenantId, period);
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
  ): Promise<DashboardTrendsResponseDto> {
    this.logger.debug(`Getting trends for tenant ${user.tenantId}`);
    return this.dashboardService.getTrends(user.tenantId, period);
  }
}
