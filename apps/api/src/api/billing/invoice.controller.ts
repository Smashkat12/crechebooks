import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
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
import { InvoiceDeliveryService } from '../../database/services/invoice-delivery.service';
import { AdhocChargeService } from '../../database/services/adhoc-charge.service';
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
  ApiSendInvoicesDto,
  SendInvoicesResponseDto,
  AddAdhocChargeRequestDto,
  AddAdhocChargeResponseDto,
  ListAdhocChargesResponseDto,
  RemoveAdhocChargeResponseDto,
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
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
    private readonly adhocChargeService: AdhocChargeService,
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

  @Post('send')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Send invoices to parents',
    description:
      'Sends DRAFT invoices via email/WhatsApp. Returns partial success if some fail.',
  })
  @ApiResponse({ status: 200, type: SendInvoicesResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid invoice IDs' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async sendInvoices(
    @Body() dto: ApiSendInvoicesDto,
    @CurrentUser() user: IUser,
  ): Promise<SendInvoicesResponseDto> {
    this.logger.log(
      `Send invoices: tenant=${user.tenantId}, count=${dto.invoice_ids.length}`,
    );

    // Call service layer (handles DRAFT validation, tenant isolation, delivery)
    const result = await this.invoiceDeliveryService.sendInvoices({
      tenantId: user.tenantId,
      invoiceIds: dto.invoice_ids, // API: snake_case -> Service: camelCase
      method: dto.delivery_method,
    });

    this.logger.log(
      `Send complete: sent=${result.sent}, failed=${result.failed}`,
    );

    // Transform service result to API response (camelCase -> snake_case)
    return {
      success: true,
      data: {
        sent: result.sent,
        failed: result.failed,
        failures: result.failures.map((f) => ({
          invoice_id: f.invoiceId,
          reason: f.reason,
          code: f.code,
        })),
      },
    };
  }

  @Post(':id/charges')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Add an ad-hoc charge to an invoice',
    description:
      'Adds a manual charge to a DRAFT invoice. VAT is calculated automatically based on tenant settings.',
  })
  @ApiResponse({ status: 201, type: AddAdhocChargeResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or invoice is not in DRAFT status',
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions or invoice belongs to another tenant',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async addAdhocCharge(
    @Param('id') invoiceId: string,
    @Body() dto: AddAdhocChargeRequestDto,
    @CurrentUser() user: IUser,
  ): Promise<AddAdhocChargeResponseDto> {
    this.logger.log(
      `Adding ad-hoc charge to invoice ${invoiceId} for tenant ${user.tenantId}`,
    );

    // Map snake_case request to camelCase for service
    const result = await this.adhocChargeService.addCharge(
      user.tenantId,
      invoiceId,
      {
        description: dto.description,
        amountCents: dto.amount_cents,
        quantity: dto.quantity,
        accountCode: dto.account_code,
      },
    );

    // Map camelCase response to snake_case for API
    return {
      success: true,
      data: {
        line_id: result.lineId,
        invoice_id: result.invoiceId,
        description: result.description,
        amount_cents: result.amountCents,
        quantity: result.quantity,
        vat_cents: result.vatCents,
        total_cents: result.totalCents,
        invoice_subtotal_cents: result.invoiceSubtotalCents,
        invoice_vat_cents: result.invoiceVatCents,
        invoice_total_cents: result.invoiceTotalCents,
      },
    };
  }

  @Get(':id/charges')
  @ApiOperation({
    summary: 'List ad-hoc charges for an invoice',
    description: 'Returns all manual charges added to the invoice.',
  })
  @ApiResponse({ status: 200, type: ListAdhocChargesResponseDto })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiForbiddenResponse({
    description: 'Invoice belongs to another tenant',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listAdhocCharges(
    @Param('id') invoiceId: string,
    @CurrentUser() user: IUser,
  ): Promise<ListAdhocChargesResponseDto> {
    this.logger.log(
      `Listing ad-hoc charges for invoice ${invoiceId} for tenant ${user.tenantId}`,
    );

    const result = await this.adhocChargeService.getCharges(
      user.tenantId,
      invoiceId,
    );

    // Map camelCase response to snake_case for API
    return {
      success: true,
      data: {
        invoice_id: result.invoiceId,
        charges: result.charges.map((charge) => ({
          line_id: charge.lineId,
          description: charge.description,
          quantity: charge.quantity,
          unit_price_cents: charge.unitPriceCents,
          subtotal_cents: charge.subtotalCents,
          vat_cents: charge.vatCents,
          total_cents: charge.totalCents,
          account_code: charge.accountCode,
        })),
        total_charges: result.totalCharges,
        total_amount_cents: result.totalAmountCents,
      },
    };
  }

  @Delete(':id/charges/:lineId')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Remove an ad-hoc charge from an invoice',
    description:
      'Removes a manual charge from a DRAFT invoice. Invoice totals are recalculated automatically.',
  })
  @ApiResponse({ status: 200, type: RemoveAdhocChargeResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, invoice is not in DRAFT status, or line is not an ad-hoc charge',
  })
  @ApiResponse({ status: 404, description: 'Invoice or line not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions or invoice belongs to another tenant',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async removeAdhocCharge(
    @Param('id') invoiceId: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: IUser,
  ): Promise<RemoveAdhocChargeResponseDto> {
    this.logger.log(
      `Removing ad-hoc charge ${lineId} from invoice ${invoiceId} for tenant ${user.tenantId}`,
    );

    await this.adhocChargeService.removeCharge(
      user.tenantId,
      invoiceId,
      lineId,
    );

    return {
      success: true,
      message: 'Ad-hoc charge removed successfully',
    };
  }
}
