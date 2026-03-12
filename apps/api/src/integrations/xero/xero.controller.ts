/**
 * XeroController
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 *
 * REST controller for Xero integration including OAuth flow,
 * sync operations, status checks, and disconnection.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: All operations must filter by tenantId.
 */

import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Logger,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { getTenantId } from '../../api/auth/utils/tenant-assertions';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { XeroClient } from 'xero-node';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TokenManager, TokenSet } from '../../mcp/xero-mcp/auth/token-manager';
import { BankFeedService } from './bank-feed.service';
import { XeroSyncGateway } from './xero.gateway';
import { XeroSyncService } from '../../database/services/xero-sync.service';
import { CurrentUser } from '../../api/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../api/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../api/auth/guards/roles.guard';
import { Roles } from '../../api/auth/decorators/roles.decorator';
import { Public } from '../../api/auth/decorators/public.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { BusinessException, NotFoundException } from '../../shared/exceptions';
import {
  SyncRequestDto,
  ConnectResponseDto,
  XeroConnectionStatusDto,
  SyncJobResponseDto,
  CallbackQueryDto,
  DisconnectResponseDto,
  OAuthStatePayload,
  PushCategorizationsRequestDto,
  PushCategorizationsResponseDto,
  XeroSetupGuideDto,
  TransactionsNeedingReviewDto,
} from './dto/xero.dto';
import {
  SyncAccountsRequestDto,
  SyncAccountsResponseDto,
  XeroAccountFilterDto,
  ListAccountsResponseDto,
  ValidateAccountCodeResponseDto,
} from '../../database/dto/xero-account.dto';
import { XeroAccountStatus } from '../../database/entities/xero-account.entity';
import { XeroAuthService } from './xero-auth.service';

