import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Body,
  Param,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import {
  TransactionImportService,
  ImportFile,
} from '../../database/services/transaction-import.service';
import { CategorizationService } from '../../database/services/categorization.service';
import { UserCategorizationDto as ServiceUserCategorizationDto } from '../../database/dto/categorization-service.dto';
import { VatType } from '../../database/entities/categorization.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { TransactionStatus } from '../../database/entities/transaction.entity';
import { CategorizationSource as CategorizationSourceEnum } from '../../database/entities/categorization.entity';
import {
  ListTransactionsQueryDto,
  TransactionListResponseDto,
  TransactionResponseDto,
  CategorizationResponseDto,
  ImportTransactionsRequestDto,
  ImportTransactionsResponseDto,
} from './dto';
import {
  UpdateCategorizationRequestDto,
  UpdateCategorizationResponseDto,
} from './dto/update-categorization.dto';
import {
  BatchCategorizeRequestDto,
  BatchCategorizeResponseDto,
} from './dto/batch-categorize.dto';
import { SuggestionsResponseDto } from './dto/suggestions.dto';

@Controller('transactions')
@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
export class TransactionController {
  private readonly logger = new Logger(TransactionController.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly importService: TransactionImportService,
    private readonly categorizationService: CategorizationService,
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

  @Post('import')
  @ApiOperation({
    summary: 'Import transactions from file',
    description:
      'Upload CSV or PDF bank statement file. Processing is synchronous - response includes full import statistics.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'bank_account'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Bank statement file (CSV or PDF, max 10MB)',
        },
        bank_account: {
          type: 'string',
          description: 'Bank account identifier',
          example: 'fnb-business-001',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Import completed successfully',
    type: ImportTransactionsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid file type, file too large, or missing required fields',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (ext === 'csv' || ext === 'pdf') {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Invalid file type: .${ext}. Allowed: .csv, .pdf`,
            ),
            false,
          );
        }
      },
    }),
  )
  async importTransactions(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportTransactionsRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<ImportTransactionsResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!dto.bank_account) {
      throw new BadRequestException('bank_account is required');
    }

    this.logger.log(
      `Import request: file=${file.originalname}, size=${file.size}, bank=${dto.bank_account}, tenant=${user.tenantId}`,
    );

    // Map Express.Multer.File to ImportFile interface
    const importFile: ImportFile = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };

    const result = await this.importService.importFromFile(
      importFile,
      dto.bank_account,
      user.tenantId,
    );

    return {
      success: result.status !== 'FAILED',
      data: {
        import_batch_id: result.importBatchId,
        status: result.status,
        file_name: result.fileName,
        total_parsed: result.totalParsed,
        duplicates_skipped: result.duplicatesSkipped,
        transactions_created: result.transactionsCreated,
        errors: result.errors.map((e) => ({
          row: e.row,
          field: e.field,
          message: e.message,
          code: e.code,
        })),
      },
    };
  }

  @Put(':id/categorize')
  @ApiOperation({
    summary: 'Update transaction categorization',
    description:
      'Manually override categorization for a transaction. Optionally creates a pattern for future matching.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Categorization updated successfully',
    type: UpdateCategorizationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (bad account code, split mismatch)',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async updateCategorization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategorizationRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<UpdateCategorizationResponseDto> {
    this.logger.log(
      `Update categorization: tx=${id}, account=${dto.account_code}, tenant=${user.tenantId}`,
    );

    // Map API DTO to service DTO
    const serviceDto: ServiceUserCategorizationDto = {
      accountCode: dto.account_code,
      accountName: dto.account_name,
      isSplit: dto.is_split,
      splits: dto.splits?.map((s) => ({
        accountCode: s.account_code,
        accountName: s.account_name,
        amountCents: s.amount_cents,
        vatType: s.vat_type as unknown as VatType,
        description: s.description,
      })),
      vatType: dto.vat_type as unknown as VatType,
      createPattern: dto.create_pattern,
    };

    const transaction = await this.categorizationService.updateCategorization(
      id,
      serviceDto,
      user.id,
      user.tenantId,
    );

    return {
      success: true,
      data: {
        id: transaction.id,
        status: transaction.status,
        account_code: dto.account_code,
        account_name: dto.account_name,
        source: 'USER_OVERRIDE',
        pattern_created: dto.create_pattern !== false && !dto.is_split,
      },
    };
  }

  @Post('categorize/batch')
  @ApiOperation({
    summary: 'Batch AI categorization',
    description:
      'Trigger AI categorization for multiple transactions. If no IDs provided, categorizes all PENDING transactions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch categorization completed',
    type: BatchCategorizeResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async batchCategorize(
    @Body() dto: BatchCategorizeRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<BatchCategorizeResponseDto> {
    let transactionIds = dto.transaction_ids ?? [];

    // If no IDs provided, get all PENDING transactions
    if (transactionIds.length === 0) {
      const pending = await this.transactionRepo.findByTenant(user.tenantId, {
        status: TransactionStatus.PENDING,
        limit: 1000,
      });
      transactionIds = pending.data.map((tx) => tx.id);
    }

    this.logger.log(
      `Batch categorize: count=${transactionIds.length}, force=${dto.force_recategorize ?? false}, tenant=${user.tenantId}`,
    );

    if (transactionIds.length === 0) {
      return {
        success: true,
        data: {
          total_processed: 0,
          auto_categorized: 0,
          review_required: 0,
          failed: 0,
          results: [],
          statistics: {
            avg_confidence: 0,
            pattern_match_rate: 0,
          },
        },
      };
    }

    const result = await this.categorizationService.categorizeTransactions(
      transactionIds,
      user.tenantId,
    );

    return {
      success: true,
      data: {
        total_processed: result.totalProcessed,
        auto_categorized: result.autoCategorized,
        review_required: result.reviewRequired,
        failed: result.failed,
        results: result.results.map((r) => ({
          transaction_id: r.transactionId,
          status: r.status,
          account_code: r.accountCode,
          account_name: r.accountName,
          confidence_score: r.confidenceScore,
          source: r.source,
          error: r.error,
        })),
        statistics: {
          avg_confidence: result.statistics.avgConfidence,
          pattern_match_rate: result.statistics.patternMatchRate,
        },
      },
    };
  }

  @Get(':id/suggestions')
  @ApiOperation({
    summary: 'Get categorization suggestions',
    description:
      'Get AI and pattern-based suggestions for categorizing a transaction.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Suggestions retrieved successfully',
    type: SuggestionsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getSuggestions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<SuggestionsResponseDto> {
    const suggestions = await this.categorizationService.getSuggestions(
      id,
      user.tenantId,
    );

    return {
      success: true,
      data: suggestions.map((s) => ({
        account_code: s.accountCode,
        account_name: s.accountName,
        confidence_score: s.confidenceScore,
        reason: s.reason,
        source: s.source,
      })),
    };
  }
}
