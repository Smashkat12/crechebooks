/**
 * AccountingController
 *
 * Provider-agnostic REST controller for accounting integrations.
 * Delegates every operation to whichever `AccountingProvider` is injected
 * via the `ACCOUNTING_PROVIDER` token (Xero, Stub.africa, etc.).
 *
 * All endpoints live under `/accounting/*` and are additive -- the
 * existing `/xero/*` routes remain untouched for backwards compatibility.
 *
 * CRITICAL: All monetary values are in ZAR cents (integers).
 * CRITICAL: All operations are scoped to the authenticated user's tenantId.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { getTenantId } from '../../api/auth/utils/tenant-assertions';
import { CurrentUser } from '../../api/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../api/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../api/auth/guards/roles.guard';
import { Roles } from '../../api/auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { BusinessException } from '../../shared/exceptions';

import { ACCOUNTING_PROVIDER } from './accounting-provider.token';
import type { AccountingProvider } from './interfaces';
import {
  BulkPushInvoicesRequestDto,
  BulkSyncContactsRequestDto,
  CallbackQueryDto,
  ConnectRequestDto,
  ConnectResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  PostJournalRequestDto,
  ProviderCapabilitiesDto,
  PullInvoicesQueryDto,
  PullPaymentsQueryDto,
  PushInvoiceRequestDto,
  SyncContactRequestDto,
  SyncPaymentRequestDto,
  SyncRequestDto,
} from './dto/accounting.dto';

@Controller('accounting')
@ApiTags('Accounting Integration')
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@ApiForbiddenResponse({ description: 'User does not have the required role' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountingController {
  private readonly logger = new Logger(AccountingController.name);

  constructor(
    @Inject(ACCOUNTING_PROVIDER)
    private readonly provider: AccountingProvider,
  ) {}

  /** Get the active provider's name and capabilities. */
  @Get('capabilities')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get provider capabilities',
    description:
      'Returns the active accounting provider name and which features it supports.',
  })
  @ApiResponse({ status: 200, type: ProviderCapabilitiesDto })
  getCapabilities(): ProviderCapabilitiesDto {
    this.assertProviderReady();

    return {
      providerName: this.provider.providerName,
      bankFeeds: this.provider.supportsBankFeeds,
      journals: this.provider.supportsJournals,
      bulkInvoicePush: this.provider.capabilities.bulkInvoicePush,
      invoicePull: this.provider.capabilities.invoicePull,
      chartOfAccounts: this.provider.capabilities.chartOfAccounts,
      syncOrchestration: this.provider.capabilities.syncOrchestration,
    };
  }

  /** Initiate OAuth connection to the accounting provider. */
  @Post('connect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Initiate accounting provider connection',
    description:
      'Generates an OAuth authorization URL for the tenant to connect their accounting system.',
  })
  @ApiResponse({ status: 200, type: ConnectResponseDto })
  async connect(
    @CurrentUser() user: IUser,
    @Body() dto: ConnectRequestDto,
  ): Promise<ConnectResponseDto> {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Initiating ${this.provider.providerName} connection for tenant ${tenantId}`);

    const result = await this.provider.getAuthUrl(tenantId, dto.returnUrl);
    return { authUrl: result.authUrl };
  }

  /** Handle OAuth callback from the accounting provider. */
  @Get('callback')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Handle OAuth callback',
    description:
      'Processes the OAuth callback to complete the connection. Typically invoked via redirect.',
  })
  @ApiResponse({ status: 200, description: 'Connection completed successfully' })
  async callback(
    @CurrentUser() user: IUser,
    @Query() query: CallbackQueryDto,
  ): Promise<{ success: boolean }> {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Processing ${this.provider.providerName} OAuth callback for tenant ${tenantId}`);

    await this.provider.handleCallback(tenantId, query.code, query.state);
    return { success: true };
  }

  /** Get the current connection status. */
  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get connection status',
    description:
      'Returns the current connection status between the tenant and the accounting provider.',
  })
  @ApiResponse({ status: 200, type: ConnectionStatusResponseDto })
  async getStatus(
    @CurrentUser() user: IUser,
  ): Promise<ConnectionStatusResponseDto> {
    this.assertProviderReady();
    const tenantId = getTenantId(user);

    const status = await this.provider.getConnectionStatus(tenantId);
    return {
      isConnected: status.isConnected,
      providerName: status.providerName,
      organizationName: status.organizationName,
      connectedAt: status.connectedAt,
      lastSyncAt: status.lastSyncAt,
      lastSyncStatus: status.lastSyncStatus,
      errorMessage: status.errorMessage,
    };
  }

  /** Disconnect from the accounting provider. */
  @Delete('disconnect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect accounting provider',
    description:
      'Revokes tokens and disconnects the tenant from the accounting provider.',
  })
  @ApiResponse({ status: 200, type: DisconnectResponseDto })
  async disconnect(
    @CurrentUser() user: IUser,
  ): Promise<DisconnectResponseDto> {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Disconnecting ${this.provider.providerName} for tenant ${tenantId}`);

    await this.provider.disconnect(tenantId);
    return { success: true, message: 'Accounting provider disconnected' };
  }

  /** Push a single invoice to the accounting provider. */
  @Post('invoices/push')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Push invoice',
    description: 'Push a single CrecheBooks invoice to the external accounting system.',
  })
  @ApiResponse({ status: 200, description: 'Invoice pushed successfully' })
  async pushInvoice(
    @CurrentUser() user: IUser,
    @Body() dto: PushInvoiceRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Pushing invoice ${dto.invoiceId} for tenant ${tenantId}`);

    return this.provider.pushInvoice(tenantId, dto.invoiceId, {
      force: dto.force,
    });
  }

  /** Push multiple invoices in bulk. */
  @Post('invoices/push-bulk')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Push invoices in bulk',
    description: 'Push multiple CrecheBooks invoices to the external accounting system.',
  })
  @ApiResponse({ status: 200, description: 'Bulk push completed' })
  async pushInvoicesBulk(
    @CurrentUser() user: IUser,
    @Body() dto: BulkPushInvoicesRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(
      `Bulk pushing ${dto.invoiceIds.length} invoices for tenant ${tenantId}`,
    );

    return this.provider.pushInvoicesBulk(tenantId, dto.invoiceIds, {
      force: dto.force,
    });
  }

  /** Pull invoices from the accounting provider. */
  @Get('invoices/pull')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Pull invoices',
    description: 'Pull invoices from the external accounting system into CrecheBooks.',
  })
  @ApiResponse({ status: 200, description: 'Invoices pulled successfully' })
  async pullInvoices(
    @CurrentUser() user: IUser,
    @Query() query: PullInvoicesQueryDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Pulling invoices for tenant ${tenantId}`);

    return this.provider.pullInvoices(tenantId, {
      since: query.since,
      limit: query.limit,
      page: query.page,
      status: query.status,
    });
  }

  /** Sync a single parent to an external contact. */
  @Post('contacts/sync')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sync contact',
    description:
      'Sync a CrecheBooks parent record to the external accounting system as a contact.',
  })
  @ApiResponse({ status: 200, description: 'Contact synced successfully' })
  async syncContact(
    @CurrentUser() user: IUser,
    @Body() dto: SyncContactRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Syncing contact for parent ${dto.parentId}, tenant ${tenantId}`);

    return this.provider.syncContact(tenantId, dto.parentId);
  }

  /** Sync multiple parents to external contacts in bulk. */
  @Post('contacts/sync-bulk')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sync contacts in bulk',
    description: 'Sync multiple CrecheBooks parent records to external contacts.',
  })
  @ApiResponse({ status: 200, description: 'Bulk contact sync completed' })
  async syncContactsBulk(
    @CurrentUser() user: IUser,
    @Body() dto: BulkSyncContactsRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(
      `Bulk syncing ${dto.parentIds.length} contacts for tenant ${tenantId}`,
    );

    return this.provider.syncContactsBulk(tenantId, dto.parentIds);
  }

  /** Sync a payment to the accounting provider. */
  @Post('payments/sync')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sync payment',
    description:
      'Sync a CrecheBooks payment to the external accounting system against a specific invoice.',
  })
  @ApiResponse({ status: 200, description: 'Payment synced successfully' })
  async syncPayment(
    @CurrentUser() user: IUser,
    @Body() dto: SyncPaymentRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Syncing payment ${dto.paymentId} for tenant ${tenantId}`);

    return this.provider.syncPayment(tenantId, dto.paymentId, dto.invoiceRef);
  }

  /** Pull payments from the accounting provider for an invoice. */
  @Get('payments/pull')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Pull payments',
    description:
      'Pull payments from the external accounting system for a specific invoice.',
  })
  @ApiResponse({ status: 200, description: 'Payments pulled successfully' })
  async pullPayments(
    @CurrentUser() user: IUser,
    @Query() query: PullPaymentsQueryDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(
      `Pulling payments for invoice ${query.invoiceRef}, tenant ${tenantId}`,
    );

    return this.provider.pullPayments(tenantId, query.invoiceRef);
  }

  /** Get the chart of accounts from the accounting provider. */
  @Get('accounts')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get chart of accounts',
    description: 'Retrieve the chart of accounts from the external accounting system.',
  })
  @ApiResponse({ status: 200, description: 'Accounts retrieved successfully' })
  async getAccounts(@CurrentUser() user: IUser) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(`Fetching accounts for tenant ${tenantId}`);

    return this.provider.getAccounts(tenantId);
  }

  /** Post a manual journal entry (requires journals capability). */
  @Post('journals')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Post journal entry',
    description:
      'Post a manual journal entry to the external accounting system. ' +
      'Requires the provider to support journals (check capabilities first).',
  })
  @ApiResponse({ status: 201, description: 'Journal posted successfully' })
  @ApiResponse({ status: 422, description: 'Provider does not support journals' })
  @HttpCode(HttpStatus.CREATED)
  async postJournal(
    @CurrentUser() user: IUser,
    @Body() dto: PostJournalRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);

    if (!this.provider.supportsJournals || !this.provider.postJournal) {
      throw new BusinessException(
        `The ${this.provider.providerName} provider does not support journal posting`,
        'PROVIDER_CAPABILITY_UNSUPPORTED',
        { capability: 'journals', provider: this.provider.providerName },
      );
    }

    this.logger.log(`Posting journal for tenant ${tenantId}`);

    return this.provider.postJournal(tenantId, {
      reference: dto.reference,
      narration: dto.narration,
      date: dto.date,
      lineItems: dto.lineItems,
    });
  }

  /** Trigger a coordinated sync operation. */
  @Post('sync')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger sync',
    description:
      'Run a coordinated sync across invoices, payments, and/or contacts ' +
      'with the external accounting system.',
  })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async sync(
    @CurrentUser() user: IUser,
    @Body() dto: SyncRequestDto,
  ) {
    this.assertProviderReady();
    const tenantId = getTenantId(user);
    this.logger.log(
      `Starting ${dto.direction} sync for tenant ${tenantId}`,
    );

    return this.provider.sync(tenantId, {
      direction: dto.direction,
      entities: dto.entities,
      fromDate: dto.fromDate,
      fullSync: dto.fullSync,
    });
  }

  /** Assert that the injected provider is a fully resolved implementation. */
  private assertProviderReady(): void {
    if (
      !this.provider ||
      (this.provider as unknown as Record<string, unknown>).__pending === true
    ) {
      const name =
        (this.provider as unknown as Record<string, unknown>)?.providerName ?? 'unknown';
      throw new BusinessException(
        `Accounting provider '${name}' is not yet configured. ` +
          'An adapter must be registered for this provider.',
        'PROVIDER_NOT_CONFIGURED',
        { provider: name },
      );
    }
  }
}
