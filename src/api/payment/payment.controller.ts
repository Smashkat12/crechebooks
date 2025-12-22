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
} from './dto';

@Controller('payments')
@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentAllocationService: PaymentAllocationService,
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
}
