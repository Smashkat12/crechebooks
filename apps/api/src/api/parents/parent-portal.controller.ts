import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import type { ParentSession } from '../auth/decorators/current-parent.decorator';
import { CurrentParent } from '../auth/decorators/current-parent.decorator';
import {
  ParentDashboardDto,
  ParentInvoicesListDto,
  ParentInvoiceDetailDto,
} from './dto/parent-dashboard.dto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

@ApiTags('Parent Portal')
@ApiBearerAuth()
@Controller('parent-portal')
@UseGuards(ParentAuthGuard)
export class ParentPortalController {
  private readonly logger = new Logger(ParentPortalController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get parent dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Parent dashboard data',
    type: ParentDashboardDto,
  })
  async getDashboard(
    @CurrentParent() session: ParentSession,
  ): Promise<ParentDashboardDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Fetching dashboard for parent ${parentId}`);

    // Fetch parent with children
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      include: {
        children: true,
      },
    });

    if (!parent) {
      this.logger.warn(`Parent ${parentId} not found`);
      return this.getEmptyDashboard(session.parent);
    }

    // Fetch invoices for this parent
    const invoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Calculate balance and arrears - unpaid statuses
    const unpaidStatuses: InvoiceStatus[] = [
      InvoiceStatus.DRAFT,
      InvoiceStatus.SENT,
      InvoiceStatus.VIEWED,
      InvoiceStatus.PARTIALLY_PAID,
      InvoiceStatus.OVERDUE,
    ];

    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        status: { in: unpaidStatuses },
      },
    });

    // Calculate balance in Rands (convert from cents)
    const currentBalance = unpaidInvoices.reduce(
      (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
      0,
    ) / 100;

    // Find oldest overdue invoice to calculate days overdue
    const overdueInvoices = unpaidInvoices.filter(
      (inv) => inv.status === InvoiceStatus.OVERDUE || (inv.dueDate && new Date(inv.dueDate) < new Date()),
    );

    let daysOverdue: number | null = null;
    let hasArrears = false;

    if (overdueInvoices.length > 0) {
      hasArrears = true;
      const oldestOverdue = overdueInvoices.reduce((oldest, inv) => {
        const invDate = new Date(inv.dueDate);
        const oldestDate = new Date(oldest.dueDate);
        return invDate < oldestDate ? inv : oldest;
      });

      const dueDate = new Date(oldestOverdue.dueDate);
      const today = new Date();
      daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Find next payment due (oldest non-overdue unpaid invoice)
    const pendingInvoices = unpaidInvoices
      .filter((inv) => inv.status !== InvoiceStatus.OVERDUE && inv.status !== InvoiceStatus.PAID)
      .sort((a, b) => {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);
        return dateA.getTime() - dateB.getTime();
      });

    const nextPaymentDue =
      pendingInvoices.length > 0
        ? {
            date: pendingInvoices[0].dueDate.toISOString(),
            amount: (pendingInvoices[0].totalCents - pendingInvoices[0].amountPaidCents) / 100,
          }
        : null;

    // Transform children
    const children = (parent.children || []).map((child) => ({
      id: child.id,
      name: `${child.firstName} ${child.lastName}`,
      dateOfBirth: child.dateOfBirth?.toISOString(),
      enrollmentStatus: this.mapChildStatus(child.isActive, child.deletedAt),
      className: undefined, // TODO: Add class relation when available
    }));

    // Transform invoices
    const recentInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.createdAt.toISOString(),
      amount: inv.totalCents / 100,
      status: this.mapInvoiceStatus(inv.status, inv.dueDate),
    }));

    return {
      currentBalance,
      recentInvoices,
      children,
      nextPaymentDue,
      hasArrears,
      daysOverdue,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email || '',
    };
  }

  private getEmptyDashboard(parent: ParentSession['parent']): ParentDashboardDto {
    return {
      currentBalance: 0,
      recentInvoices: [],
      children: [],
      nextPaymentDue: null,
      hasArrears: false,
      daysOverdue: null,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
    };
  }

  private mapChildStatus(
    isActive: boolean,
    deletedAt: Date | null,
  ): 'active' | 'pending' | 'inactive' {
    if (deletedAt) {
      return 'inactive';
    }
    return isActive ? 'active' : 'inactive';
  }

  private mapInvoiceStatus(
    status: InvoiceStatus,
    dueDate: Date,
  ): 'paid' | 'pending' | 'overdue' {
    if (status === InvoiceStatus.PAID) {
      return 'paid';
    }
    if (status === InvoiceStatus.OVERDUE) {
      return 'overdue';
    }
    // Check if pending invoice is past due date
    if (dueDate && new Date(dueDate) < new Date()) {
      return 'overdue';
    }
    return 'pending';
  }

  // ============================================================================
  // TASK-PORTAL-013: Parent Portal Invoices Endpoints
  // ============================================================================

  @Get('invoices')
  @ApiOperation({ summary: 'Get parent invoices list with filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'paid', 'pending', 'overdue'] })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter invoices from this date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter invoices until this date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of parent invoices',
    type: ParentInvoicesListDto,
  })
  async getInvoices(
    @CurrentParent() session: ParentSession,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<ParentInvoicesListDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 10, 50);
    const skip = (pageNum - 1) * limitNum;

    this.logger.debug(`Fetching invoices for parent ${parentId}, page ${pageNum}`);

    // Build where clause
    const where: {
      parentId: string;
      tenantId: string;
      isDeleted: boolean;
      status?: { in: InvoiceStatus[] };
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      parentId,
      tenantId,
      isDeleted: false,
    };

    // Filter by status
    if (status && status !== 'all') {
      if (status === 'paid') {
        where.status = { in: [InvoiceStatus.PAID] };
      } else if (status === 'pending') {
        where.status = { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.PARTIALLY_PAID] };
      } else if (status === 'overdue') {
        where.status = { in: [InvoiceStatus.OVERDUE] };
      }
    }

    // Filter by date range
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Get total count
    const total = await this.prisma.invoice.count({ where });

    // Fetch invoices with child info
    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    });

    const totalPages = Math.ceil(total / limitNum);

    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt.toISOString(),
        childName: inv.child ? `${inv.child.firstName} ${inv.child.lastName}` : undefined,
        amount: inv.totalCents / 100,
        status: this.mapInvoiceStatus(inv.status, inv.dueDate),
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    };
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get single invoice detail' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: 200,
    description: 'Invoice detail',
    type: ParentInvoiceDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceDetail(
    @CurrentParent() session: ParentSession,
    @Param('id') invoiceId: string,
  ): Promise<ParentInvoiceDetailDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Fetching invoice ${invoiceId} for parent ${parentId}`);

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        parentId,
        tenantId,
        isDeleted: false,
      },
      include: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        lines: true,
        tenant: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            province: true,
            postalCode: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Get payments for this invoice
    const payments = await this.prisma.payment.findMany({
      where: {
        invoiceId: invoice.id,
        tenantId,
        deletedAt: null,
      },
      orderBy: { paymentDate: 'desc' },
    });

    // Format tenant address
    const formatAddress = () => {
      if (!invoice.tenant) return undefined;
      const parts = [
        invoice.tenant.addressLine1,
        invoice.tenant.addressLine2,
        invoice.tenant.city,
        invoice.tenant.province,
        invoice.tenant.postalCode,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : undefined;
    };

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      status: this.mapInvoiceStatus(invoice.status, invoice.dueDate),
      parentName: `${invoice.parent.firstName} ${invoice.parent.lastName}`,
      parentEmail: invoice.parent.email || undefined,
      crecheName: invoice.tenant?.name || 'Unknown',
      crecheAddress: formatAddress(),
      childName: invoice.child ? `${invoice.child.firstName} ${invoice.child.lastName}` : 'Unknown',
      subtotal: invoice.subtotalCents / 100,
      vatAmount: invoice.vatCents / 100,
      total: invoice.totalCents / 100,
      amountPaid: invoice.amountPaidCents / 100,
      amountDue: (invoice.totalCents - invoice.amountPaidCents) / 100,
      lineItems: invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: line.unitPriceCents / 100,
        vatAmount: line.vatCents / 100,
        total: line.totalCents / 100,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        date: payment.paymentDate.toISOString(),
        amount: payment.amountCents / 100,
        method: payment.matchType || 'Unknown',
        reference: payment.reference || undefined,
      })),
      notes: invoice.notes || undefined,
    };
  }

  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Download invoice PDF' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async downloadInvoicePdf(
    @CurrentParent() session: ParentSession,
    @Param('id') invoiceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Downloading PDF for invoice ${invoiceId}, parent ${parentId}`);

    // Verify invoice belongs to this parent
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        parentId,
        tenantId,
        isDeleted: false,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // TODO: Integrate with actual PDF generation service
    // For now, return a placeholder response indicating PDF generation is not yet implemented
    // In production, this would call the invoice PDF service

    // Placeholder: Return a simple text response indicating the feature
    res.setHeader('Content-Type', 'application/json');
    res.status(501).json({
      message: 'PDF generation not yet implemented',
      invoiceNumber: invoice.invoiceNumber,
      hint: 'Integration with PDF service pending',
    });
  }
}
