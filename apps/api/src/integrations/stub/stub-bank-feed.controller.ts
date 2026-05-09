/**
 * Stub Bank Feed Controller
 *
 * Manual trigger for pulling bank-feed data from Stub.africa, independent of
 * the configured ACCOUNTING_PROVIDER. Lets us use Stub purely as a bank-feed
 * source while keeping Xero (or anything else) as the main accounting provider.
 *
 * The pull is async — Stub fetches from FNB and POSTs the result to
 * /webhooks/stub, which inserts the transactions.
 */

import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../api/auth/decorators/current-user.decorator';
import { Roles } from '../../api/auth/decorators/roles.decorator';
import { getTenantId } from '../../api/auth/utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import { StubAccountingAdapter } from './stub-accounting.adapter';

@Controller('stub')
@ApiTags('Stub Integration')
@ApiBearerAuth('JWT-auth')
export class StubBankFeedController {
  private readonly logger = new Logger(StubBankFeedController.name);

  constructor(private readonly stubAdapter: StubAccountingAdapter) {}

  /**
   * Trigger a Stub bank-feed pull for the current tenant.
   * Stub processes asynchronously and delivers transactions to /webhooks/stub.
   */
  @Post('sync-bank-feed')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Trigger Stub bank-feed pull',
    description:
      'Initiates an async pull of bank-feed transactions from Stub.africa for the current tenant. Results arrive via the /webhooks/stub callback.',
  })
  @ApiResponse({
    status: 202,
    description: 'Pull initiated; awaiting webhook delivery',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async syncBankFeed(
    @CurrentUser() user: IUser,
  ): Promise<{ status: 'initiated'; tenantId: string; startedAt: string }> {
    const tenantId = getTenantId(user);
    this.logger.log(`Triggering Stub bank-feed pull for tenant ${tenantId}`);

    await this.stubAdapter.syncBankTransactions(tenantId);

    return {
      status: 'initiated',
      tenantId,
      startedAt: new Date().toISOString(),
    };
  }
}
