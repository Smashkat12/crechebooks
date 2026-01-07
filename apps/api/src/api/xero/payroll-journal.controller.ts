/**
 * Xero Payroll Journal Controller
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * REST API controllers for:
 * - Payroll journal creation, posting, and management
 * - Account mapping configuration and validation
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: All operations must filter by tenantId from authenticated user.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
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
} from '@nestjs/swagger';
import {
  UserRole,
  PayrollJournalStatus,
  XeroAccountType,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { XeroPayrollJournalService } from '../../database/services/xero-payroll-journal.service';
import { XeroAccountMappingService } from '../../database/services/xero-account-mapping.service';
import {
  CreatePayrollJournalDto,
  BulkPostJournalsDto,
  UpsertAccountMappingDto,
  BulkUpsertMappingsDto,
  CancelJournalDto,
  JournalPreviewResponse,
  BulkPostResult,
  AccountMappingValidationResult,
  SuggestedMapping,
  AccountMappingSummary,
  JournalStats,
} from '../../database/dto/xero-payroll-journal.dto';
import type { IUser } from '../../database/entities/user.entity';

// ============================================
// Payroll Journals Controller
// ============================================

@Controller('xero/payroll-journals')
@ApiTags('Xero Payroll Journals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class XeroPayrollJournalController {
  private readonly logger = new Logger(XeroPayrollJournalController.name);

  constructor(private readonly journalService: XeroPayrollJournalService) {}

  /**
   * Create a payroll journal entry from a payroll record
   * POST /xero/payroll-journals
   */
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Create payroll journal entry',
    description:
      'Creates a journal entry from a payroll record. Does NOT post to Xero immediately.',
  })
  @ApiResponse({
    status: 201,
    description: 'Journal created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required account mappings or journal already exists',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async createJournal(
    @CurrentUser() user: IUser,
    @Body() dto: CreatePayrollJournalDto,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(
      `Creating payroll journal for payroll ${dto.payrollId}, tenant ${tenantId}`,
    );

    return this.journalService.createPayrollJournal(
      dto.payrollId,
      tenantId,
      user.id,
    );
  }

  /**
   * List all payroll journals with optional status filter
   * GET /xero/payroll-journals
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List payroll journals',
    description:
      'Returns all payroll journals for the tenant with optional filtering.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: PayrollJournalStatus,
    description: 'Filter by journal status',
  })
  @ApiResponse({
    status: 200,
    description: 'Journals retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getJournals(
    @CurrentUser() user: IUser,
    @Query('status') status?: PayrollJournalStatus,
  ) {
    const tenantId = user.tenantId;
    this.logger.debug(
      `Listing journals for tenant ${tenantId}, status filter: ${status ?? 'none'}`,
    );

    return this.journalService.getJournals(
      tenantId,
      status ? { status } : undefined,
    );
  }

  /**
   * Get journal statistics for the tenant
   * GET /xero/payroll-journals/stats
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get journal statistics',
    description: 'Returns summary statistics of payroll journals.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getJournalStats(@CurrentUser() user: IUser): Promise<JournalStats> {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting journal stats for tenant ${tenantId}`);

    return this.journalService.getJournalStats(tenantId);
  }

  /**
   * Get pending journals ready for posting
   * GET /xero/payroll-journals/pending
   */
  @Get('pending')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get pending journals',
    description:
      'Returns journals in PENDING status ready for posting to Xero.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending journals retrieved successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getPendingJournals(@CurrentUser() user: IUser) {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting pending journals for tenant ${tenantId}`);

    return this.journalService.getPendingJournals(tenantId);
  }

  /**
   * Get failed journals that may need retry
   * GET /xero/payroll-journals/failed
   */
  @Get('failed')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get failed journals',
    description: 'Returns journals in FAILED status that may need retry.',
  })
  @ApiQuery({
    name: 'maxRetries',
    required: false,
    type: Number,
    description: 'Filter by maximum retry count (default: no limit)',
  })
  @ApiResponse({
    status: 200,
    description: 'Failed journals retrieved successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getFailedJournals(
    @CurrentUser() user: IUser,
    @Query('maxRetries', new DefaultValuePipe(undefined), ParseIntPipe)
    maxRetries?: number,
  ) {
    const tenantId = user.tenantId;
    this.logger.debug(
      `Getting failed journals for tenant ${tenantId}, maxRetries: ${maxRetries ?? 'unlimited'}`,
    );

    return this.journalService.getFailedJournals(tenantId, maxRetries);
  }

  /**
   * Preview journal before creation
   * GET /xero/payroll-journals/preview/:payrollId
   */
  @Get('preview/:payrollId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Preview payroll journal',
    description:
      'Returns a preview of the journal entry that would be created from a payroll record.',
  })
  @ApiParam({ name: 'payrollId', description: 'Payroll ID to preview' })
  @ApiResponse({
    status: 200,
    description: 'Journal preview generated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async previewJournal(
    @Param('payrollId') payrollId: string,
    @CurrentUser() user: IUser,
  ): Promise<JournalPreviewResponse> {
    const tenantId = user.tenantId;
    this.logger.log(
      `Previewing journal for payroll ${payrollId}, tenant ${tenantId}`,
    );

    return this.journalService.previewJournal(payrollId, tenantId);
  }

  /**
   * Get a single journal by ID
   * GET /xero/payroll-journals/:journalId
   */
  @Get(':journalId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get journal by ID',
    description: 'Returns a single payroll journal with all details.',
  })
  @ApiParam({ name: 'journalId', description: 'Journal ID' })
  @ApiResponse({
    status: 200,
    description: 'Journal retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal not found',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getJournal(
    @Param('journalId') journalId: string,
    @CurrentUser() user: IUser,
  ) {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting journal ${journalId} for tenant ${tenantId}`);

    return this.journalService.getJournal(journalId, tenantId);
  }

  /**
   * Post journal to Xero
   * POST /xero/payroll-journals/:journalId/post
   */
  @Post(':journalId/post')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Post journal to Xero',
    description: 'Posts a pending journal entry to Xero as a manual journal.',
  })
  @ApiParam({ name: 'journalId', description: 'Journal ID to post' })
  @ApiResponse({
    status: 200,
    description: 'Journal posted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Journal already posted or cancelled',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async postToXero(
    @Param('journalId') journalId: string,
    @CurrentUser() user: IUser,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(
      `Posting journal ${journalId} to Xero for tenant ${tenantId}`,
    );

    return this.journalService.postToXero(journalId, tenantId, user.id);
  }

  /**
   * Retry posting a failed journal
   * POST /xero/payroll-journals/:journalId/retry
   */
  @Post(':journalId/retry')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Retry failed journal',
    description: 'Retries posting a failed journal to Xero.',
  })
  @ApiParam({ name: 'journalId', description: 'Journal ID to retry' })
  @ApiResponse({
    status: 200,
    description: 'Journal retry successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Journal is not in FAILED status',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async retryPosting(
    @Param('journalId') journalId: string,
    @CurrentUser() user: IUser,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(`Retrying journal ${journalId} for tenant ${tenantId}`);

    return this.journalService.retryPosting(journalId, tenantId, user.id);
  }

  /**
   * Cancel a pending or failed journal
   * POST /xero/payroll-journals/:journalId/cancel
   */
  @Post(':journalId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cancel journal',
    description:
      'Cancels a pending or failed journal. Posted journals cannot be cancelled.',
  })
  @ApiParam({ name: 'journalId', description: 'Journal ID to cancel' })
  @ApiResponse({
    status: 200,
    description: 'Journal cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Journal already posted - cannot cancel',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async cancelJournal(
    @Param('journalId') journalId: string,
    @CurrentUser() user: IUser,
    @Body() dto: CancelJournalDto,
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = user.tenantId;
    this.logger.log(
      `Cancelling journal ${journalId} for tenant ${tenantId}: ${dto.reason}`,
    );

    await this.journalService.cancelJournal(
      journalId,
      tenantId,
      dto.reason,
      user.id,
    );

    return { success: true, message: 'Journal cancelled' };
  }

  /**
   * Delete a journal (only if not posted)
   * DELETE /xero/payroll-journals/:journalId
   */
  @Delete(':journalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete journal',
    description: 'Deletes a journal. Posted journals cannot be deleted.',
  })
  @ApiParam({ name: 'journalId', description: 'Journal ID to delete' })
  @ApiResponse({
    status: 204,
    description: 'Journal deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Journal already posted - cannot delete',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async deleteJournal(
    @Param('journalId') journalId: string,
    @CurrentUser() user: IUser,
  ): Promise<void> {
    const tenantId = user.tenantId;
    this.logger.log(`Deleting journal ${journalId} for tenant ${tenantId}`);

    await this.journalService.deleteJournal(journalId, tenantId, user.id);
  }

  /**
   * Bulk post multiple journals to Xero
   * POST /xero/payroll-journals/bulk-post
   */
  @Post('bulk-post')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Bulk post journals to Xero',
    description:
      'Posts multiple pending journals to Xero. Returns partial success if some fail.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk post completed (check results for individual status)',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async bulkPostToXero(
    @CurrentUser() user: IUser,
    @Body() dto: BulkPostJournalsDto,
  ): Promise<BulkPostResult> {
    const tenantId = user.tenantId;
    this.logger.log(
      `Bulk posting ${dto.journalIds.length} journals for tenant ${tenantId}`,
    );

    return this.journalService.bulkPostToXero(
      dto.journalIds,
      tenantId,
      user.id,
    );
  }
}

// ============================================
// Account Mappings Controller
// ============================================

@Controller('xero/account-mappings')
@ApiTags('Xero Account Mappings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class XeroAccountMappingController {
  private readonly logger = new Logger(XeroAccountMappingController.name);

  constructor(private readonly mappingService: XeroAccountMappingService) {}

  /**
   * Get all account mappings for the tenant
   * GET /xero/account-mappings
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List account mappings',
    description: 'Returns all configured account mappings for the tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Mappings retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getMappings(@CurrentUser() user: IUser) {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting account mappings for tenant ${tenantId}`);

    return this.mappingService.getMappings(tenantId);
  }

  /**
   * Get mapping summary with completion status
   * GET /xero/account-mappings/summary
   */
  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get mapping summary',
    description:
      'Returns summary of all account types and their mapping status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getMappingSummary(
    @CurrentUser() user: IUser,
  ): Promise<AccountMappingSummary> {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting mapping summary for tenant ${tenantId}`);

    return this.mappingService.getMappingSummary(tenantId);
  }

  /**
   * Fetch available accounts from Xero chart of accounts
   * GET /xero/account-mappings/xero-accounts
   */
  @Get('xero-accounts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Fetch Xero accounts',
    description:
      'Fetches available accounts from the connected Xero organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Xero accounts retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'No valid Xero connection',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async fetchXeroAccounts(@CurrentUser() user: IUser) {
    const tenantId = user.tenantId;
    this.logger.log(`Fetching Xero accounts for tenant ${tenantId}`);

    return this.mappingService.fetchXeroAccounts(tenantId);
  }

  /**
   * Get suggested mappings based on Xero account names
   * GET /xero/account-mappings/suggestions
   */
  @Get('suggestions')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get mapping suggestions',
    description:
      'Returns AI-suggested mappings based on Xero account names and SA payroll patterns.',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggestions generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'No valid Xero connection',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getSuggestions(
    @CurrentUser() user: IUser,
  ): Promise<SuggestedMapping[]> {
    const tenantId = user.tenantId;
    this.logger.log(`Getting mapping suggestions for tenant ${tenantId}`);

    const xeroAccounts = await this.mappingService.fetchXeroAccounts(tenantId);
    return this.mappingService.suggestMappings(xeroAccounts);
  }

  /**
   * Validate that all required mappings exist
   * GET /xero/account-mappings/validate
   */
  @Get('validate')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Validate mappings',
    description: 'Checks if all required account mappings are configured.',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation completed',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async validateMappings(
    @CurrentUser() user: IUser,
  ): Promise<AccountMappingValidationResult> {
    const tenantId = user.tenantId;
    this.logger.log(`Validating mappings for tenant ${tenantId}`);

    return this.mappingService.validateMappings(tenantId);
  }

  /**
   * Get list of required account types
   * GET /xero/account-mappings/required
   */
  @Get('required')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get required account types',
    description:
      'Returns the list of account types required for payroll journals.',
  })
  @ApiResponse({
    status: 200,
    description: 'Required types retrieved',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  getRequiredAccountTypes(): Array<{
    type: XeroAccountType;
    description: string;
  }> {
    return this.mappingService.getRequiredAccountTypes();
  }

  /**
   * Get list of all available account types
   * GET /xero/account-mappings/all-types
   */
  @Get('all-types')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get all account types',
    description: 'Returns all available account types with descriptions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Account types retrieved',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  getAllAccountTypes(): Array<{
    type: XeroAccountType;
    description: string;
    isRequired: boolean;
  }> {
    return this.mappingService.getAllAccountTypes();
  }

  /**
   * Get a specific account mapping by type
   * GET /xero/account-mappings/:accountType
   */
  @Get(':accountType')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get mapping by account type',
    description: 'Returns the mapping for a specific account type.',
  })
  @ApiParam({
    name: 'accountType',
    enum: XeroAccountType,
    description: 'Account type to retrieve',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapping retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getMapping(
    @CurrentUser() user: IUser,
    @Param('accountType') accountType: XeroAccountType,
  ) {
    const tenantId = user.tenantId;
    this.logger.debug(`Getting mapping for ${accountType}, tenant ${tenantId}`);

    return this.mappingService.getMappingByType(tenantId, accountType);
  }

  /**
   * Create or update an account mapping (POST method)
   * POST /xero/account-mappings
   */
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Upsert account mapping',
    description: 'Creates or updates an account mapping for a specific type.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mapping created/updated successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async upsertMapping(
    @CurrentUser() user: IUser,
    @Body() dto: UpsertAccountMappingDto,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(
      `Upserting mapping for ${dto.accountType}, tenant ${tenantId}`,
    );

    return this.mappingService.upsertMapping(tenantId, dto, user.id);
  }

  /**
   * Create or update an account mapping (PUT method - alias for POST)
   * PUT /xero/account-mappings
   * This endpoint provides RESTful PUT semantics for updating mappings.
   */
  @Put()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Update account mapping',
    description:
      'Creates or updates an account mapping for a specific type (PUT semantics).',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapping updated successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async updateMapping(
    @CurrentUser() user: IUser,
    @Body() dto: UpsertAccountMappingDto,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(
      `Updating mapping for ${dto.accountType}, tenant ${tenantId}`,
    );

    return this.mappingService.upsertMapping(tenantId, dto, user.id);
  }

  /**
   * Bulk create or update account mappings
   * POST /xero/account-mappings/bulk
   */
  @Post('bulk')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Bulk upsert mappings',
    description:
      'Creates or updates multiple account mappings in one operation.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mappings created/updated successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async bulkUpsertMappings(
    @CurrentUser() user: IUser,
    @Body() dto: BulkUpsertMappingsDto,
  ) {
    const tenantId = user.tenantId;
    this.logger.log(
      `Bulk upserting ${dto.mappings.length} mappings for tenant ${tenantId}`,
    );

    return this.mappingService.bulkUpsertMappings(
      tenantId,
      dto.mappings,
      user.id,
    );
  }

  /**
   * Auto-configure mappings from Xero accounts
   * POST /xero/account-mappings/auto-configure
   */
  @Post('auto-configure')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Auto-configure mappings',
    description:
      'Automatically configures mappings by matching Xero account names to payroll types.',
  })
  @ApiQuery({
    name: 'overwrite',
    required: false,
    type: Boolean,
    description: 'Overwrite existing mappings (default: false)',
  })
  @ApiResponse({
    status: 200,
    description: 'Auto-configuration completed',
  })
  @ApiResponse({
    status: 400,
    description: 'No valid Xero connection',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async autoConfigureMappings(
    @CurrentUser() user: IUser,
    @Query('overwrite') overwrite?: string,
  ): Promise<{
    applied: number;
    skipped: number;
    suggestions: SuggestedMapping[];
  }> {
    const tenantId = user.tenantId;
    const shouldOverwrite = overwrite === 'true';

    this.logger.log(
      `Auto-configuring mappings for tenant ${tenantId}, overwrite: ${shouldOverwrite}`,
    );

    return this.mappingService.autoConfigureMappings(
      tenantId,
      shouldOverwrite,
      user.id,
    );
  }

  /**
   * Delete an account mapping
   * DELETE /xero/account-mappings/:accountType
   */
  @Delete(':accountType')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete account mapping',
    description: 'Removes an account mapping for a specific type.',
  })
  @ApiParam({
    name: 'accountType',
    enum: XeroAccountType,
    description: 'Account type to delete',
  })
  @ApiResponse({
    status: 204,
    description: 'Mapping deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async deleteMapping(
    @CurrentUser() user: IUser,
    @Param('accountType') accountType: XeroAccountType,
  ): Promise<void> {
    const tenantId = user.tenantId;
    this.logger.log(`Deleting mapping for ${accountType}, tenant ${tenantId}`);

    await this.mappingService.deleteMapping(tenantId, accountType, user.id);
  }
}
