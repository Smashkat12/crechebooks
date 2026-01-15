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
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { PrismaService } from '../../database/prisma/prisma.service';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import {
  TransactionImportService,
  ImportFile,
} from '../../database/services/transaction-import.service';
import { CategorizationService } from '../../database/services/categorization.service';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
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
  CreateSplitTransactionDto,
  CreateSplitTransactionResponseDto,
} from './dto';
import {
  UpdateCategorizationRequestDto,
  UpdateCategorizationResponseDto,
  XeroSyncStatusEnum,
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

  // Income category codes (4000-4999 range)
  private readonly INCOME_CATEGORIES = ['4000', '4100', '4200', '4900'];

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly importService: TransactionImportService,
    private readonly categorizationService: CategorizationService,
    private readonly paymentAllocationService: PaymentAllocationService,
    private readonly prisma: PrismaService,
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
    // Handle year filter - convert to date range
    let dateFrom = query.date_from ? new Date(query.date_from) : undefined;
    let dateTo = query.date_to ? new Date(query.date_to) : undefined;

    if (query.year && !dateFrom && !dateTo) {
      // Year filter takes precedence when no explicit date range provided
      dateFrom = new Date(Date.UTC(query.year, 0, 1, 0, 0, 0, 0)); // Jan 1
      dateTo = new Date(Date.UTC(query.year, 11, 31, 23, 59, 59, 999)); // Dec 31
    }

    const filter = {
      status: query.status,
      dateFrom,
      dateTo,
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
    const splitInfoMap = new Map<
      string,
      { isSplit: boolean; splitCount: number }
    >();

    for (const txId of transactionIds) {
      const cats = await this.categorizationRepo.findByTransaction(txId);
      if (cats.length > 0) {
        // Check if transaction has splits
        const splitCats = cats.filter((c) => c.isSplit);
        const isSplit = splitCats.length > 0;
        splitInfoMap.set(txId, {
          isSplit,
          splitCount: isSplit ? splitCats.length : 0,
        });

        // Use most recent non-split categorization, or first if all are splits
        const primary = cats.find((c) => !c.isSplit) ?? cats[0];
        categorizationMap.set(txId, {
          account_code: primary.accountCode,
          account_name: primary.accountName,
          confidence_score: Number(primary.confidenceScore),
          source: primary.source as unknown as CategorizationSourceEnum,
          reviewed_at: primary.reviewedAt ?? undefined,
        });
      } else {
        splitInfoMap.set(txId, { isSplit: false, splitCount: 0 });
      }
    }

    // Transform to response DTOs
    const data: TransactionResponseDto[] = result.data.map((tx) => {
      const splitInfo = splitInfoMap.get(tx.id) ?? {
        isSplit: false,
        splitCount: 0,
      };
      return {
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
        is_split: splitInfo.isSplit,
        split_count: splitInfo.splitCount,
        created_at: tx.createdAt,
      };
    });

    // TASK-DATA-004: Include hasNext/hasPrev in pagination metadata
    const hasNext = result.page < result.totalPages;
    const hasPrev = result.page > 1;

    return {
      success: true,
      data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  @ApiOperation({
    summary: 'Export transactions to CSV',
    description:
      'Export all transactions for the tenant as a CSV file. Optimized for large datasets.',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file download',
    content: { 'text/csv': {} },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportTransactions(
    @Query() query: ListTransactionsQueryDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = user.tenantId;

    this.logger.debug(`Exporting transactions for tenant=${tenantId}`);

    // Build date filter
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (query.year) {
      dateFrom = new Date(Date.UTC(query.year, 0, 1, 0, 0, 0, 0));
      dateTo = new Date(Date.UTC(query.year, 11, 31, 23, 59, 59, 999));
    } else if (query.date_from || query.date_to) {
      dateFrom = query.date_from ? new Date(query.date_from) : undefined;
      dateTo = query.date_to ? new Date(query.date_to) : undefined;
    }

    // Fetch transactions with categorizations in a single optimized query
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        ...(query.status && { status: query.status }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo && { lte: dateTo }),
              },
            }
          : {}),
      },
      include: {
        categorizations: {
          where: { isSplit: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { date: 'desc' },
    });

    // Generate CSV
    const headers = [
      'Date',
      'Description',
      'Payee',
      'Reference',
      'Amount',
      'Type',
      'Status',
      'Category Code',
      'Category Name',
      'Reconciled',
    ];

    const escapeCSV = (val: string | null | undefined): string => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = transactions.map((tx) => {
      const cat = tx.categorizations[0];
      return [
        tx.date.toISOString().split('T')[0],
        escapeCSV(tx.description),
        escapeCSV(tx.payeeName),
        escapeCSV(tx.reference),
        (tx.amountCents / 100).toFixed(2),
        tx.isCredit ? 'Credit' : 'Debit',
        tx.status,
        cat?.accountCode || '',
        escapeCSV(cat?.accountName),
        tx.isReconciled ? 'Yes' : 'No',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    // Set filename with date
    const filename = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    this.logger.debug(`Exported ${transactions.length} transactions`);
    res.send(csv);
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
        categorization: result.categorization
          ? {
              auto_categorized: result.categorization.autoCategorized,
              review_required: result.categorization.reviewRequired,
            }
          : undefined,
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
      `Update categorization: tx=${id}, account=${dto.account_code}, parent_id=${dto.parent_id ?? 'none'}, tenant=${user.tenantId}`,
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

    // TASK-XERO-005: Use categorizeAndSync to auto-push to Xero
    const result = await this.categorizationService.categorizeAndSync(
      id,
      serviceDto,
      user.id,
      user.tenantId,
    );

    const transaction = result.transaction;

    // Base response with Xero sync status
    const response: UpdateCategorizationResponseDto = {
      success: true,
      data: {
        id: transaction.id,
        status: transaction.status,
        account_code: dto.account_code,
        account_name: dto.account_name,
        source: 'USER_OVERRIDE',
        pattern_created: dto.create_pattern !== false && !dto.is_split,
        xero_sync_status: result.xeroSyncStatus as XeroSyncStatusEnum,
        xero_sync_error: result.xeroSyncError,
      },
    };

    // Handle income allocation to parent account
    // When parent_id is provided for income categories on credit transactions,
    // auto-allocate to outstanding invoices (FIFO - oldest first)
    if (dto.parent_id && this.INCOME_CATEGORIES.includes(dto.account_code)) {
      // Get the full transaction to check if it's a credit
      const fullTransaction = await this.transactionRepo.findById(
        user.tenantId,
        id,
      );

      if (fullTransaction && fullTransaction.isCredit) {
        this.logger.log(
          `Income allocation: tx=${id}, parent=${dto.parent_id}, amount=${fullTransaction.amountCents} cents`,
        );

        try {
          // Get suggested allocations (FIFO - oldest invoices first)
          const suggestions =
            await this.paymentAllocationService.suggestAllocation(
              user.tenantId,
              id,
              dto.parent_id,
            );

          if (suggestions.length > 0) {
            // Allocate to outstanding invoices
            const allocationResult =
              await this.paymentAllocationService.allocatePayment({
                tenantId: user.tenantId,
                transactionId: id,
                allocations: suggestions.map((s) => ({
                  invoiceId: s.invoiceId,
                  amountCents: s.suggestedAmountCents,
                })),
                userId: user.id,
              });

            // Add payment allocations to response
            response.data.payment_allocations = [];
            for (const payment of allocationResult.payments) {
              const invoice = await this.invoiceRepo.findById(
                payment.invoiceId,
                user.tenantId,
              );
              response.data.payment_allocations.push({
                payment_id: payment.id,
                invoice_id: payment.invoiceId,
                invoice_number: invoice?.invoiceNumber ?? 'Unknown',
                amount_cents: payment.amountCents,
              });
            }

            response.data.unallocated_cents =
              allocationResult.unallocatedAmountCents;

            this.logger.log(
              `Allocated ${allocationResult.payments.length} payments, unallocated=${allocationResult.unallocatedAmountCents} cents`,
            );
          } else {
            // No outstanding invoices - keep full amount as credit balance
            this.logger.log(
              `No outstanding invoices for parent ${dto.parent_id}, transaction remains unallocated`,
            );
            response.data.unallocated_cents = fullTransaction.amountCents;
          }
        } catch (error) {
          // Log error but don't fail the categorization
          this.logger.warn(
            `Failed to auto-allocate income to invoices: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Still return success since categorization succeeded
        }
      }
    }

    return response;
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

  @Post(':id/splits')
  @ApiOperation({
    summary: 'Create split transaction',
    description:
      'Split a transaction across multiple categories. The sum of split amounts must equal the transaction amount.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
  @ApiResponse({
    status: 201,
    description: 'Split transaction created successfully',
    type: CreateSplitTransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (split amounts do not match transaction)',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async createSplitTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSplitTransactionDto,
    @CurrentUser() user: IUser,
  ): Promise<CreateSplitTransactionResponseDto> {
    this.logger.log(
      `Create split transaction: tx=${id}, splits=${dto.splits.length}, tenant=${user.tenantId}`,
    );

    // Validate that we have at least 2 splits
    if (dto.splits.length < 2) {
      throw new BadRequestException(
        'A split transaction requires at least 2 allocations',
      );
    }

    // Get the transaction to verify it exists and get the amount
    const transaction = await this.transactionRepo.findById(user.tenantId, id);
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    // Verify split amounts equal transaction amount
    const totalSplitAmount = dto.splits.reduce(
      (sum, split) => sum + split.amount,
      0,
    );
    const transactionAmount = Math.abs(transaction.amountCents);

    if (totalSplitAmount !== transactionAmount) {
      throw new BadRequestException(
        `Split amounts (${totalSplitAmount}) do not equal transaction amount (${transactionAmount})`,
      );
    }

    // Use the categorization service to create the split
    const serviceDto = {
      accountCode: dto.splits[0].categoryId,
      accountName: dto.splits[0].categoryName,
      isSplit: true,
      splits: dto.splits.map((s) => ({
        accountCode: s.categoryId,
        accountName: s.categoryName,
        amountCents: s.amount,
        vatType: VatType.STANDARD,
        description: s.description,
      })),
      vatType: VatType.STANDARD,
      createPattern: false,
    };

    await this.categorizationService.updateCategorization(
      id,
      serviceDto,
      user.id,
      user.tenantId,
    );

    // Return success with split details
    return {
      success: true,
      data: {
        transactionId: id,
        splits: dto.splits.map((s, index) => ({
          id: `split-${index}`,
          categoryId: s.categoryId,
          amount: s.amount,
        })),
      },
    };
  }
}
