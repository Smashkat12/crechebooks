import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Logger,
  Res,
  BadRequestException,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { PopOrphanSweepJob } from '../../jobs/pop-orphan-sweep.job';
import {
  ContactSubmissionsResponseDto,
  DemoRequestsResponseDto,
} from './dto/submissions.dto';
import {
  ListTenantsQueryDto,
  CreateTenantDto,
  UpdateTenantDto,
  TenantDetailDto,
  TenantStatsDto,
  TenantsListResponseDto,
  SuspendTenantDto,
} from './dto/tenants.dto';
import {
  ListUsersQueryDto,
  UserDetailDto,
  UserStatsDto,
  UsersListResponseDto,
  UserActivityDto,
} from './dto/users.dto';
import {
  PlatformMetricsDto,
  TenantGrowthDto,
  SubscriptionBreakdownDto,
  TopTenantDto,
  RecentActivityDto,
} from './dto/analytics.dto';
import {
  ListAuditLogsQueryDto,
  AuditLogStatsDto,
  AuditLogsListResponseDto,
  AuditLogExportQueryDto,
} from './dto/audit-logs.dto';

/** Max export window: 366 days (accounts for leap years) */
const MAX_EXPORT_DAYS = 366;

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly popOrphanSweepJob: PopOrphanSweepJob,
  ) {}

  // ============================================
  // CONTACT & DEMO SUBMISSIONS
  // ============================================

  @Get('contact-submissions')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all contact form submissions',
    description:
      'Returns all contact form submissions for platform administrators.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact submissions retrieved successfully',
    type: ContactSubmissionsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getContactSubmissions(): Promise<ContactSubmissionsResponseDto> {
    this.logger.debug('Getting contact submissions');
    return this.adminService.getContactSubmissions();
  }

  @Get('demo-requests')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all demo requests',
    description: 'Returns all demo requests for platform administrators.',
  })
  @ApiResponse({
    status: 200,
    description: 'Demo requests retrieved successfully',
    type: DemoRequestsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getDemoRequests(): Promise<DemoRequestsResponseDto> {
    this.logger.debug('Getting demo requests');
    return this.adminService.getDemoRequests();
  }

  @Patch('contact-submissions/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update contact submission status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async updateContactSubmissionStatus(
    @Param('id') id: string,
    @Body('status') status: 'PENDING' | 'CONTACTED',
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Updating contact submission ${id} status to ${status}`);
    await this.adminService.updateContactSubmissionStatus(id, status);
    return {
      success: true,
      message: `Contact submission status updated to ${status}`,
    };
  }

  @Patch('demo-requests/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update demo request status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async updateDemoRequestStatus(
    @Param('id') id: string,
    @Body('status') status: 'PENDING' | 'CONTACTED',
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Updating demo request ${id} status to ${status}`);
    await this.adminService.updateDemoRequestStatus(id, status);
    return {
      success: true,
      message: `Demo request status updated to ${status}`,
    };
  }

  // ============================================
  // TENANT MANAGEMENT
  // ============================================

  @Get('tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all tenants',
    description: 'Returns a paginated list of all tenants on the platform.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenants retrieved successfully',
    type: TenantsListResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async listTenants(
    @Query() query: ListTenantsQueryDto,
  ): Promise<TenantsListResponseDto> {
    this.logger.debug('Listing tenants', query);
    return this.adminService.listTenants(query);
  }

  @Get('tenants/stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get tenant statistics',
    description: 'Returns aggregated statistics about tenants on the platform.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant stats retrieved successfully',
    type: TenantStatsDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getTenantStats(): Promise<TenantStatsDto> {
    this.logger.debug('Getting tenant stats');
    return this.adminService.getTenantStats();
  }

  @Get('tenants/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get tenant details',
    description: 'Returns detailed information about a specific tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant retrieved successfully',
    type: TenantDetailDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getTenant(@Param('id') id: string): Promise<TenantDetailDto> {
    this.logger.debug(`Getting tenant ${id}`);
    return this.adminService.getTenant(id);
  }

  @Post('tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new tenant',
    description: 'Creates a new tenant organization on the platform.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant created successfully',
    type: TenantDetailDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async createTenant(@Body() dto: CreateTenantDto): Promise<TenantDetailDto> {
    this.logger.debug('Creating tenant', dto);
    return this.adminService.createTenant(dto);
  }

  @Patch('tenants/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update a tenant',
    description: 'Updates tenant information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant updated successfully',
    type: TenantDetailDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<TenantDetailDto> {
    this.logger.debug(`Updating tenant ${id}`, dto);
    return this.adminService.updateTenant(id, dto);
  }

  @Post('tenants/:id/suspend')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Suspend a tenant',
    description: 'Suspends a tenant, preventing access to the platform.',
  })
  @ApiResponse({ status: 200, description: 'Tenant suspended successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async suspendTenant(
    @Param('id') id: string,
    @Body() dto: SuspendTenantDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Suspending tenant ${id}`);
    await this.adminService.suspendTenant(id, dto.reason);
    return { success: true, message: 'Tenant suspended successfully' };
  }

  @Post('tenants/:id/activate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Activate a tenant',
    description: 'Activates a suspended or trial tenant.',
  })
  @ApiResponse({ status: 200, description: 'Tenant activated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async activateTenant(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Activating tenant ${id}`);
    await this.adminService.activateTenant(id);
    return { success: true, message: 'Tenant activated successfully' };
  }

  // ============================================
  // USER MANAGEMENT
  // ============================================

  @Get('users')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List all users',
    description: 'Returns a paginated list of all users on the platform.',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: UsersListResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<UsersListResponseDto> {
    this.logger.debug('Listing users', query);
    return this.adminService.listUsers(query);
  }

  @Get('users/stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Returns aggregated statistics about users on the platform.',
  })
  @ApiResponse({
    status: 200,
    description: 'User stats retrieved successfully',
    type: UserStatsDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getUserStats(): Promise<UserStatsDto> {
    this.logger.debug('Getting user stats');
    return this.adminService.getUserStats();
  }

  @Get('users/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get user details',
    description: 'Returns detailed information about a specific user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserDetailDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getUser(@Param('id') id: string): Promise<UserDetailDto> {
    this.logger.debug(`Getting user ${id}`);
    return this.adminService.getUser(id);
  }

  @Get('users/:id/activity')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get user activity',
    description: 'Returns recent activity logs for a specific user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User activity retrieved successfully',
    type: [UserActivityDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getUserActivity(@Param('id') id: string): Promise<UserActivityDto[]> {
    this.logger.debug(`Getting activity for user ${id}`);
    return this.adminService.getUserActivity(id);
  }

  @Post('users/:id/deactivate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Deactivate a user',
    description: 'Deactivates a user, preventing them from logging in.',
  })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async deactivateUser(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Deactivating user ${id}`);
    await this.adminService.deactivateUser(id);
    return { success: true, message: 'User deactivated successfully' };
  }

  @Post('users/:id/activate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Activate a user',
    description: 'Activates a deactivated user.',
  })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async activateUser(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`Activating user ${id}`);
    await this.adminService.activateUser(id);
    return { success: true, message: 'User activated successfully' };
  }

  // ============================================
  // ANALYTICS
  // ============================================

  @Get('analytics/metrics')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get platform metrics',
    description: 'Returns key platform-wide metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Metrics retrieved successfully',
    type: PlatformMetricsDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getPlatformMetrics(): Promise<PlatformMetricsDto> {
    this.logger.debug('Getting platform metrics');
    return this.adminService.getPlatformMetrics();
  }

  @Get('analytics/tenant-growth')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get tenant growth data',
    description: 'Returns tenant growth statistics over the last 12 months.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant growth data retrieved successfully',
    type: [TenantGrowthDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getTenantGrowth(): Promise<TenantGrowthDto[]> {
    this.logger.debug('Getting tenant growth data');
    return this.adminService.getTenantGrowth();
  }

  @Get('analytics/user-growth')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get user growth data',
    description: 'Returns user growth statistics over the last 12 months.',
  })
  @ApiResponse({
    status: 200,
    description: 'User growth data retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getUserGrowth(): Promise<TenantGrowthDto[]> {
    this.logger.debug('Getting user growth data');
    // Reuse tenant growth structure for users
    return this.adminService.getTenantGrowth();
  }

  @Get('analytics/subscriptions')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get subscription breakdown',
    description:
      'Returns the distribution of tenants across subscription statuses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription breakdown retrieved successfully',
    type: [SubscriptionBreakdownDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getSubscriptionBreakdown(): Promise<SubscriptionBreakdownDto[]> {
    this.logger.debug('Getting subscription breakdown');
    return this.adminService.getSubscriptionBreakdown();
  }

  @Get('analytics/top-tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get top tenants',
    description: 'Returns the top tenants by number of children enrolled.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of tenants to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Top tenants retrieved successfully',
    type: [TopTenantDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getTopTenants(@Query('limit') limit?: number): Promise<TopTenantDto[]> {
    this.logger.debug('Getting top tenants');
    return this.adminService.getTopTenants(limit || 10);
  }

  @Get('analytics/activity')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get recent platform activity',
    description: 'Returns recent activity across the platform.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of activities to return (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent activity retrieved successfully',
    type: [RecentActivityDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getRecentActivity(
    @Query('limit') limit?: number,
  ): Promise<RecentActivityDto[]> {
    this.logger.debug('Getting recent activity');
    return this.adminService.getRecentActivity(limit || 20);
  }

  // ============================================
  // AUDIT LOGS
  // ============================================

  @Get('audit-logs/export')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export audit logs as CSV',
    description:
      'Streams audit log rows as RFC 4180 CSV. ' +
      'Both `from` and `to` (YYYY-MM-DD) are required. ' +
      'Max range: 366 days. Rows are paged 500 at a time — safe for large volumes.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    example: '2025-01-01',
  })
  @ApiQuery({ name: 'to', required: true, type: String, example: '2025-01-31' })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
  })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'CSV stream' })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async exportAuditLogs(
    @Query() query: AuditLogExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Validate required fields
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'Both `from` and `to` date parameters are required',
      );
    }

    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format — use YYYY-MM-DD');
    }

    if (fromDate > toDate) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const diffDays =
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_EXPORT_DAYS) {
      throw new BadRequestException(
        `Date range exceeds maximum of ${MAX_EXPORT_DAYS} days (got ${Math.ceil(diffDays)} days)`,
      );
    }

    this.logger.log(
      `Exporting audit logs CSV: from=${query.from} to=${query.to} tenant=${query.tenantId ?? 'all'}`,
    );

    const filename = `audit-logs-${query.from}-to-${query.to}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    const stream = this.adminService.exportAuditLogsCsv(query);
    return new StreamableFile(stream);
  }

  @Get('audit-logs')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List audit logs',
    description: 'Returns a paginated list of audit log entries.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
    type: AuditLogsListResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async listAuditLogs(
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLogsListResponseDto> {
    this.logger.debug('Listing audit logs', query);
    return this.adminService.listAuditLogs(query);
  }

  @Get('audit-logs/stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get audit log statistics',
    description: 'Returns aggregated statistics about audit logs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit log stats retrieved successfully',
    type: AuditLogStatsDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getAuditLogStats(): Promise<AuditLogStatsDto> {
    this.logger.debug('Getting audit log stats');
    return this.adminService.getAuditLogStats();
  }

  @Get('audit-logs/actions')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get available audit actions',
    description:
      'Returns the list of available audit action types for filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit actions retrieved successfully',
    type: [String],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  getAuditLogActions(): string[] {
    this.logger.debug('Getting audit log actions');
    return this.adminService.getAuditLogActions();
  }

  @Get('audit-logs/resource-types')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get available resource types',
    description: 'Returns the list of available resource types for filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resource types retrieved successfully',
    type: [String],
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - valid JWT token required',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - SUPER_ADMIN role required',
  })
  async getAuditLogResourceTypes(): Promise<string[]> {
    this.logger.debug('Getting audit log resource types');
    return this.adminService.getAuditLogResourceTypes();
  }

  // ============================================
  // STORAGE — ORPHAN SWEEP (F2-P-001)
  // ============================================

  @Post('storage/sweep-orphans')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sweep S3 for orphaned proof-of-payment objects (F2-P-001). ' +
      'An orphan is an S3 object older than 24h with no matching payment_attachments row. ' +
      'Pass ?dryRun=true to preview without deleting.',
  })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description:
      'When true, identify orphans but do not delete them. Default false.',
  })
  @ApiResponse({
    status: 200,
    description: '{ scanned, orphans, deleted, s3Errors }',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN role required' })
  async sweepOrphanStorage(@Query('dryRun') dryRunParam?: string): Promise<{
    scanned: number;
    orphans: number;
    deleted: number;
    s3Errors: number;
  }> {
    const dryRun = dryRunParam === 'true' || dryRunParam === '1';
    this.logger.log(`sweepOrphanStorage triggered dryRun=${dryRun}`);
    return this.popOrphanSweepJob.runSweep({ dryRun });
  }
}
