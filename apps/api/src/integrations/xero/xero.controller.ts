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
} from '@nestjs/common';
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
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { XeroClient } from 'xero-node';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TokenManager, TokenSet } from '../../mcp/xero-mcp/auth/token-manager';
import { BankFeedService } from './bank-feed.service';
import { XeroSyncGateway } from './xero.gateway';
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
} from './dto/xero.dto';

// State encryption key (should be in environment)
const STATE_ENCRYPTION_KEY =
  process.env.XERO_STATE_KEY ?? 'default-key-32-chars-long-here!!';

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
    const tenantId = user.tenantId;
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

    // Create Xero client
    const xeroClient = new XeroClient({
      clientId,
      clientSecret,
      redirectUris: [redirectUri],
      scopes: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'accounting.transactions',
        'accounting.contacts',
        'accounting.settings',
        // 'finance.bankstatementsplus.read', // Requires Xero partner approval
        // 'bankfeeds', // Requires special Xero approval
      ],
    });

    // Create encrypted state with CSRF protection
    const statePayload: OAuthStatePayload = {
      tenantId,
      returnUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      createdAt: Date.now(),
      nonce: randomBytes(16).toString('hex'),
    };

    const state = this.encryptState(statePayload);

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
      // Decrypt and validate state
      const statePayload = this.decryptState(query.state);

      // Check state expiry (10 minutes)
      if (Date.now() - statePayload.createdAt > 10 * 60 * 1000) {
        throw new BusinessException(
          'OAuth state expired. Please try connecting again.',
          'OAUTH_STATE_EXPIRED',
        );
      }

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

      // Create Xero client
      const xeroClient = new XeroClient({
        clientId,
        clientSecret,
        redirectUris: [redirectUri],
        scopes: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'accounting.transactions',
          'accounting.contacts',
          'accounting.settings',
          // 'finance.bankstatementsplus.read', // Requires Xero partner approval
          // 'bankfeeds', // Requires special Xero approval
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
    const tenantId = user.tenantId;
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
    const tenantId = user.tenantId;
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
    const tenantId = user.tenantId;
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
    const tenantId = user.tenantId;
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
    const tenantId = user.tenantId;
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
    const tenantId = user.tenantId;

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
    const tenantId = user.tenantId;
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

      // Sync bank transactions (if pulling)
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

        const syncResult = await this.bankFeedService.syncTransactions(
          tenantId,
          {
            fromDate: options.fromDate ? new Date(options.fromDate) : undefined,
            forceFullSync: options.fullSync ?? false,
          },
        );

        this.syncGateway.emitProgress(tenantId, {
          entity: 'transactions',
          total: syncResult.transactionsFound,
          processed:
            syncResult.transactionsCreated + syncResult.duplicatesSkipped,
          percentage: 75,
        });

        // Sync unreconciled bank statement lines if requested
        if (options.includeUnreconciled) {
          this.logger.log(
            `Fetching unreconciled statement lines for tenant ${tenantId}`,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'unreconciled',
            total: 100,
            processed: 0,
            percentage: 0,
          });

          const unreconciledResult =
            await this.bankFeedService.syncUnreconciledStatements(tenantId, {
              fromDate: options.fromDate
                ? new Date(options.fromDate)
                : undefined,
              forceFullSync: options.fullSync ?? false,
            });

          this.logger.log(
            `Unreconciled sync: ${unreconciledResult.created} created, ` +
              `${unreconciledResult.skipped} skipped`,
          );

          this.syncGateway.emitProgress(tenantId, {
            entity: 'unreconciled',
            total: unreconciledResult.found,
            processed: unreconciledResult.created + unreconciledResult.skipped,
            percentage: 100,
          });
        }

        this.syncGateway.emitProgress(tenantId, {
          entity: 'transactions',
          total: syncResult.transactionsFound,
          processed:
            syncResult.transactionsCreated + syncResult.duplicatesSkipped,
          percentage: 100,
        });
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
   * Encrypt state payload for OAuth
   */
  private encryptState(payload: OAuthStatePayload): string {
    const key = Buffer.from(STATE_ENCRYPTION_KEY.padEnd(32).slice(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return `${iv.toString('base64')}.${encrypted}`;
  }

  /**
   * Decrypt state payload from OAuth
   */
  private decryptState(state: string): OAuthStatePayload {
    try {
      const [ivB64, encrypted] = state.split('.');
      const key = Buffer.from(STATE_ENCRYPTION_KEY.padEnd(32).slice(0, 32));
      const iv = Buffer.from(ivB64, 'base64');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as OAuthStatePayload;
    } catch (error) {
      throw new BusinessException('Invalid OAuth state', 'OAUTH_STATE_INVALID');
    }
  }
}
