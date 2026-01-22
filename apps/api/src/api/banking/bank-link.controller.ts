/**
 * Bank Link Controller
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * REST API endpoints for bank account linking and management.
 * Handles OAuth flow, account management, and sync operations.
 *
 * Security:
 * - JWT authentication required for all endpoints
 * - Tenant isolation enforced
 * - POPIA-compliant audit logging
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  Res,
  UseGuards,
  HttpStatus,
  HttpException,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StitchBankingService } from '../../integrations/banking/stitch.service';
import { BankSyncJob } from '../../jobs/bank-sync.job';
import { ConfigService } from '@nestjs/config';
import {
  InitiateLinkDto,
  LinkInitResponseDto,
  OAuthCallbackDto,
  LinkedAccountDto,
  SyncResultDto,
  AccountBalanceDto,
  GetTransactionsDto,
  BankTransactionDto,
  BankAccountsSummaryDto,
  ConsentStatusDto,
} from './dto/bank-link.dto';

/**
 * User context from JWT
 */
interface IUser {
  id: string;
  tenantId: string;
  email: string;
  roles: string[];
}

@ApiTags('Banking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('banking')
export class BankLinkController {
  private readonly logger = new Logger(BankLinkController.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly stitchService: StitchBankingService,
    private readonly bankSyncJob: BankSyncJob,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  // ===========================================================================
  // Account Linking
  // ===========================================================================

  /**
   * Initiate bank account linking
   * Returns OAuth URL for user to authorize bank access
   */
  @Post('link/initiate')
  @ApiOperation({
    summary: 'Initiate bank account linking',
    description:
      'Starts the OAuth flow for linking a bank account. Returns a URL to redirect the user to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Link initiated successfully',
    type: LinkInitResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Bank API not configured' })
  async initiateLink(
    @CurrentUser() user: IUser,
    @Body() dto: InitiateLinkDto,
  ): Promise<LinkInitResponseDto> {
    this.logger.log(`Initiating bank link for tenant: ${user.tenantId}`);

    const result = await this.stitchService.initiateAccountLink({
      tenantId: user.tenantId,
      redirectUri: dto.redirectUri,
      userReference: dto.userReference || user.email,
    });

    return result;
  }

  /**
   * Handle OAuth callback from bank
   * Completes account linking after user authorization
   */
  @Get('link/callback')
  @ApiOperation({
    summary: 'OAuth callback handler',
    description:
      'Handles the OAuth callback from the bank. Redirects to frontend after processing.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to frontend' })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code',
  })
  @ApiQuery({ name: 'state', required: true, description: 'CSRF state' })
  @ApiQuery({ name: 'error', required: false, description: 'Error code' })
  async handleCallback(
    @Query() query: OAuthCallbackDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Handling OAuth callback for tenant: ${user.tenantId}`);

    try {
      // Check for error from OAuth provider
      if (query.error) {
        this.logger.warn(
          `OAuth error: ${query.error} - ${query.error_description}`,
        );
        return res.redirect(
          `${this.frontendUrl}/banking/link/error?error=${encodeURIComponent(query.error)}&message=${encodeURIComponent(query.error_description || 'Authorization failed')}`,
        );
      }

      // Complete account linking
      const linkedAccount = await this.stitchService.completeAccountLink(
        user.tenantId,
        query.code,
        query.state,
      );

      this.logger.log(`Account linked: ${linkedAccount.id}`);

      // Redirect to success page
      res.redirect(
        `${this.frontendUrl}/banking/link/success?accountId=${linkedAccount.id}&bankName=${encodeURIComponent(linkedAccount.bankName)}`,
      );
    } catch (error) {
      this.logger.error(`Failed to complete account link: ${error}`);
      res.redirect(
        `${this.frontendUrl}/banking/link/error?error=link_failed&message=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`,
      );
    }
  }

  // ===========================================================================
  // Account Management
  // ===========================================================================

  /**
   * List all linked bank accounts
   */
  @Get('accounts')
  @ApiOperation({
    summary: 'List linked bank accounts',
    description: 'Returns all linked bank accounts for the current tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Accounts retrieved successfully',
    type: [LinkedAccountDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listAccounts(@CurrentUser() user: IUser): Promise<LinkedAccountDto[]> {
    this.logger.debug(`Listing accounts for tenant: ${user.tenantId}`);
    return this.stitchService.getLinkedAccounts(user.tenantId);
  }

  /**
   * Get bank accounts summary for dashboard
   */
  @Get('accounts/summary')
  @ApiOperation({
    summary: 'Get bank accounts summary',
    description: 'Returns summary statistics for all linked bank accounts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary retrieved successfully',
    type: BankAccountsSummaryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAccountsSummary(
    @CurrentUser() user: IUser,
  ): Promise<BankAccountsSummaryDto> {
    const accounts = await this.stitchService.getLinkedAccounts(user.tenantId);

    const activeAccounts = accounts.filter((a) => a.status === 'active');
    const attentionNeeded = accounts.filter(
      (a) =>
        a.requiresRenewal || a.status === 'error' || a.status === 'expired',
    );

    // Group by bank
    const byBank = accounts.reduce(
      (acc, a) => {
        const bankKey = a.bankName.toLowerCase().replace(/\s+/g, '_');
        acc[bankKey] = (acc[bankKey] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Find latest sync
    const syncTimes = accounts
      .filter((a) => a.lastSyncedAt)
      .map((a) => a.lastSyncedAt!.getTime());
    const lastSyncAt =
      syncTimes.length > 0 ? new Date(Math.max(...syncTimes)) : null;

    // Calculate next sync
    const nextSyncTimes = accounts
      .filter((a) => a.nextSyncAt)
      .map((a) => a.nextSyncAt!.getTime());
    const nextSyncAt =
      nextSyncTimes.length > 0 ? new Date(Math.min(...nextSyncTimes)) : null;

    return {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      attentionNeeded: attentionNeeded.length,
      totalBalanceCents: activeAccounts.reduce(
        (sum, a) => sum + (a.currentBalanceCents || 0),
        0,
      ),
      lastSyncAt,
      nextSyncAt,
      byBank,
    };
  }

  /**
   * Get accounts needing consent renewal
   */
  @Get('accounts/consent-status')
  @ApiOperation({
    summary: 'Get consent renewal status',
    description:
      'Returns accounts that need consent renewal within the specified days.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Days threshold for warning',
    example: 14,
  })
  @ApiResponse({
    status: 200,
    description: 'Consent status retrieved successfully',
    type: [ConsentStatusDto],
  })
  async getConsentStatus(
    @CurrentUser() user: IUser,
    @Query('days') days?: number,
  ): Promise<ConsentStatusDto[]> {
    const threshold = days || 14;
    const accounts = await this.stitchService.getAccountsNeedingRenewal(
      user.tenantId,
      threshold,
    );

    return accounts.map((a) => {
      let status: 'ok' | 'warning' | 'critical' | 'expired';
      if (a.consentDaysRemaining <= 0) {
        status = 'expired';
      } else if (a.consentDaysRemaining <= 7) {
        status = 'critical';
      } else if (a.consentDaysRemaining <= 14) {
        status = 'warning';
      } else {
        status = 'ok';
      }

      return {
        accountId: a.id,
        bankName: a.bankName,
        expiresAt: a.consentExpiresAt,
        daysRemaining: a.consentDaysRemaining,
        status,
      };
    });
  }

  /**
   * Unlink a bank account
   */
  @Delete('accounts/:id')
  @ApiOperation({
    summary: 'Unlink bank account',
    description:
      'Removes a linked bank account. Revokes tokens and marks as unlinked.',
  })
  @ApiParam({ name: 'id', description: 'Linked bank account ID' })
  @ApiResponse({ status: 204, description: 'Account unlinked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async unlinkAccount(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<void> {
    this.logger.log(
      `Unlinking account ${accountId} for tenant ${user.tenantId}`,
    );

    // Verify account belongs to tenant
    const accounts = await this.stitchService.getLinkedAccounts(user.tenantId);
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    await this.stitchService.unlinkAccount(accountId);
  }

  // ===========================================================================
  // Sync Operations
  // ===========================================================================

  /**
   * Trigger manual sync for an account
   */
  @Post('accounts/:id/sync')
  @ApiOperation({
    summary: 'Trigger account sync',
    description: 'Manually triggers transaction sync for a specific account.',
  })
  @ApiParam({ name: 'id', description: 'Linked bank account ID' })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
    type: SyncResultDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 503, description: 'Bank sync disabled' })
  async triggerSync(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<SyncResultDto> {
    this.logger.log(`Manual sync triggered for account ${accountId}`);

    // Verify account belongs to tenant
    const accounts = await this.stitchService.getLinkedAccounts(user.tenantId);
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    const result = await this.bankSyncJob.syncAccount(accountId);

    return {
      accountId: result.accountId,
      success: result.success,
      transactionsRetrieved: result.transactionsRetrieved,
      transactionsNew: result.transactionsNew,
      transactionsDuplicate: result.transactionsDuplicate,
      durationMs: result.durationMs,
      reconciliationTriggered: result.reconciliationTriggered,
      errorMessage: result.errorMessage,
    };
  }

  /**
   * Get account balance
   */
  @Get('accounts/:id/balance')
  @ApiOperation({
    summary: 'Get account balance',
    description: 'Fetches current balance for a linked bank account.',
  })
  @ApiParam({ name: 'id', description: 'Linked bank account ID' })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved',
    type: AccountBalanceDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getBalance(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AccountBalanceDto> {
    // Verify account belongs to tenant
    const accounts = await this.stitchService.getLinkedAccounts(user.tenantId);
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    return this.stitchService.getBalance(accountId);
  }

  /**
   * Get transactions for date range
   */
  @Get('accounts/:id/transactions')
  @ApiOperation({
    summary: 'Get transactions',
    description:
      'Fetches transactions for a linked bank account within date range.',
  })
  @ApiParam({ name: 'id', description: 'Linked bank account ID' })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved',
    type: [BankTransactionDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getTransactions(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: GetTransactionsDto,
  ): Promise<BankTransactionDto[]> {
    // Verify account belongs to tenant
    const accounts = await this.stitchService.getLinkedAccounts(user.tenantId);
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    const from = new Date(query.from);
    const to = new Date(query.to);

    // Validate date range (max 90 days)
    const daysDiff = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (daysDiff > 90) {
      throw new HttpException(
        'Date range cannot exceed 90 days',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.stitchService.getTransactions(accountId, from, to);
  }

  // ===========================================================================
  // Sync Job Status
  // ===========================================================================

  /**
   * Get sync job status
   */
  @Get('sync/status')
  @ApiOperation({
    summary: 'Get sync job status',
    description: 'Returns current status of the bank sync background job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved',
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        isRunning: { type: 'boolean' },
        currentJobId: { type: 'string', nullable: true },
      },
    },
  })
  getSyncStatus(): {
    enabled: boolean;
    isRunning: boolean;
    currentJobId: string | null;
  } {
    return {
      enabled: this.bankSyncJob.isEnabled(),
      isRunning: this.bankSyncJob.isJobRunning(),
      currentJobId: this.bankSyncJob.getCurrentJobRunId(),
    };
  }
}
