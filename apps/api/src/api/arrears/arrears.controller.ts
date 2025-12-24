import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  HttpCode,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ArrearsReportPdfService, ArrearsReportOptions } from '../../database/services/arrears-report-pdf.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import {
  ListArrearsQueryDto,
  ArrearsListResponseDto,
  ArrearsItemDto,
  ArrearsSummaryResponseDto,
  SendReminderDto,
  SendReminderResponseDto,
} from './dto';

@Controller('arrears')
@ApiTags('Arrears')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArrearsController {
  private readonly logger = new Logger(ArrearsController.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly childRepo: ChildRepository,
    private readonly arrearsPdfService: ArrearsReportPdfService,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List arrears with filtering and pagination',
    description:
      'Returns paginated list of accounts in arrears for the authenticated tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Arrears retrieved successfully',
    type: ArrearsListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listArrears(
    @Query() query: ListArrearsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ArrearsListResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Listing arrears for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // Get all overdue invoices
    const overdueInvoices = await this.invoiceRepo.findOverdue(tenantId);

    // Group by parent and calculate totals
    const parentArrearsMap = new Map<
      string,
      {
        parentId: string;
        childIds: Set<string>;
        invoices: typeof overdueInvoices;
        totalOutstandingCents: number;
        oldestDueDate: Date;
      }
    >();

    const now = new Date();

    for (const invoice of overdueInvoices) {
      const balanceDue = invoice.totalCents - invoice.amountPaidCents;
      if (balanceDue <= 0) continue;

      if (!parentArrearsMap.has(invoice.parentId)) {
        parentArrearsMap.set(invoice.parentId, {
          parentId: invoice.parentId,
          childIds: new Set(),
          invoices: [],
          totalOutstandingCents: 0,
          oldestDueDate: invoice.dueDate,
        });
      }

      const entry = parentArrearsMap.get(invoice.parentId)!;
      entry.childIds.add(invoice.childId);
      entry.invoices.push(invoice);
      entry.totalOutstandingCents += balanceDue;
      if (invoice.dueDate < entry.oldestDueDate) {
        entry.oldestDueDate = invoice.dueDate;
      }
    }

    // Convert to array and apply filters
    let arrearsEntries = Array.from(parentArrearsMap.values());

    if (query.minDays) {
      arrearsEntries = arrearsEntries.filter((entry) => {
        const daysPastDue = Math.floor(
          (now.getTime() - entry.oldestDueDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return daysPastDue >= query.minDays!;
      });
    }

    if (query.minAmount) {
      const minAmountCents = Math.round(query.minAmount * 100);
      arrearsEntries = arrearsEntries.filter(
        (entry) => entry.totalOutstandingCents >= minAmountCents,
      );
    }

    if (query.parentId) {
      arrearsEntries = arrearsEntries.filter(
        (entry) => entry.parentId === query.parentId,
      );
    }

    // Sort by oldest due date (most overdue first)
    arrearsEntries.sort(
      (a, b) => a.oldestDueDate.getTime() - b.oldestDueDate.getTime(),
    );

    // Apply pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = arrearsEntries.length;
    const skip = (page - 1) * limit;
    const paginatedEntries = arrearsEntries.slice(skip, skip + limit);

    // Fetch parent and child data
    const arrearsItems: ArrearsItemDto[] = [];

    for (const entry of paginatedEntries) {
      const parent = await this.parentRepo.findById(entry.parentId);
      if (!parent) continue;

      // Get first child for display (or could aggregate multiple)
      const firstChildId = Array.from(entry.childIds)[0];
      const child = await this.childRepo.findById(firstChildId);
      if (!child) continue;

      const daysPastDue = Math.floor(
        (now.getTime() - entry.oldestDueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      arrearsItems.push({
        id: `arrears-${entry.parentId}`,
        parent_id: entry.parentId,
        parent_name: `${parent.firstName} ${parent.lastName}`,
        child_id: firstChildId,
        child_name: `${child.firstName} ${child.lastName}`,
        total_outstanding: entry.totalOutstandingCents / 100,
        oldest_invoice_date: entry.oldestDueDate.toISOString().split('T')[0],
        days_past_due: daysPastDue,
        invoice_count: entry.invoices.length,
        last_payment_date: undefined, // Would need to query payments
        contact_email: parent.email ?? undefined,
        contact_phone: parent.phone ?? undefined,
      });
    }

    return {
      success: true,
      arrears: arrearsItems,
      total,
      page,
      limit,
    };
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get arrears summary',
    description: 'Returns summary statistics for accounts in arrears',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary retrieved successfully',
    type: ArrearsSummaryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getArrearsSummary(
    @CurrentUser() user: IUser,
  ): Promise<ArrearsSummaryResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(`Getting arrears summary for tenant=${tenantId}`);

    // Get all overdue invoices
    const overdueInvoices = await this.invoiceRepo.findOverdue(tenantId);

    const now = new Date();
    let totalOutstandingCents = 0;
    const parentIds = new Set<string>();

    const ageBuckets = {
      current: 0,
      days30: 0,
      days60: 0,
      days90: 0,
      days90Plus: 0,
    };

    for (const invoice of overdueInvoices) {
      const balanceDue = invoice.totalCents - invoice.amountPaidCents;
      if (balanceDue <= 0) continue;

      totalOutstandingCents += balanceDue;
      parentIds.add(invoice.parentId);

      const daysPastDue = Math.floor(
        (now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysPastDue > 90) {
        ageBuckets.days90Plus += balanceDue;
      } else if (daysPastDue > 60) {
        ageBuckets.days90 += balanceDue;
      } else if (daysPastDue > 30) {
        ageBuckets.days60 += balanceDue;
      } else if (daysPastDue > 0) {
        ageBuckets.days30 += balanceDue;
      } else {
        ageBuckets.current += balanceDue;
      }
    }

    return {
      success: true,
      totalOutstanding: totalOutstandingCents / 100,
      totalAccounts: parentIds.size,
      byAgeBucket: {
        current: ageBuckets.current / 100,
        days30: ageBuckets.days30 / 100,
        days60: ageBuckets.days60 / 100,
        days90: ageBuckets.days90 / 100,
        days90Plus: ageBuckets.days90Plus / 100,
      },
      trend: {
        previousMonth: 0, // Would need historical data
        change: 0,
        changePercent: 0,
      },
    };
  }

  @Post('reminder')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Send payment reminders',
    description: 'Sends payment reminders to parents with outstanding balances',
  })
  @ApiResponse({
    status: 200,
    description: 'Reminders sent',
    type: SendReminderResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async sendReminder(
    @Body() dto: SendReminderDto,
    @CurrentUser() user: IUser,
  ): Promise<SendReminderResponseDto> {
    this.logger.log(
      `Send reminder: tenant=${user.tenantId}, count=${dto.parentIds.length}, method=${dto.method}`,
    );

    // For now, just simulate sending reminders
    // In a real implementation, this would integrate with email/WhatsApp services
    const sent = dto.parentIds.length;
    const failed = 0;

    this.logger.log(`Reminders sent: ${sent}, failed: ${failed}`);

    return {
      success: true,
      sent,
      failed,
    };
  }

  /**
   * TASK-PAY-017: Export arrears report as PDF
   */
  @Get('export/pdf')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({
    summary: 'Export arrears report as PDF',
    description: 'Generates a professional PDF report of arrears with aging analysis, summary statistics, and detailed invoice breakdown.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description: 'PDF file generated successfully',
    content: {
      'application/pdf': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportPdf(
    @Query() query: ListArrearsQueryDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = user.tenantId;

    this.logger.log(`Generating arrears PDF for tenant=${tenantId}`);

    const options: ArrearsReportOptions = {
      parentId: query.parentId,
      minAmountCents: query.minAmount ? Math.round(query.minAmount * 100) : undefined,
      includeTopDebtors: true,
      topDebtorsLimit: 10,
      includeDetailedInvoices: true,
    };

    const pdfBuffer = await this.arrearsPdfService.generatePdf(tenantId, options);

    const filename = `arrears-report-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  }
}
