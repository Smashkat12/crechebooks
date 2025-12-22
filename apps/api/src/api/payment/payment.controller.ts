/**
 * Payment Controller
 * TASK-PAY-031: Payment Controller and DTOs
 *
 * Handles manual payment allocation to invoices and payment listing.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 * All monetary amounts: decimal in API, cents internally.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Logger,
  HttpCode,
  UseGuards,
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
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import type { PaymentFilterDto } from '../../database/dto/payment.dto';
import {
  ApiAllocatePaymentDto,
  AllocatePaymentResponseDto,
  ListPaymentsQueryDto,
  PaymentListResponseDto,
  PaymentListItemDto,
  PaymentDto,
  ApiMatchPaymentsDto,
  ApiMatchingResultResponseDto,
  ApiMatchedPaymentDto,
  ApiReviewRequiredDto,
  ApiArrearsQueryDto,
  ApiArrearsReportResponseDto,
} from './dto';

@Controller('payments')
@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentAllocationService: PaymentAllocationService,
    private readonly paymentMatchingService: PaymentMatchingService,
    private readonly arrearsService: ArrearsService,
    private readonly paymentRepo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
  ) {}

  /**
   * Manually allocate a bank transaction credit to one or more invoices.
   * Transforms API snake_case to service camelCase, decimal amounts to cents.
   */
  @Post()
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Manually allocate payment to invoices',
    description:
      'Allocates a bank transaction credit to one or more invoices. ' +
      'Requires OWNER or ADMIN role. All amounts in decimal format (e.g., 3450.00 for R3450).',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment allocated successfully',
    type: AllocatePaymentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid allocation (exceeds transaction amount, not a credit, or validation error)',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction or invoice not found',
  })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async allocatePayment(
    @Body() dto: ApiAllocatePaymentDto,
    @CurrentUser() user: IUser,
  ): Promise<AllocatePaymentResponseDto> {
    this.logger.log(
      `Allocate payment: tenant=${user.tenantId}, transaction=${dto.transaction_id}, allocations=${dto.allocations.length}`,
    );

    // Transform API snake_case to service camelCase, decimal to cents
    const result = await this.paymentAllocationService.allocatePayment({
      tenantId: user.tenantId,
      transactionId: dto.transaction_id,
      allocations: dto.allocations.map((a) => ({
        invoiceId: a.invoice_id,
        amountCents: Math.round(a.amount * 100),
      })),
      userId: user.id,
    });

    this.logger.log(
      `Allocation complete: ${result.payments.length} payments created, unallocated=${result.unallocatedAmountCents} cents`,
    );

    // Transform service camelCase to API snake_case, cents to decimal
    const payments: PaymentDto[] = result.payments.map((p) => ({
      id: p.id,
      invoice_id: p.invoiceId,
      transaction_id: p.transactionId,
      amount: p.amountCents / 100,
      payment_date: p.paymentDate.toISOString(),
      reference: p.reference,
      match_type: p.matchType,
      matched_by: p.matchedBy,
      match_confidence: p.matchConfidence ? Number(p.matchConfidence) : null,
      is_reversed: p.isReversed,
      created_at: p.createdAt.toISOString(),
    }));

    return {
      success: true,
      data: {
        payments,
        unallocated_amount: result.unallocatedAmountCents / 100,
        invoices_updated: result.invoicesUpdated,
      },
    };
  }

  /**
   * List payments for the authenticated tenant with optional filters.
   * Transforms API snake_case query params to service camelCase filters.
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'List payments with optional filters',
    description:
      'Returns paginated list of payments for the authenticated tenant. ' +
      'Supports filtering by invoice, transaction, match type, and reversal status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
    type: PaymentListResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, VIEWER, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listPayments(
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<PaymentListResponseDto> {
    this.logger.log(
      `List payments: tenant=${user.tenantId}, filters=${JSON.stringify(query)}`,
    );

    // Transform API snake_case to service camelCase filter
    // Note: Cast Prisma enums to entity enums for repository compatibility
    const filter: PaymentFilterDto = {};
    if (query.invoice_id) {
      filter.invoiceId = query.invoice_id;
    }
    if (query.transaction_id) {
      filter.transactionId = query.transaction_id;
    }
    if (query.match_type) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      filter.matchType = query.match_type as any;
    }
    if (query.matched_by) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      filter.matchedBy = query.matched_by as any;
    }
    if (query.is_reversed !== undefined) {
      filter.isReversed = query.is_reversed;
    }

    // Get all payments matching filter (repository handles tenant isolation)
    const allPayments = await this.paymentRepo.findByTenantId(
      user.tenantId,
      filter,
    );

    // Apply pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPayments = allPayments.slice(startIndex, endIndex);

    // Enrich payments with invoice details
    const enrichedPayments: PaymentListItemDto[] = await Promise.all(
      paginatedPayments.map(async (p) => {
        const invoice = await this.invoiceRepo.findById(p.invoiceId);
        return {
          id: p.id,
          invoice_id: p.invoiceId,
          transaction_id: p.transactionId,
          amount: p.amountCents / 100,
          payment_date: p.paymentDate.toISOString(),
          reference: p.reference,
          match_type: p.matchType,
          matched_by: p.matchedBy,
          match_confidence: p.matchConfidence
            ? Number(p.matchConfidence)
            : null,
          is_reversed: p.isReversed,
          created_at: p.createdAt.toISOString(),
          invoice_number: invoice?.invoiceNumber,
        };
      }),
    );

    const total = allPayments.length;
    const totalPages = Math.ceil(total / limit);

    this.logger.log(
      `List payments: returned ${enrichedPayments.length} of ${total} payments`,
    );

    return {
      success: true,
      data: enrichedPayments,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Trigger AI payment matching for unallocated transactions.
   * Auto-applies matches with confidence >= 80%, flags others for review.
   */
  @Post('match')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Trigger AI payment matching',
    description:
      'Matches unallocated credit transactions to outstanding invoices. ' +
      'Auto-applies matches with >= 80% confidence, flags others for manual review.',
  })
  @ApiResponse({ status: 200, type: ApiMatchingResultResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transaction ID' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async matchPayments(
    @Body() dto: ApiMatchPaymentsDto,
    @CurrentUser() user: IUser,
  ): Promise<ApiMatchingResultResponseDto> {
    this.logger.log(
      `Match payments: tenant=${user.tenantId}, transactions=${dto.transaction_ids?.length ?? 'all'}`,
    );

    // Transform API snake_case to service camelCase
    const result = await this.paymentMatchingService.matchPayments({
      tenantId: user.tenantId,
      transactionIds: dto.transaction_ids, // snake_case -> camelCase
    });

    this.logger.log(
      `Matching complete: ${result.autoApplied} auto-applied, ${result.reviewRequired} review, ${result.noMatch} no match`,
    );

    // Transform service camelCase to API snake_case, cents to decimal
    const autoMatched: ApiMatchedPaymentDto[] = result.results
      .filter((r) => r.status === 'AUTO_APPLIED' && r.appliedMatch)
      .map((r) => ({
        id: r.appliedMatch!.paymentId,
        transaction_id: r.appliedMatch!.transactionId,
        invoice_id: r.appliedMatch!.invoiceId,
        invoice_number: r.appliedMatch!.invoiceNumber,
        amount: r.appliedMatch!.amountCents / 100, // cents -> decimal
        confidence_level:
          r.appliedMatch!.confidenceScore === 100
            ? 'EXACT'
            : r.appliedMatch!.confidenceScore >= 80
              ? 'HIGH'
              : r.appliedMatch!.confidenceScore >= 50
                ? 'MEDIUM'
                : 'LOW',
        confidence_score: r.appliedMatch!.confidenceScore,
        match_reasons: ['Auto-matched: ' + r.reason],
      }));

    const reviewRequired: ApiReviewRequiredDto[] = result.results
      .filter((r) => r.status === 'REVIEW_REQUIRED' && r.candidates)
      .map((r) => ({
        transaction_id: r.transactionId,
        amount: r.candidates![0]?.transactionAmountCents
          ? r.candidates![0].transactionAmountCents / 100
          : 0,
        reason: r.reason,
        suggested_matches: r.candidates!.map((c) => ({
          invoice_id: c.invoiceId,
          invoice_number: c.invoiceNumber,
          parent_name: c.parentName,
          confidence_score: c.confidenceScore,
          match_reasons: c.matchReasons,
          outstanding_amount: c.invoiceOutstandingCents / 100, // cents -> decimal
        })),
      }));

    return {
      success: true,
      data: {
        summary: {
          processed: result.processed,
          auto_applied: result.autoApplied,
          requires_review: result.reviewRequired,
          no_match: result.noMatch,
        },
        auto_matched: autoMatched,
        review_required: reviewRequired,
      },
    };
  }

  /**
   * Get arrears dashboard report with aging analysis.
   * Returns summary, top debtors, and all overdue invoices.
   */
  @Get('arrears')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get arrears dashboard report',
    description:
      'Returns comprehensive arrears report with aging analysis, top debtors, and overdue invoices. ' +
      'Supports filtering by date range, parent ID, and minimum amount.',
  })
  @ApiResponse({ status: 200, type: ApiArrearsReportResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getArrearsReport(
    @Query() query: ApiArrearsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ApiArrearsReportResponseDto> {
    this.logger.log(
      `Get arrears report: tenant=${user.tenantId}, filters=${JSON.stringify(query)}`,
    );

    // Transform API snake_case to service camelCase, decimal to cents
    const report = await this.arrearsService.getArrearsReport(user.tenantId, {
      dateFrom: query.date_from,
      dateTo: query.date_to,
      parentId: query.parent_id,
      minAmountCents: query.min_amount
        ? Math.round(query.min_amount * 100)
        : undefined,
    });

    // Transform service camelCase to API snake_case, cents to decimal
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    return {
      success: true,
      data: {
        summary: {
          total_outstanding: report.summary.totalOutstandingCents / 100,
          total_invoices: report.summary.totalInvoices,
          aging: {
            current: report.summary.aging.currentCents / 100,
            days_30: report.summary.aging.days30Cents / 100,
            days_60: report.summary.aging.days60Cents / 100,
            days_90_plus: report.summary.aging.days90PlusCents / 100,
          },
        },
        top_debtors: report.topDebtors
          .slice(0, query.debtor_limit ?? 10)
          .map((d) => ({
            parent_id: d.parentId,
            parent_name: d.parentName,
            email: d.parentEmail,
            phone: d.parentPhone,
            total_outstanding: d.totalOutstandingCents / 100,
            oldest_invoice_date: formatDate(d.oldestInvoiceDate),
            invoice_count: d.invoiceCount,
            max_days_overdue: d.maxDaysOverdue,
          })),
        invoices: report.invoices.map((inv) => ({
          invoice_id: inv.invoiceId,
          invoice_number: inv.invoiceNumber,
          parent_id: inv.parentId,
          parent_name: inv.parentName,
          child_id: inv.childId,
          child_name: inv.childName,
          issue_date: formatDate(inv.issueDate),
          due_date: formatDate(inv.dueDate),
          total: inv.totalCents / 100,
          amount_paid: inv.amountPaidCents / 100,
          outstanding: inv.outstandingCents / 100,
          days_overdue: inv.daysOverdue,
          aging_bucket: inv.agingBucket,
        })),
        generated_at: report.generatedAt.toISOString(),
      },
    };
  }
}
