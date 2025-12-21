import { Controller, Get, Query, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { TransactionStatus } from '../../database/entities/transaction.entity';
import { CategorizationSource as CategorizationSourceEnum } from '../../database/entities/categorization.entity';
import {
  ListTransactionsQueryDto,
  TransactionListResponseDto,
  TransactionResponseDto,
  CategorizationResponseDto,
} from './dto';

@Controller('transactions')
@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
export class TransactionController {
  private readonly logger = new Logger(TransactionController.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions with filtering and pagination',
    description:
      'Returns paginated list of transactions for the authenticated tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    type: TransactionListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listTransactions(
    @Query() query: ListTransactionsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<TransactionListResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Listing transactions for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // Build filter for repository
    const filter = {
      status: query.status,
      dateFrom: query.date_from ? new Date(query.date_from) : undefined,
      dateTo: query.date_to ? new Date(query.date_to) : undefined,
      isReconciled: query.is_reconciled,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };

    // Fetch transactions
    const result = await this.transactionRepo.findByTenant(tenantId, filter);

    // Fetch categorizations for all transactions in batch
    const transactionIds = result.data.map((tx) => tx.id);
    const categorizationMap = new Map<string, CategorizationResponseDto>();

    for (const txId of transactionIds) {
      const cats = await this.categorizationRepo.findByTransaction(txId);
      if (cats.length > 0) {
        // Use most recent non-split categorization, or first if all are splits
        const primary = cats.find((c) => !c.isSplit) ?? cats[0];
        categorizationMap.set(txId, {
          account_code: primary.accountCode,
          account_name: primary.accountName,
          confidence_score: Number(primary.confidenceScore),
          source: primary.source as unknown as CategorizationSourceEnum,
          reviewed_at: primary.reviewedAt ?? undefined,
        });
      }
    }

    // Transform to response DTOs
    const data: TransactionResponseDto[] = result.data.map((tx) => ({
      id: tx.id,
      date: tx.date.toISOString().split('T')[0],
      description: tx.description,
      payee_name: tx.payeeName,
      reference: tx.reference,
      amount_cents: tx.amountCents,
      is_credit: tx.isCredit,
      status: tx.status as TransactionStatus,
      is_reconciled: tx.isReconciled,
      categorization: categorizationMap.get(tx.id),
      created_at: tx.createdAt,
    }));

    return {
      success: true,
      data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }
}