@Controller('xero')
@ApiTags('Xero Integration')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class XeroController {
  private readonly logger = new Logger(XeroController.name);
  private readonly tokenManager: TokenManager;
  private readonly syncJobs: Map<
    string,
    { status: string; startedAt: Date; tenantId: string }
  > = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankFeedService: BankFeedService,
    private readonly syncGateway: XeroSyncGateway,
    private readonly xeroSyncService: XeroSyncService,
    private readonly xeroAuthService: XeroAuthService,
  ) {
    this.tokenManager = new TokenManager(this.prisma);
  }

  /**
   * Initiate OAuth connection to Xero
   * POST /xero/connect
   */
  @Post('connect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Initiate Xero OAuth connection',
    description:
      'Returns an authorization URL to redirect the user to Xero for OAuth consent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated',
    type: ConnectResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async initiateConnection(
    @CurrentUser() user: IUser,
  ): Promise<ConnectResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(`Initiating Xero connection for tenant ${tenantId}`);

    // Fail fast: Validate required Xero credentials
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!clientId) {
      this.logger.error(
        'XERO_CLIENT_ID environment variable is not configured',
      );
      throw new BusinessException(
        'Xero integration is not configured. Missing XERO_CLIENT_ID.',
        'XERO_NOT_CONFIGURED',
      );
    }
    if (!clientSecret) {
      this.logger.error(
        'XERO_CLIENT_SECRET environment variable is not configured',
      );
      throw new BusinessException(
        'Xero integration is not configured. Missing XERO_CLIENT_SECRET.',
        'XERO_NOT_CONFIGURED',
      );
    }
    if (!redirectUri) {
      this.logger.error(
        'XERO_REDIRECT_URI environment variable is not configured',
      );
      throw new BusinessException(
        'Xero integration is not configured. Missing XERO_REDIRECT_URI.',
        'XERO_NOT_CONFIGURED',
      );
    }

    // Create Xero client with required scopes
    // Note: 'profile' and 'email' require separate enablement in Xero Developer Portal
    // 'finance.bankstatementsplus.read' requires Finance API enabled in Xero Developer Portal
    // TODO: Enable Finance API in Xero Developer Portal to use this scope
    const xeroClient = new XeroClient({
      clientId,
      clientSecret,
      redirectUris: [redirectUri],
      scopes: [
        'openid',
        'offline_access',
        'accounting.transactions',
        'accounting.contacts',
        'accounting.settings',
      ],
    });

    // Create encrypted state with CSRF protection
    const statePayload: OAuthStatePayload = {
      tenantId,
      returnUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      createdAt: Date.now(),
      nonce: randomBytes(16).toString('hex'),
    };

    const state = this.xeroAuthService.generateState(statePayload);

    // Store state temporarily (expires in 10 minutes)
    await this.prisma.xeroOAuthState.upsert({
      where: { tenantId },
      create: {
        tenantId,
        codeVerifier: 'not-used', // Keep for schema compatibility
        state,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      update: {
        codeVerifier: 'not-used',
        state,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Generate authorization URL (standard OAuth, no PKCE for server-side apps)
    const baseUrl = await Promise.resolve(xeroClient.buildConsentUrl());
    const authUrl = `${baseUrl}&state=${encodeURIComponent(state)}`;

    return { authUrl };
  }

  /**
   * Handle OAuth callback from Xero
   * GET /xero/callback
   * NOTE: This endpoint is public because Xero redirects here without auth headers
   */
  @Get('callback')
  @Public()
  @ApiOperation({
    summary: 'Handle Xero OAuth callback',
    description:
      'Receives the authorization code from Xero and exchanges it for tokens.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to frontend after successful authentication',
  })
  async handleCallback(
    @Query() query: CallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('Handling Xero OAuth callback');

    try {
      // Decrypt and validate state (includes expiry check)
      const statePayload = this.xeroAuthService.validateState(query.state);
      const tenantId = statePayload.tenantId;

      // Get stored code verifier
      const storedState = await this.prisma.xeroOAuthState.findUnique({
        where: { tenantId },
      });

      if (!storedState || storedState.state !== query.state) {
        throw new BusinessException(
          'Invalid OAuth state. Possible CSRF attack.',
          'OAUTH_STATE_INVALID',
        );
      }

      // Fail fast: Validate required Xero credentials
      const clientId = process.env.XERO_CLIENT_ID;
      const clientSecret = process.env.XERO_CLIENT_SECRET;
      const redirectUri = process.env.XERO_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        this.logger.error(
          'Xero OAuth callback failed: Missing required environment variables',
        );
        throw new BusinessException(
          'Xero integration is not configured properly.',
          'XERO_NOT_CONFIGURED',
        );
      }

      // Create Xero client with minimal required scopes
      const xeroClient = new XeroClient({
        clientId,
        clientSecret,
        redirectUris: [redirectUri],
        scopes: [
          'openid',
          'offline_access',
          'accounting.transactions',
          'accounting.contacts',
          'accounting.settings',
        ],
      });

      // Exchange code for tokens
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const tokenSet = await xeroClient.apiCallback(
        `${redirectUri}?code=${query.code}`,
      );

      // Type guard
      const tokens = tokenSet as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        id_token?: string;
      };

      // Get Xero tenant ID from connected tenants
      await xeroClient.updateTenants();
      const xeroTenants = xeroClient.tenants;

      if (!xeroTenants || xeroTenants.length === 0) {
        throw new BusinessException(
          'No Xero organizations found. Please ensure you have access to at least one organization.',
          'NO_XERO_TENANTS',
        );
      }

      // Use first tenant (or let user choose in future)
      const xeroTenant = xeroTenants[0];

      // Store tokens
      const tokenData: TokenSet = {
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? '',
        expiresAt: Date.now() + (tokens.expires_in ?? 1800) * 1000,
        xeroTenantId: xeroTenant.tenantId ?? '',
      };

      await this.tokenManager.storeTokens(tenantId, tokenData);

      // Update tenant with Xero connection info
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          xeroConnectedAt: new Date(),
          xeroTenantName: xeroTenant.tenantName ?? undefined,
        },
      });

      // Clean up OAuth state
      await this.prisma.xeroOAuthState.delete({
        where: { tenantId },
      });

      this.logger.log(`Xero connected successfully for tenant ${tenantId}`);

      // Redirect to frontend
      const redirectUrl = `${statePayload.returnUrl}/settings/integrations?xero=connected`;
      res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        'OAuth callback failed',
        error instanceof Error ? error.stack : String(error),
      );

      // Redirect to frontend with error
      const errorUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/settings/integrations?xero=error&message=${encodeURIComponent(
        error instanceof Error ? error.message : 'Connection failed',
      )}`;
      res.redirect(errorUrl);
    }
  }

  /**
   * Trigger manual sync
   * POST /xero/sync
   */
  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Trigger Xero sync',
    description:
      'Initiates a sync operation with Xero. Returns job ID for tracking progress.',
  })
  @ApiResponse({
    status: 202,
    description: 'Sync job queued',
    type: SyncJobResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async triggerSync(
    @Body() body: SyncRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<SyncJobResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Triggering Xero sync for tenant ${tenantId}, direction: ${body.direction}`,
    );

    // Check connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    // Generate job ID
    const jobId = `sync-${tenantId}-${Date.now()}`;

    // Store job state
    this.syncJobs.set(jobId, {
      status: 'queued',
      startedAt: new Date(),
      tenantId,
    });

    // Execute sync asynchronously
    this.executeSyncAsync(jobId, tenantId, body).catch((error) => {
      this.logger.error(
        `Sync job ${jobId} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return {
      jobId,
      status: 'queued',
      startedAt: new Date(),
      estimatedCompletionAt: new Date(Date.now() + 60 * 1000), // 1 minute estimate
    };
  }

  /**
   * Get connection status
   * GET /xero/status
   */
  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get Xero connection status',
    description:
      'Returns current Xero connection status and last sync information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection status retrieved',
    type: XeroConnectionStatusDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getStatus(
    @CurrentUser() user: IUser,
  ): Promise<XeroConnectionStatusDto> {
    const tenantId = getTenantId(user);
    this.logger.debug(`Getting Xero status for tenant ${tenantId}`);

    const isConnected = await this.tokenManager.hasValidConnection(tenantId);

    if (!isConnected) {
      return { isConnected: false };
    }

    // Get tenant details
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // Get latest sync info from bank connections
    const latestConnection = await this.prisma.bankConnection.findFirst({
      where: { tenantId },
      orderBy: { lastSyncAt: 'desc' },
    });

    // Get Xero token info
    const xeroToken = await this.prisma.xeroToken.findUnique({
      where: { tenantId },
    });

    return {
      isConnected: true,
      tenantName: tenant?.xeroTenantName ?? undefined,
      connectedAt: tenant?.xeroConnectedAt ?? undefined,
      lastSyncAt: latestConnection?.lastSyncAt ?? undefined,
      lastSyncStatus:
        latestConnection?.status === 'ACTIVE'
          ? 'success'
          : latestConnection?.status === 'ERROR'
            ? 'failed'
            : undefined,
      errorMessage: latestConnection?.errorMessage ?? undefined,
    };
  }

  /**
   * Get available bank accounts from Xero
   * GET /xero/bank-accounts
   */
  @Get('bank-accounts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'List available bank accounts from Xero',
    description:
      'Returns all bank accounts from the connected Xero organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank accounts retrieved',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getBankAccounts(@CurrentUser() user: IUser): Promise<{
    accounts: Array<{
      accountId: string;
      name: string;
      accountNumber: string;
      bankAccountType: string;
      isConnected: boolean;
      connectionId?: string;
    }>;
  }> {
    const tenantId = getTenantId(user);
    this.logger.log(`Fetching Xero bank accounts for tenant ${tenantId}`);

    // Check connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    // Get access token and Xero tenant ID
    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    // Create Xero client
    const xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
      redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
      scopes: ['accounting.settings'],
    });

    xeroClient.setTokenSet({
      access_token: accessToken,
      token_type: 'Bearer',
    });

    // Fetch accounts from Xero
    const accountsResponse = await xeroClient.accountingApi.getAccounts(
      xeroTenantId,
      undefined, // ifModifiedSince
      'Type=="BANK"', // where - only bank accounts
    );

    const xeroAccounts = accountsResponse.body.accounts ?? [];

    // Get existing connections for this tenant
    const existingConnections = await this.prisma.bankConnection.findMany({
      where: { tenantId },
    });

    const connectionMap = new Map(
      existingConnections.map((c) => [c.xeroAccountId, c]),
    );

    // Map to response format
    const accounts = xeroAccounts.map((account) => {
      const connection = connectionMap.get(account.accountID ?? '');
      return {
        accountId: account.accountID ?? '',
        name: account.name ?? 'Unknown',
        accountNumber: account.bankAccountNumber ?? '',
        bankAccountType: String(account.bankAccountType ?? 'Unknown'),
        isConnected: connection?.status === 'ACTIVE',
        connectionId: connection?.id,
      };
    });

    this.logger.log(`Found ${accounts.length} bank accounts in Xero`);
    return { accounts };
  }

  /**
   * Connect a bank account from Xero
   * POST /xero/bank-accounts/:accountId/connect
   */
  @Post('bank-accounts/connect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Connect a bank account from Xero',
    description: 'Connects a specific bank account for transaction syncing.',
  })
  @ApiResponse({
    status: 201,
    description: 'Bank account connected',
  })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async connectBankAccount(
    @Body() body: { accountId: string },
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; connectionId: string; message: string }> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Connecting bank account ${body.accountId} for tenant ${tenantId}`,
    );

    const connection = await this.bankFeedService.connectBankAccount(
      tenantId,
      body.accountId,
    );

    return {
      success: true,
      connectionId: connection.id,
      message: `Connected bank account: ${connection.accountName}`,
    };
  }

  /**
   * Disconnect a bank account
   * POST /xero/bank-accounts/:connectionId/disconnect
   */
  @Post('bank-accounts/disconnect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Disconnect a bank account',
    description: 'Disconnects a bank account from transaction syncing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account disconnected',
  })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async disconnectBankAccount(
    @Body() body: { connectionId: string },
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Disconnecting bank connection ${body.connectionId} for tenant ${tenantId}`,
    );

    await this.bankFeedService.disconnectBankAccount(
      tenantId,
      body.connectionId,
    );

    return {
      success: true,
      message: 'Bank account disconnected successfully',
    };
  }

  /**
   * Get connected bank accounts
   * GET /xero/bank-connections
   */
  @Get('bank-connections')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get connected bank accounts',
    description: 'Returns all connected bank accounts for the tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connected bank accounts retrieved',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getBankConnections(@CurrentUser() user: IUser): Promise<{
    connections: Array<{
      id: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      status: string;
      lastSyncAt: Date | null;
      errorMessage: string | null;
    }>;
  }> {
    const tenantId = getTenantId(user);

    const connections = await this.prisma.bankConnection.findMany({
      where: { tenantId },
      orderBy: { connectedAt: 'desc' },
    });

    return {
      connections: connections.map((c) => ({
        id: c.id,
        accountName: c.accountName,
        accountNumber: c.accountNumber,
        bankName: c.bankName,
        status: c.status,
        lastSyncAt: c.lastSyncAt,
        errorMessage: c.errorMessage,
      })),
    };
  }

  /**
   * Disconnect from Xero
   * POST /xero/disconnect
   */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Disconnect from Xero',
    description: 'Removes Xero connection and clears stored tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Disconnected successfully',
    type: DisconnectResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async disconnect(@CurrentUser() user: IUser): Promise<DisconnectResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(`Disconnecting Xero for tenant ${tenantId}`);

    try {
      // Remove tokens
      await this.tokenManager.removeTokens(tenantId);

      // Update tenant
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          xeroConnectedAt: null,
          xeroTenantName: null,
        },
      });

      // Disconnect all bank connections
      await this.prisma.bankConnection.updateMany({
        where: { tenantId },
        data: { status: 'DISCONNECTED' },
      });

      this.logger.log(`Xero disconnected for tenant ${tenantId}`);

      return {
        success: true,
        message: 'Xero disconnected successfully',
      };
    } catch (error) {
      // Handle Prisma P2025 error: Record not found for delete
      const isPrismaNotFound =
        error instanceof Error &&
        (error.message.includes('Record to delete does not exist') ||
          error.message.includes('No record was found') ||
          (error as { code?: string }).code === 'P2025');

      if (isPrismaNotFound) {
        // Already disconnected
        return {
          success: true,
          message: 'Xero was not connected',
        };
      }
      throw error;
    }
  }

  /**
   * Push transaction categorizations to Xero
   * POST /xero/push-categorizations
   * TASK-XERO-004: Push Categorizations to Xero API Endpoint
   */
  @Post('push-categorizations')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Push transaction categorizations to Xero',
    description:
      'Pushes local categorizations to update Xero transactions. If no IDs provided, pushes all categorized but unsynced.',
  })
  @ApiResponse({
    status: 200,
    description: 'Push operation completed',
    type: PushCategorizationsResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async pushCategorizations(
    @Body() body: PushCategorizationsRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<PushCategorizationsResponseDto> {
    const tenantId = getTenantId(user);

    // Check connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    let transactionIds = body.transactionIds ?? [];

    // If no specific IDs, get all categorized but unsynced
    if (transactionIds.length === 0) {
      const unsynced = await this.prisma.transaction.findMany({
        where: {
          tenantId,
          status: { in: ['CATEGORIZED', 'REVIEW_REQUIRED'] },
          xeroTransactionId: { not: null },
        },
        include: {
          categorizations: {
            take: 1,
          },
        },
      });
      transactionIds = unsynced
        .filter((tx) => tx.categorizations.length > 0)
        .map((tx) => tx.id);
    }

    if (transactionIds.length === 0) {
      return { synced: 0, failed: 0, skipped: 0, errors: [] };
    }

    this.logger.log(
      `Pushing ${transactionIds.length} categorizations to Xero for tenant ${tenantId}`,
    );

    const result = await this.xeroSyncService.syncTransactions(
      transactionIds,
      tenantId,
    );

    return {
      synced: result.synced,
      failed: result.failed,
      skipped: result.skipped,
      errors: result.errors.map((e) => ({
        transactionId: e.transactionId,
        error: e.error,
        code: e.code ?? 'SYNC_ERROR',
      })),
    };
  }

  /**
   * Sync Chart of Accounts from Xero to database
   * POST /xero/sync-accounts
   * TASK-XERO-006: Chart of Accounts Database Sync
   */
  @Post('sync-accounts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Sync Chart of Accounts from Xero',
    description:
      'Fetches the Chart of Accounts from Xero and stores them locally for validation.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
    type: SyncAccountsResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async syncAccounts(
    @Body() body: SyncAccountsRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<SyncAccountsResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(`Syncing Chart of Accounts for tenant ${tenantId}`);

    // Check connection
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    const result = await this.xeroSyncService.syncChartOfAccountsToDb(
      tenantId,
      body.forceSync ?? false,
    );

    return {
      accountsFetched: result.accountsFetched,
      accountsCreated: result.accountsCreated,
      accountsUpdated: result.accountsUpdated,
      accountsArchived: result.accountsArchived,
      errors: result.errors,
      syncedAt: result.syncedAt,
    };
  }

  /**
   * Get synced Chart of Accounts
   * GET /xero/accounts
   * TASK-XERO-006: List accounts from local database
   */
  @Get('accounts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List synced Chart of Accounts',
    description: 'Returns the locally synced Chart of Accounts for the tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Accounts retrieved',
    type: ListAccountsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAccounts(
    @Query() filter: XeroAccountFilterDto,
    @CurrentUser() user: IUser,
  ): Promise<ListAccountsResponseDto> {
    const tenantId = getTenantId(user);

    const result = await this.xeroSyncService.getSyncedAccounts(tenantId, {
      status: filter.status,
      type: filter.type,
      codePrefix: filter.codePrefix,
      nameSearch: filter.nameSearch,
      limit: filter.limit ?? 100,
      offset: filter.offset ?? 0,
    });

    return {
      accounts: result.accounts.map((a) => ({
        id: a.id,
        tenantId,
        accountCode: a.accountCode,
        name: a.name,
        type: a.type,
        taxType: a.taxType,
        status: a.status,
        xeroAccountId: null,
        lastSyncedAt: result.lastSyncedAt ?? new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      total: result.total,
      lastSyncedAt: result.lastSyncedAt ?? undefined,
    };
  }

  /**
   * Validate an account code
   * GET /xero/validate-account/:code
   * TASK-XERO-006: Validate account code before pushing categorizations
   */
  @Get('validate-account/:code')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Validate an account code',
    description:
      'Checks if an account code exists and is active in the synced Chart of Accounts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: ValidateAccountCodeResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async validateAccountCode(
    @Param('code') code: string,
    @CurrentUser() user: IUser,
  ): Promise<ValidateAccountCodeResponseDto> {
    const tenantId = getTenantId(user);

    if (!code) {
      return {
        isValid: false,
        error: 'Account code is required',
      };
    }

    const result = await this.xeroSyncService.validateAccountCode(
      tenantId,
      code,
    );

    return {
      isValid: result.isValid,
      account: result.account
        ? {
            id: result.account.id,
            tenantId: result.account.tenantId,
            accountCode: result.account.accountCode,
            name: result.account.name,
            type: result.account.type,
            taxType: result.account.taxType,
            status: result.account.status,
            xeroAccountId: result.account.xeroAccountId,
            lastSyncedAt: result.account.lastSyncedAt,
            createdAt: result.account.createdAt,
            updatedAt: result.account.updatedAt,
          }
        : undefined,
      error: result.error,
      suggestions: result.suggestions,
    };
  }

  /**
   * Execute sync operation asynchronously
   */
  private async executeSyncAsync(
    jobId: string,
    tenantId: string,
    options: SyncRequestDto,
  ): Promise<void> {
    const job = this.syncJobs.get(jobId);
    if (!job) return;

    job.status = 'in_progress';

    try {
      // Emit start event
      this.syncGateway.emitProgress(tenantId, {
        entity: 'all',
        total: 100,
        processed: 0,
        percentage: 0,
      });

      // Step 1: Always sync Chart of Accounts first
      this.logger.log(`Syncing Chart of Accounts for tenant ${tenantId}`);
      this.syncGateway.emitProgress(tenantId, {
        entity: 'accounts',
        total: 100,
        processed: 0,
        percentage: 0,
      });

      try {
        const accountsResult =
          await this.xeroSyncService.syncChartOfAccountsToDb(
            tenantId,
            false, // Don't force sync every time
          );
        this.logger.log(
          `Chart of Accounts sync: ${accountsResult.accountsFetched} fetched, ` +
            `${accountsResult.accountsCreated} created, ${accountsResult.accountsUpdated} updated`,
        );
        this.syncGateway.emitProgress(tenantId, {
          entity: 'accounts',
          total: accountsResult.accountsFetched,
          processed:
            accountsResult.accountsCreated + accountsResult.accountsUpdated,
          percentage: 100,
        });
      } catch (accountsError) {
        this.logger.warn(
          `Chart of Accounts sync failed, continuing with transaction sync`,
          accountsError instanceof Error
            ? accountsError.message
            : String(accountsError),
        );
      }

      // Step 2: Sync bank transactions (if pulling)
      if (
        options.direction === 'pull' ||
        options.direction === 'bidirectional'
      ) {
        this.syncGateway.emitProgress(tenantId, {
          entity: 'transactions',
          total: 100,
          processed: 25,
          percentage: 25,
        });

        // Check if this is first sync (no transactions exist)
        // If so, force a full historical sync to import all data
        const existingTransactionCount = await this.prisma.transaction.count({
          where: { tenantId },
        });
        const shouldForceFullSync =
          options.fullSync ?? existingTransactionCount === 0;

        if (shouldForceFullSync && existingTransactionCount === 0) {
          this.logger.log(
            `First sync detected for tenant ${tenantId} - performing full historical import`,
          );
        }

        const syncResult = await this.bankFeedService.syncTransactions(
          tenantId,
          {
            fromDate: options.fromDate ? new Date(options.fromDate) : undefined,
            forceFullSync: shouldForceFullSync,
          },
        );

        this.syncGateway.emitProgress(tenantId, {
          entity: 'transactions',
          total: syncResult.transactionsFound,
          processed:
            syncResult.transactionsCreated + syncResult.duplicatesSkipped,
          percentage: 75,
        });

        // Step 2b: Sync from Journals API to catch cash-coded and payment-matched items
        // getBankTransactions only returns Spend/Receive Money — journals catch everything else
        try {
          this.logger.log(
            `Syncing from Journals API for tenant ${tenantId}`,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'journals',
            total: 100,
            processed: 0,
            percentage: 0,
          });

          const journalsResult =
            await this.bankFeedService.syncFromJournals(tenantId, {
              fromDate: options.fromDate
                ? new Date(options.fromDate)
                : undefined,
              forceFullSync: options.fullSync ?? false,
            });

          this.logger.log(
            `Journals sync: ${journalsResult.created} created, ` +
              `${journalsResult.skipped} skipped (${journalsResult.found} found)`,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'journals',
            total: journalsResult.found,
            processed: journalsResult.created + journalsResult.skipped,
            percentage: 100,
          });
        } catch (journalsError) {
          // Journals API may fail on Starter plans or with insufficient scopes — log and continue
          this.logger.warn(
            `Journals sync failed, continuing with remaining sync steps`,
            journalsError instanceof Error
              ? journalsError.message
              : String(journalsError),
          );
        }

        // Step 2c: Sync unreconciled bank statement lines (requires finance.bankstatementsplus.read scope)
        if (options.includeUnreconciled !== false) {
          this.logger.log(
            `Fetching statement lines via Finance API for tenant ${tenantId}`,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'unreconciled',
            total: 100,
            processed: 0,
            percentage: 0,
          });

          try {
            const unreconciledResult =
              await this.bankFeedService.syncUnreconciledStatements(tenantId, {
                fromDate: options.fromDate
                  ? new Date(options.fromDate)
                  : undefined,
                forceFullSync: options.fullSync ?? false,
              });

            this.logger.log(
              `Finance API sync: ${unreconciledResult.created} created, ` +
                `${unreconciledResult.skipped} skipped`,
            );

            this.syncGateway.emitProgress(tenantId, {
              entity: 'unreconciled',
              total: unreconciledResult.found,
              processed: unreconciledResult.created + unreconciledResult.skipped,
              percentage: 100,
            });
          } catch (financeApiError) {
            // Finance API requires finance.bankstatementsplus.read scope
            // which may not be authorized — log and continue
            this.logger.warn(
              `Finance API sync skipped (scope may not be authorized)`,
              financeApiError instanceof Error
                ? financeApiError.message
                : String(financeApiError),
            );
          }
        }

        this.syncGateway.emitProgress(tenantId, {
          entity: 'transactions',
          total: syncResult.transactionsFound,
          processed:
            syncResult.transactionsCreated + syncResult.duplicatesSkipped,
          percentage: 100,
        });
      }

      // TASK-XERO-004: Handle PUSH direction
      if (
        options.direction === 'push' ||
        options.direction === 'bidirectional'
      ) {
        this.logger.log(
          `Pushing categorizations to Xero for tenant ${tenantId}`,
        );

        this.syncGateway.emitProgress(tenantId, {
          entity: 'categorizations',
          total: 100,
          processed: 0,
          percentage: 0,
        });

        // Find transactions that are categorized but not synced
        const unsyncedTransactions = await this.prisma.transaction.findMany({
          where: {
            tenantId,
            status: { not: 'SYNCED' },
            xeroTransactionId: { not: null }, // Must have Xero ID
          },
          include: {
            categorizations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        // Filter to only those with categorizations
        const toSync = unsyncedTransactions.filter(
          (tx) => tx.categorizations.length > 0,
        );

        if (toSync.length > 0) {
          this.logger.log(
            `Found ${toSync.length} transactions to push to Xero`,
          );

          const pushResult = await this.xeroSyncService.syncTransactions(
            toSync.map((tx) => tx.id),
            tenantId,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'categorizations',
            total: toSync.length,
            processed: pushResult.synced + pushResult.skipped,
            percentage: 100,
          });

          this.logger.log(
            `Push complete: ${pushResult.synced} synced, ${pushResult.skipped} skipped, ${pushResult.failed} failed`,
          );
        } else {
          this.logger.log('No categorized transactions to push');
          this.syncGateway.emitProgress(tenantId, {
            entity: 'categorizations',
            total: 0,
            processed: 0,
            percentage: 100,
          });
        }
      }

      // Mark job complete
      job.status = 'completed';

      this.syncGateway.emitComplete(tenantId, {
        jobId,
        success: true,
        entitiesSynced: {
          invoices: 0, // Future: implement invoice sync
          payments: 0, // Future: implement payment sync
          contacts: 0, // Future: implement contact sync
        },
        errors: [],
        completedAt: new Date(),
      });
    } catch (error) {
      job.status = 'failed';

      this.syncGateway.emitError(tenantId, {
        entity: 'sync',
        entityId: jobId,
        message: error instanceof Error ? error.message : 'Sync failed',
        code: 'SYNC_ERROR',
      });

      throw error;
    }
  }

  /**
   * Get setup guide for Xero bank rule configuration
   * Provides step-by-step instructions to create catch-all rules
   */
  @Get('setup-guide')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get Xero bank rule setup guide',
    description:
      'Returns step-by-step instructions for setting up catch-all bank rules in Xero to auto-reconcile all transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Setup guide retrieved',
    type: XeroSetupGuideDto,
  })
  getSetupGuide(): XeroSetupGuideDto {
    return {
      title: 'Auto-Reconcile Bank Transactions in Xero',
      description:
        'Create a catch-all bank rule in Xero to automatically reconcile all bank feed transactions. ' +
        'This allows CrecheBooks to import all transactions from your FNB bank feed, even those not yet categorized in Xero.',
      recommendedAccountCode: '9999',
      recommendedAccountName: 'To Be Categorized',
      steps: [
        {
          step: 1,
          title: 'Create a "To Be Categorized" Account',
          description:
            'Go to Accounting → Chart of Accounts → Add Account. ' +
            'Create a new Expense account with code "9999" and name "To Be Categorized". ' +
            'This will be your catch-all account for unmatched transactions.',
          xeroPath: 'Accounting > Chart of Accounts > Add Account',
        },
        {
          step: 2,
          title: 'Navigate to Bank Rules',
          description:
            'Go to Accounting → Bank Accounts, then click on your FNB Business Account. ' +
            'Click the "Bank Rules" button at the top.',
          xeroPath: 'Accounting > Bank Accounts > [Your Account] > Bank Rules',
        },
        {
          step: 3,
          title: 'Create a New Bank Rule',
          description:
            'Click "New Rule". This will be your catch-all rule that matches all remaining transactions.',
          xeroPath: 'Bank Rules > New Rule',
        },
        {
          step: 4,
          title: 'Configure the Rule',
          description:
            'Set the following:\n' +
            '• Rule Type: "Spend Money" (create a second rule for "Receive Money")\n' +
            '• Conditions: Select "ANY" and add a condition like "Payee contains ." (period matches almost anything)\n' +
            '• Allocate to: Select your "9999 - To Be Categorized" account\n' +
            '• Set as lowest priority so specific rules run first',
          xeroPath: 'Bank Rules > Edit Rule',
        },
        {
          step: 5,
          title: 'Create Rule for Receive Money',
          description:
            'Repeat steps 3-4 to create a second rule for "Receive Money" transactions.',
          xeroPath: 'Bank Rules > New Rule',
        },
        {
          step: 6,
          title: 'Enable Automatic Reconciliation (Optional)',
          description:
            'If you have Xero Growing plan or above, enable JAX-powered automatic reconciliation: ' +
            'Go to your bank account page and turn on "Automation". ' +
            'This will auto-apply your bank rules to incoming transactions.',
          xeroPath: 'Bank Accounts > [Your Account] > Automation',
        },
        {
          step: 7,
          title: 'Sync with CrecheBooks',
          description:
            'After setting up the rules, trigger a sync in CrecheBooks. ' +
            'Transactions with the "9999" account code will be flagged for review and categorization.',
          xeroPath: 'CrecheBooks > Settings > Xero > Sync',
        },
      ],
      notes: [
        'Transactions categorized to "9999 - To Be Categorized" will appear in CrecheBooks with status "Review Required".',
        'You can properly categorize these transactions in CrecheBooks, and the categorization will sync back to Xero.',
        'Make sure your specific bank rules (for known payees) have higher priority than the catch-all rule.',
        'The catch-all rule should be the LAST rule to match, only catching transactions not matched by other rules.',
        'Consider reviewing and creating specific rules for recurring transactions over time.',
      ],
    };
  }

  /**
   * Get count of transactions needing review
   */
  @Get('transactions-needing-review')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get transactions needing review',
    description:
      'Returns count and details of transactions imported from catch-all accounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Review summary retrieved',
    type: TransactionsNeedingReviewDto,
  })
  async getTransactionsNeedingReview(
    @CurrentUser() user: IUser,
  ): Promise<TransactionsNeedingReviewDto> {
    const tenantId = getTenantId(user);

    // Get transactions with REVIEW_REQUIRED status
    const reviewRequired = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        status: 'REVIEW_REQUIRED',
        isDeleted: false,
      },
      select: {
        id: true,
        date: true,
        xeroAccountCode: true,
      },
      orderBy: { date: 'asc' },
    });

    // Extract unique catch-all account codes
    const catchAllCodes = [
      ...new Set(
        reviewRequired
          .map((tx) => tx.xeroAccountCode)
          .filter((code): code is string => code !== null),
      ),
    ];

    // Get date range
    const dates = reviewRequired.map((tx) => tx.date);
    const earliest = dates.length > 0 ? dates[0] : null;
    const latest = dates.length > 0 ? dates[dates.length - 1] : null;

    return {
      total: reviewRequired.length,
      fromCatchAllAccounts: reviewRequired.filter(
        (tx) => tx.xeroAccountCode !== null,
      ).length,
      dateRange: {
        earliest: earliest?.toISOString().split('T')[0] ?? null,
        latest: latest?.toISOString().split('T')[0] ?? null,
      },
      catchAllAccountCodes: catchAllCodes,
    };
  }

  /**
   * Bulk fetch all 9999 bank transactions from Xero, match against CrecheBooks
   * categorizations, and create reclassification journals.
   *
   * POST /xero/reclassify-9999
   *
   * Strategy: Instead of checking 845 transactions one-by-one (21+ min),
   * we fetch ALL bank transactions from Xero in paginated batches (100/page),
   * filter for ones on account 9999, then match against our DB categorizations.
   * This reduces ~845 API calls to ~20 paginated calls.
   */
  @Post('reclassify-9999')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bulk reclassify 9999 transactions using Xero pagination',
    description:
      'Fetches all bank transactions from Xero, identifies ones on 9999, matches with CrecheBooks categorizations, creates reclassification journals.',
  })
  @ApiResponse({ status: 200, description: 'Reclassification results' })
  async reclassify9999(
    @CurrentUser() user: IUser,
    @Body()
    body: {
      dryRun?: boolean;
      bankAccountId?: string;
    },
  ) {
    const tenantId = getTenantId(user);
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException('No valid Xero connection', 'XERO_NOT_CONNECTED');
    }

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);
    const bankAccId = body.bankAccountId ?? '968A13DBB90E4A99B51BADDE7673957A';

    // Step 1: Fetch ALL bank transactions from Xero (paginated, 100/page)
    // Filter by bank account to reduce volume
    const xero9999Txns: Array<{
      bankTransactionID: string;
      type: string;
      date: string;
      lineAmount: number;
      description: string;
    }> = [];

    let page = 1;
    let hasMore = true;
    let totalFetched = 0;

    this.logger.log('Fetching all bank transactions from Xero...');

    while (hasMore) {
      const whereClause = `BankAccount.AccountID==Guid("${bankAccId}")`;
      const url = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}&page=${page}&order=Date`;

      let retries = 0;
      let resp: globalThis.Response | null = null;
      while (retries < 3) {
        resp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'xero-tenant-id': xeroTenantId,
            Accept: 'application/json',
          },
        });
        if (resp.status === 429) {
          retries++;
          this.logger.warn(`Rate limited on page ${page}, waiting 30s (attempt ${retries})...`);
          await new Promise((r) => setTimeout(r, 30000));
          continue;
        }
        break;
      }

      if (!resp || !resp.ok) {
        const errText = resp ? await resp.text() : 'No response';
        throw new BusinessException(
          `Xero API error fetching page ${page}: ${errText.substring(0, 200)}`,
          'XERO_API_ERROR',
        );
      }

      const data = (await resp.json()) as {
        BankTransactions?: Array<{
          BankTransactionID: string;
          Type: string;
          Date: string;
          LineItems?: Array<{
            AccountCode: string;
            LineAmount: number;
            Description: string;
          }>;
        }>;
      };

      const pageTxns = data.BankTransactions ?? [];
      totalFetched += pageTxns.length;

      // Filter for transactions on 9999
      for (const txn of pageTxns) {
        const line = txn.LineItems?.[0];
        if (line?.AccountCode === '9999') {
          xero9999Txns.push({
            bankTransactionID: txn.BankTransactionID,
            type: txn.Type,
            date: txn.Date,
            lineAmount: line.LineAmount,
            description: line.Description ?? '',
          });
        }
      }

      this.logger.log(
        `Page ${page}: ${pageTxns.length} txns (${xero9999Txns.length} on 9999 so far)`,
      );

      // Xero returns 100 per page; fewer means last page
      if (pageTxns.length < 100) {
        hasMore = false;
      } else {
        page++;
        // Rate limit: ~1.5s between paginated calls
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    this.logger.log(
      `Xero scan complete: ${totalFetched} total, ${xero9999Txns.length} on 9999`,
    );

    if (xero9999Txns.length === 0) {
      return {
        success: true,
        message: 'No transactions on 9999 in Xero',
        totalScanned: totalFetched,
        on9999: 0,
      };
    }

    // Step 2: Build map of xeroTransactionId -> xero data
    const xero9999Map = new Map(
      xero9999Txns.map((t) => [t.bankTransactionID, t]),
    );

    // Step 3: Find matching CrecheBooks categorizations
    const dbTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        xeroTransactionId: { in: Array.from(xero9999Map.keys()) },
        xeroAccountCode: { not: null, notIn: ['9999'] },
        isDeleted: false,
      },
      select: {
        id: true,
        xeroTransactionId: true,
        xeroAccountCode: true,
        description: true,
        date: true,
      },
    });

    this.logger.log(
      `Found ${dbTransactions.length} CrecheBooks categorizations for ${xero9999Txns.length} Xero 9999 transactions`,
    );

    // Step 4: Build reclassification groups by account code + month
    const groups = new Map<
      string,
      {
        accountCode: string;
        month: string;
        lastDayOfMonth: string;
        totalExVatRands: number;
        txCount: number;
        descriptions: string[];
        isReceive: boolean;
      }
    >();

    const matched: Array<{
      xeroId: string;
      currentAccount: string;
      targetAccount: string;
      exVatRands: number;
      type: string;
    }> = [];

    for (const dbTx of dbTransactions) {
      const xeroTx = xero9999Map.get(dbTx.xeroTransactionId!);
      if (!xeroTx) continue;

      const exVatAmount = Math.abs(xeroTx.lineAmount);
      const isReceive = xeroTx.type === 'RECEIVE';
      const targetCode = dbTx.xeroAccountCode!;

      matched.push({
        xeroId: dbTx.xeroTransactionId!,
        currentAccount: '9999',
        targetAccount: targetCode,
        exVatRands: exVatAmount,
        type: xeroTx.type,
      });

      const d = new Date(dbTx.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const lastDayStr = lastDay.toISOString().split('T')[0];
      const key = `${targetCode}-${month}`;

      if (!groups.has(key)) {
        groups.set(key, {
          accountCode: targetCode,
          month,
          lastDayOfMonth: lastDayStr,
          totalExVatRands: 0,
          txCount: 0,
          descriptions: [],
          isReceive,
        });
      }
      const group = groups.get(key)!;
      group.totalExVatRands += exVatAmount;
      group.txCount++;
      if (dbTx.description && group.descriptions.length < 5) {
        group.descriptions.push(dbTx.description.substring(0, 40));
      }
    }

    const journalGroups = Array.from(groups.values());

    // Unmatched: on 9999 in Xero but no CrecheBooks categorization
    const matchedIds = new Set(dbTransactions.map((t) => t.xeroTransactionId));
    const unmatched = xero9999Txns.filter(
      (t) => !matchedIds.has(t.bankTransactionID),
    );

    // Dry run
    if (body.dryRun) {
      return {
        success: true,
        dryRun: true,
        totalScanned: totalFetched,
        on9999InXero: xero9999Txns.length,
        matchedWithCategorization: dbTransactions.length,
        unmatchedOn9999: unmatched.length,
        journalCount: journalGroups.length,
        journals: journalGroups.map((g) => ({
          accountCode: g.accountCode,
          month: g.month,
          date: g.lastDayOfMonth,
          exVatAmountRands: g.totalExVatRands.toFixed(2),
          txCount: g.txCount,
          isReceive: g.isReceive,
          sampleDescriptions: g.descriptions,
        })),
        unmatchedSample: unmatched.slice(0, 20).map((t) => ({
          xeroId: t.bankTransactionID,
          date: t.date,
          amount: t.lineAmount,
          type: t.type,
          description: t.description?.substring(0, 60),
        })),
      };
    }

    // Step 5: Create journals
    const results: Array<{
      accountCode: string;
      month: string;
      status: 'success' | 'failed';
      journalId?: string;
      amountRands: string;
      error?: string;
    }> = [];

    let created = 0;
    let failed = 0;

    for (const group of journalGroups) {
      const amountRands = group.totalExVatRands;
      const narration = `Reclassify: 9999 → ${group.accountCode} (${group.txCount} txns, ${group.month})`;

      // SPEND: original debited 9999, we credit 9999 (negative) and debit target (positive)
      // RECEIVE: original credited 9999, we debit 9999 (positive) and credit target (negative)
      const journalPayload = {
        ManualJournals: [
          {
            Narration: narration,
            Date: group.lastDayOfMonth,
            Status: 'POSTED',
            JournalLines: group.isReceive
              ? [
                  { AccountCode: '9999', Description: narration, LineAmount: amountRands, TaxType: 'NONE' },
                  { AccountCode: group.accountCode, Description: narration, LineAmount: -amountRands, TaxType: 'NONE' },
                ]
              : [
                  { AccountCode: '9999', Description: narration, LineAmount: -amountRands, TaxType: 'NONE' },
                  { AccountCode: group.accountCode, Description: narration, LineAmount: amountRands, TaxType: 'NONE' },
                ],
          },
        ],
      };

      try {
        let retries = 0;
        let response: globalThis.Response | null = null;
        while (retries < 3) {
          response = await fetch('https://api.xero.com/api.xro/2.0/ManualJournals', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'xero-tenant-id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(journalPayload),
          });
          if (response.status === 429) {
            retries++;
            this.logger.warn(`Rate limited creating journal, waiting 30s (attempt ${retries})...`);
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }
          break;
        }

        const data = (await response!.json()) as {
          ManualJournals?: Array<{
            ManualJournalID?: string;
            ValidationErrors?: Array<{ Message?: string }>;
          }>;
        };

        if (!response!.ok) {
          const valErr = data.ManualJournals?.[0]?.ValidationErrors?.[0]?.Message;
          throw new Error(valErr ?? `HTTP ${response!.status}`);
        }

        const journalId = data.ManualJournals?.[0]?.ManualJournalID;
        results.push({
          accountCode: group.accountCode,
          month: group.month,
          status: 'success',
          journalId,
          amountRands: amountRands.toFixed(2),
        });
        created++;

        this.logger.log(
          `Created journal ${journalId}: 9999 → ${group.accountCode}, R${amountRands.toFixed(2)} (${group.month})`,
        );

        // Rate limit journals: pause every 5
        if (created % 5 === 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.push({
          accountCode: group.accountCode,
          month: group.month,
          status: 'failed',
          amountRands: amountRands.toFixed(2),
          error: errMsg,
        });
        failed++;
        this.logger.error(
          `Failed journal 9999 → ${group.accountCode} (${group.month}): ${errMsg}`,
        );
      }
    }

    return {
      success: true,
      totalScanned: totalFetched,
      on9999InXero: xero9999Txns.length,
      matchedWithCategorization: dbTransactions.length,
      unmatchedOn9999: unmatched.length,
      journalsCreated: created,
      journalsFailed: failed,
      results,
    };
  }

  /**
   * List Xero manual journals
   * GET /xero/manual-journals
   */
  @Get('manual-journals')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List Xero manual journals' })
  async listManualJournals(@CurrentUser() user: IUser) {
    const tenantId = getTenantId(user);
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException('No valid Xero connection', 'XERO_NOT_CONNECTED');
    }

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    const res = await fetch(
      `https://api.xero.com/api.xro/2.0/ManualJournals?order=Date`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': xeroTenantId,
          'Accept': 'application/json',
        },
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new BusinessException(`Xero API error: ${res.status} ${errText.substring(0, 200)}`, 'XERO_API_ERROR');
    }

    const data = await res.json() as {
      ManualJournals?: Array<{
        ManualJournalID: string;
        Narration: string;
        Date: string;
        Status: string;
        JournalLines?: Array<{
          AccountCode: string;
          Description: string;
          LineAmount: number;
          TaxType: string;
        }>;
      }>;
    };

    const journals = (data.ManualJournals ?? []).map(j => ({
      id: j.ManualJournalID,
      narration: j.Narration,
      date: j.Date,
      status: j.Status,
      lines: j.JournalLines?.map(l => ({
        accountCode: l.AccountCode,
        amount: l.LineAmount,
        taxType: l.TaxType,
      })),
    }));

    return { count: journals.length, journals };
  }

  /**
   * Void manual journals by IDs
   * POST /xero/void-journals
   */
  @Post('void-journals')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Void manual journals by ID' })
  @ApiResponse({ status: 200, description: 'Void results' })
  async voidJournals(
    @CurrentUser() user: IUser,
    @Body() body: { journalIds: string[] },
  ) {
    const tenantId = getTenantId(user);

    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException('No valid Xero connection', 'XERO_NOT_CONNECTED');
    }

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    let voided = 0;
    let failed = 0;
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const jid of body.journalIds) {
      try {
        const res = await fetch(
          `https://api.xero.com/api.xro/2.0/ManualJournals/${jid}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'xero-tenant-id': xeroTenantId,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ManualJournals: [{ ManualJournalID: jid, Status: 'VOIDED' }],
            }),
          },
        );
        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`HTTP ${res.status}: ${errData.substring(0, 200)}`);
        }
        results.push({ id: jid, status: 'voided' });
        voided++;
        if (voided % 5 === 0) await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        results.push({ id: jid, status: 'failed', error: error instanceof Error ? error.message : String(error) });
        failed++;
      }
    }

    return { success: true, voided, failed, results };
  }
}
