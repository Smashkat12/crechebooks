import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  HttpCode,
  UseGuards,
  BadRequestException,
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
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { InvoiceGenerationService } from '../../database/services/invoice-generation.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import {
  InvoiceStatus,
  DeliveryStatus,
} from '../../database/entities/invoice.entity';
import {
  ListInvoicesQueryDto,
  InvoiceListResponseDto,
  InvoiceResponseDto,
  ParentSummaryDto,
  ChildSummaryDto,
  GenerateInvoicesDto,
  GenerateInvoicesResponseDto,
} from './dto';

@Controller('invoices')
@ApiTags('Invoices')
@ApiBearerAuth('JWT-auth')
export class InvoiceController {
  private readonly logger = new Logger(InvoiceController.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly childRepo: ChildRepository,
    private readonly invoiceGenerationService: InvoiceGenerationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List invoices with filtering and pagination',
    description:
      'Returns paginated list of invoices for the authenticated tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Invoices retrieved successfully',
    type: InvoiceListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listInvoices(
    @Query() query: ListInvoicesQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<InvoiceListResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Listing invoices for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // Build filter for repository
    const filter: {
      status?: InvoiceStatus;
      parentId?: string;
      childId?: string;
      isDeleted?: boolean;
    } = {
      isDeleted: false,
    };

    if (query.status) {
      filter.status = query.status;
    }
    if (query.parent_id) {
      filter.parentId = query.parent_id;
    }
    if (query.child_id) {
      filter.childId = query.child_id;
    }

    // Fetch all matching invoices (repository doesn't support pagination)
    let allInvoices = await this.invoiceRepo.findByTenant(tenantId, filter);

    // Apply date filters manually
    if (query.date_from) {
      const dateFrom = new Date(query.date_from);
      allInvoices = allInvoices.filter((inv) => inv.issueDate >= dateFrom);
    }
    if (query.date_to) {
      const dateTo = new Date(query.date_to);
      dateTo.setHours(23, 59, 59, 999); // End of day
      allInvoices = allInvoices.filter((inv) => inv.issueDate <= dateTo);
    }

    // Calculate pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = allInvoices.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedInvoices = allInvoices.slice(skip, skip + limit);

    // Fetch parent and child data for all invoices in batch
    const parentIds = [
      ...new Set(paginatedInvoices.map((inv) => inv.parentId)),
    ];
    const childIds = [...new Set(paginatedInvoices.map((inv) => inv.childId))];

    const parentMap = new Map<string, ParentSummaryDto>();
    const childMap = new Map<string, ChildSummaryDto>();

    for (const parentId of parentIds) {
      const parent = await this.parentRepo.findById(parentId);
      if (parent) {
        parentMap.set(parentId, {
          id: parent.id,
          name: `${parent.firstName} ${parent.lastName}`,
          email: parent.email,
        });
      }
    }

    for (const childId of childIds) {
      const child = await this.childRepo.findById(childId);
      if (child) {
        childMap.set(childId, {
          id: child.id,
          name: `${child.firstName} ${child.lastName}`,
        });
      }
    }

    // Transform to response DTOs
    const data: InvoiceResponseDto[] = paginatedInvoices.map((inv) => {
      const parent = parentMap.get(inv.parentId);
      const child = childMap.get(inv.childId);

      if (!parent || !child) {
        this.logger.error(`Missing parent or child data for invoice ${inv.id}`);
        throw new Error('Failed to load invoice relationships');
      }

      return {
        id: inv.id,
        invoice_number: inv.invoiceNumber,
        parent,
        child,
        billing_period_start: inv.billingPeriodStart
          .toISOString()
          .split('T')[0],
        billing_period_end: inv.billingPeriodEnd.toISOString().split('T')[0],
        issue_date: inv.issueDate.toISOString().split('T')[0],
        due_date: inv.dueDate.toISOString().split('T')[0],
        subtotal: inv.subtotalCents / 100,
        vat: inv.vatCents / 100,
        total: inv.totalCents / 100,
        amount_paid: inv.amountPaidCents / 100,
        balance_due: (inv.totalCents - inv.amountPaidCents) / 100,
        status: inv.status as unknown as InvoiceStatus,
        delivery_status: inv.deliveryStatus as unknown as DeliveryStatus | null,
        created_at: inv.createdAt,
      };
    });

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  @Post('generate')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Generate monthly invoices for enrolled children',
    description:
      'Generates invoices for all active enrollments or specific children.',
  })
  @ApiResponse({ status: 201, type: GenerateInvoicesResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid billing_month or future month',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async generateInvoices(
    @Body() dto: GenerateInvoicesDto,
    @CurrentUser() user: IUser,
  ): Promise<GenerateInvoicesResponseDto> {
    // 1. Validate billing_month is not future
    const [year, month] = dto.billing_month.split('-').map(Number);
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const requestedMonth = new Date(year, month - 1, 1);

    if (requestedMonth > currentMonth) {
      this.logger.warn(`Future month rejected: ${dto.billing_month}`);
      throw new BadRequestException(
        'Cannot generate invoices for future months',
      );
    }

    // 2. Call service
    this.logger.log(
      `Generate invoices: tenant=${user.tenantId}, month=${dto.billing_month}`,
    );

    const result = await this.invoiceGenerationService.generateMonthlyInvoices(
      user.tenantId,
      dto.billing_month,
      user.id,
      dto.child_ids,
    );

    this.logger.log(
      `Generation complete: created=${result.invoicesCreated}, errors=${result.errors.length}`,
    );

    // 3. Transform result (cents → decimal, camelCase → snake_case)
    return {
      success: true,
      data: {
        invoices_created: result.invoicesCreated,
        total_amount: result.totalAmountCents / 100,
        invoices: result.invoices.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoiceNumber,
          child_id: inv.childId,
          child_name: inv.childName,
          total: inv.totalCents / 100,
          status: inv.status,
          xero_invoice_id: inv.xeroInvoiceId ?? undefined,
        })),
        errors: result.errors.map((err) => ({
          child_id: err.childId,
          enrollment_id: err.enrollmentId,
          error: err.error,
          code: err.code,
        })),
      },
    };
  }
}
