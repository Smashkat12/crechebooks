import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import type { ParentSession } from '../auth/decorators/current-parent.decorator';
import { CurrentParent } from '../auth/decorators/current-parent.decorator';
import {
  ParentDashboardDto,
  ParentInvoicesListDto,
  ParentInvoiceDetailDto,
  ParentStatementsListDto,
  ParentStatementDetailDto,
  EmailStatementResponseDto,
  ParentPaymentsListDto,
  ParentPaymentDetailDto,
  CrecheBankDetailsDto,
  ParentProfileDto,
  UpdateParentProfileDto,
  CommunicationPreferencesDto,
  UpdateCommunicationPreferencesDto,
  ParentChildDto,
  DeleteAccountRequestDto,
  DeleteAccountResponseDto,
} from './dto/parent-dashboard.dto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../database/services/parent-onboarding.service';
import type { SignDocumentDto } from '../../database/services/parent-onboarding.service';
import { InvoiceStatus } from '@prisma/client';

@ApiTags('Parent Portal')
@ApiBearerAuth()
@Controller('parent-portal')
@UseGuards(ParentAuthGuard)
export class ParentPortalController {
  private readonly logger = new Logger(ParentPortalController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parentOnboarding: ParentOnboardingService,
  ) {}

  // ============================================================================
  // Parent Onboarding Endpoints (Comprehensive)
  // ============================================================================

  @Get('onboarding')
  @ApiOperation({ summary: 'Get comprehensive parent onboarding status' })
  @ApiResponse({
    status: 200,
    description: 'Parent onboarding status with required actions and documents',
  })
  async getOnboardingStatus(@CurrentParent() session: ParentSession) {
    return this.parentOnboarding.getOnboardingStatus(
      session.parentId,
      session.tenantId,
    );
  }

  @Post('onboarding/documents/generate')
  @ApiOperation({
    summary: 'Generate onboarding documents (fee agreement, consent forms)',
  })
  @ApiResponse({
    status: 201,
    description: 'Documents generated successfully',
  })
  async generateOnboardingDocuments(@CurrentParent() session: ParentSession) {
    return this.parentOnboarding.generateDocuments(
      session.parentId,
      session.tenantId,
    );
  }

  @Post('onboarding/documents/sign')
  @ApiOperation({ summary: 'Sign/acknowledge a document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          enum: ['FEE_AGREEMENT', 'CONSENT_FORMS'],
        },
        signedByName: { type: 'string' },
        mediaConsent: {
          type: 'string',
          enum: ['internal_only', 'website', 'social_media', 'all', 'none'],
        },
        authorizedCollectors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              idNumber: { type: 'string' },
              relationship: { type: 'string' },
            },
          },
        },
      },
      required: ['documentType', 'signedByName'],
    },
  })
  async signDocument(
    @CurrentParent() session: ParentSession,
    @Body() dto: SignDocumentDto,
    @Req() req: Request,
  ) {
    const clientIp = req.ip || req.socket.remoteAddress;
    return this.parentOnboarding.signDocument(
      session.parentId,
      session.tenantId,
      dto,
      clientIp,
    );
  }

  @Get('onboarding/documents/:documentId/download')
  @ApiOperation({ summary: 'Download a generated document' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  async downloadDocument(
    @CurrentParent() session: ParentSession,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName, mimeType } =
      await this.parentOnboarding.downloadDocument(
        documentId,
        session.parentId,
        session.tenantId,
      );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    return new StreamableFile(buffer);
  }

  @Post('onboarding/complete')
  @ApiOperation({ summary: 'Complete onboarding and trigger welcome pack' })
  async completeOnboarding(@CurrentParent() session: ParentSession) {
    return this.parentOnboarding.completeOnboarding(
      session.parentId,
      session.tenantId,
    );
  }

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
    const currentBalance =
      unpaidInvoices.reduce(
        (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
        0,
      ) / 100;

    // Find oldest overdue invoice to calculate days overdue
    const overdueInvoices = unpaidInvoices.filter(
      (inv) =>
        inv.status === InvoiceStatus.OVERDUE ||
        (inv.dueDate && new Date(inv.dueDate) < new Date()),
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
      .filter(
        (inv) =>
          inv.status !== InvoiceStatus.OVERDUE &&
          inv.status !== InvoiceStatus.PAID,
      )
      .sort((a, b) => {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);
        return dateA.getTime() - dateB.getTime();
      });

    const nextPaymentDue =
      pendingInvoices.length > 0
        ? {
            date: pendingInvoices[0].dueDate.toISOString(),
            amount:
              (pendingInvoices[0].totalCents -
                pendingInvoices[0].amountPaidCents) /
              100,
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

  private getEmptyDashboard(
    parent: ParentSession['parent'],
  ): ParentDashboardDto {
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
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'paid', 'pending', 'overdue'],
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter invoices from this date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter invoices until this date (YYYY-MM-DD)',
  })
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

    this.logger.debug(
      `Fetching invoices for parent ${parentId}, page ${pageNum}`,
    );

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
        where.status = {
          in: [
            InvoiceStatus.DRAFT,
            InvoiceStatus.SENT,
            InvoiceStatus.VIEWED,
            InvoiceStatus.PARTIALLY_PAID,
          ],
        };
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
        childName: inv.child
          ? `${inv.child.firstName} ${inv.child.lastName}`
          : undefined,
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
      childName: invoice.child
        ? `${invoice.child.firstName} ${invoice.child.lastName}`
        : 'Unknown',
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

    this.logger.debug(
      `Downloading PDF for invoice ${invoiceId}, parent ${parentId}`,
    );

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

  // ============================================================================
  // TASK-PORTAL-014: Parent Portal Statements Endpoints
  // ============================================================================

  /**
   * Get month name from month number
   */
  private getMonthName(month: number): string {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1] || 'Unknown';
  }

  @Get('statements')
  @ApiOperation({ summary: 'Get list of available statements for a year' })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Year to filter statements (defaults to current year)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available statements',
    type: ParentStatementsListDto,
  })
  async getStatements(
    @CurrentParent() session: ParentSession,
    @Query('year') yearParam?: string,
  ): Promise<ParentStatementsListDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;
    const currentDate = new Date();
    const year = yearParam
      ? parseInt(yearParam, 10)
      : currentDate.getFullYear();

    this.logger.debug(
      `Fetching statements for parent ${parentId}, year ${year}`,
    );

    // Find all months that have transactions (invoices or payments)
    const statements: ParentStatementsListDto['statements'] = [];

    // Get invoices and payments for the year
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        createdAt: { gte: startOfYear, lte: endOfYear },
      },
      select: {
        id: true,
        totalCents: true,
        amountPaidCents: true,
        createdAt: true,
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        paymentDate: { gte: startOfYear, lte: endOfYear },
        invoice: { parentId },
      },
      select: {
        id: true,
        amountCents: true,
        paymentDate: true,
      },
    });

    // Group by month and calculate stats
    const monthlyData: Map<
      number,
      {
        invoices: number;
        payments: number;
        invoiceTotal: number;
        paymentTotal: number;
      }
    > = new Map();

    // Initialize months that have data
    for (const invoice of invoices) {
      const month = invoice.createdAt.getMonth() + 1;
      const existing = monthlyData.get(month) || {
        invoices: 0,
        payments: 0,
        invoiceTotal: 0,
        paymentTotal: 0,
      };
      existing.invoices++;
      existing.invoiceTotal += invoice.totalCents;
      monthlyData.set(month, existing);
    }

    for (const payment of payments) {
      const month = payment.paymentDate.getMonth() + 1;
      const existing = monthlyData.get(month) || {
        invoices: 0,
        payments: 0,
        invoiceTotal: 0,
        paymentTotal: 0,
      };
      existing.payments++;
      existing.paymentTotal += payment.amountCents;
      monthlyData.set(month, existing);
    }

    // Calculate running balance and create statement items
    let runningBalance = 0;

    // Get opening balance (sum of all unpaid amounts before this year)
    const priorInvoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        createdAt: { lt: startOfYear },
      },
      select: { totalCents: true, amountPaidCents: true },
    });

    for (const inv of priorInvoices) {
      runningBalance += inv.totalCents - inv.amountPaidCents;
    }

    // Create statements for each month that has data
    const sortedMonths = Array.from(monthlyData.keys()).sort((a, b) => a - b);

    for (const month of sortedMonths) {
      const data = monthlyData.get(month)!;
      const openingBalance = runningBalance;

      // Net movement: invoices increase balance, payments decrease
      const netMovement = (data.invoiceTotal - data.paymentTotal) / 100;
      runningBalance += data.invoiceTotal - data.paymentTotal;
      const closingBalance = runningBalance / 100;

      // Don't include future months
      if (
        year > currentDate.getFullYear() ||
        (year === currentDate.getFullYear() &&
          month > currentDate.getMonth() + 1)
      ) {
        continue;
      }

      statements.push({
        year,
        month,
        periodLabel: `${this.getMonthName(month)} ${year}`,
        transactionCount: data.invoices + data.payments,
        openingBalance: openingBalance / 100,
        closingBalance,
        status: 'available',
      });
    }

    // Sort by month descending (most recent first)
    statements.sort((a, b) => b.month - a.month);

    return { statements, year };
  }

  @Get('statements/:year/:month')
  @ApiOperation({ summary: 'Get statement detail with transactions' })
  @ApiParam({ name: 'year', description: 'Statement year' })
  @ApiParam({ name: 'month', description: 'Statement month (1-12)' })
  @ApiResponse({
    status: 200,
    description: 'Statement detail with transactions',
    type: ParentStatementDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  async getStatementDetail(
    @CurrentParent() session: ParentSession,
    @Param('year') yearParam: string,
    @Param('month') monthParam: string,
  ): Promise<ParentStatementDetailDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new NotFoundException('Invalid year or month');
    }

    this.logger.debug(
      `Fetching statement detail for parent ${parentId}, ${year}/${month}`,
    );

    // Get parent info
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Calculate date range for the month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Get opening balance (sum of all unpaid amounts before this month)
    const priorInvoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        createdAt: { lt: startOfMonth },
      },
      select: { totalCents: true, amountPaidCents: true },
    });

    let openingBalanceCents = 0;
    for (const inv of priorInvoices) {
      openingBalanceCents += inv.totalCents - inv.amountPaidCents;
    }

    // Get invoices for this month
    const invoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      include: {
        child: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get payments for this month
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        paymentDate: { gte: startOfMonth, lte: endOfMonth },
        invoice: { parentId },
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Build transactions list with running balance
    type TransactionItem = {
      id: string;
      date: string;
      description: string;
      type: 'invoice' | 'payment' | 'credit';
      debit: number | null;
      credit: number | null;
      balance: number;
      sortDate: Date;
    };

    const transactions: TransactionItem[] = [];
    let runningBalanceCents = openingBalanceCents;
    let totalInvoicedCents = 0;
    let totalPaidCents = 0;
    const totalCreditsCents = 0;

    // Add invoices
    for (const invoice of invoices) {
      runningBalanceCents += invoice.totalCents;
      totalInvoicedCents += invoice.totalCents;

      const childName = invoice.child
        ? `${invoice.child.firstName} ${invoice.child.lastName}`
        : 'Unknown';

      transactions.push({
        id: invoice.id,
        date: invoice.createdAt.toISOString(),
        description: `${invoice.invoiceNumber} - ${childName}`,
        type: 'invoice',
        debit: invoice.totalCents / 100,
        credit: null,
        balance: runningBalanceCents / 100,
        sortDate: invoice.createdAt,
      });
    }

    // Add payments
    for (const payment of payments) {
      runningBalanceCents -= payment.amountCents;
      totalPaidCents += payment.amountCents;

      transactions.push({
        id: payment.id,
        date: payment.paymentDate.toISOString(),
        description: `Payment - ${payment.matchType || 'EFT'} Ref: ${payment.reference || 'N/A'}`,
        type: 'payment',
        debit: null,
        credit: payment.amountCents / 100,
        balance: runningBalanceCents / 100,
        sortDate: payment.paymentDate,
      });
    }

    // Sort transactions by date
    transactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    // Recalculate running balance after sorting
    let sortedRunningBalanceCents = openingBalanceCents;
    for (const txn of transactions) {
      if (txn.type === 'invoice') {
        sortedRunningBalanceCents += (txn.debit || 0) * 100;
      } else {
        sortedRunningBalanceCents -= (txn.credit || 0) * 100;
      }
      txn.balance = sortedRunningBalanceCents / 100;
    }

    const closingBalanceCents = sortedRunningBalanceCents;
    const netMovementCents =
      totalInvoicedCents - totalPaidCents - totalCreditsCents;

    return {
      year,
      month,
      periodLabel: `${this.getMonthName(month)} ${year}`,
      parentName: `${parent.firstName} ${parent.lastName}`,
      parentEmail: parent.email || undefined,
      accountNumber: `ACC-${parentId.substring(0, 8).toUpperCase()}`,
      openingBalance: openingBalanceCents / 100,
      closingBalance: closingBalanceCents / 100,
      totalInvoiced: totalInvoicedCents / 100,
      totalPaid: totalPaidCents / 100,
      totalCredits: totalCreditsCents / 100,
      netMovement: netMovementCents / 100,
      transactions: transactions.map(({ sortDate, ...txn }) => txn),
    };
  }

  @Get('statements/:year/:month/pdf')
  @ApiOperation({ summary: 'Download statement PDF' })
  @ApiParam({ name: 'year', description: 'Statement year' })
  @ApiParam({ name: 'month', description: 'Statement month (1-12)' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  downloadStatementPdf(
    @CurrentParent() session: ParentSession,
    @Param('year') yearParam: string,
    @Param('month') monthParam: string,
    @Res() res: Response,
  ): void {
    const parentId = session.parentId;
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new NotFoundException('Invalid year or month');
    }

    this.logger.debug(
      `Downloading PDF for statement ${year}/${month}, parent ${parentId}`,
    );

    // TODO: Integrate with actual PDF generation service
    // For now, return a placeholder response
    res.setHeader('Content-Type', 'application/json');
    res.status(501).json({
      message: 'Statement PDF generation not yet implemented',
      period: `${this.getMonthName(month)} ${year}`,
      hint: 'Integration with PDF service pending',
    });
  }

  @Post('statements/:year/:month/email')
  @ApiOperation({ summary: 'Email statement to parent' })
  @ApiParam({ name: 'year', description: 'Statement year' })
  @ApiParam({ name: 'month', description: 'Statement month (1-12)' })
  @ApiResponse({
    status: 200,
    description: 'Statement emailed successfully',
    type: EmailStatementResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Statement not found' })
  async emailStatement(
    @CurrentParent() session: ParentSession,
    @Param('year') yearParam: string,
    @Param('month') monthParam: string,
  ): Promise<EmailStatementResponseDto> {
    const parentId = session.parentId;
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new NotFoundException('Invalid year or month');
    }

    this.logger.debug(
      `Emailing statement ${year}/${month} to parent ${parentId}`,
    );

    // Get parent email
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { email: true },
    });

    if (!parent?.email) {
      throw new NotFoundException('Parent email not found');
    }

    // TODO: Integrate with actual email service
    // For now, return a success response indicating the feature will be implemented
    return {
      message: `Statement for ${this.getMonthName(month)} ${year} will be sent to your email`,
      sentTo: parent.email,
    };
  }

  // ============================================================================
  // TASK-PORTAL-015: Parent Portal Payments Endpoints
  // ============================================================================

  /**
   * Map payment status to a simplified status
   */
  private mapPaymentStatus(
    deletedAt: Date | null,
    paymentDate: Date,
  ): 'completed' | 'pending' | 'failed' {
    if (deletedAt) {
      return 'failed';
    }
    // If payment date is in the past, consider it completed
    return paymentDate <= new Date() ? 'completed' : 'pending';
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get parent payment history with filters' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter payments from this date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter payments until this date (YYYY-MM-DD)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of parent payments',
    type: ParentPaymentsListDto,
  })
  async getPayments(
    @CurrentParent() session: ParentSession,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<ParentPaymentsListDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 10, 50);
    const skip = (pageNum - 1) * limitNum;

    this.logger.debug(
      `Fetching payments for parent ${parentId}, page ${pageNum}`,
    );

    // Build where clause for payments
    const where: {
      tenantId: string;
      deletedAt: null;
      invoice?: { parentId: string };
      paymentDate?: { gte?: Date; lte?: Date };
    } = {
      tenantId,
      deletedAt: null,
      invoice: { parentId },
    };

    // Filter by date range
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) {
        where.paymentDate.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    // Get total count
    const total = await this.prisma.payment.count({ where });

    // Fetch payments
    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      skip,
      take: limitNum,
    });

    // Calculate total outstanding balance
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        status: {
          in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'],
        },
      },
      select: { totalCents: true, amountPaidCents: true },
    });

    const totalOutstanding =
      unpaidInvoices.reduce(
        (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
        0,
      ) / 100;

    const totalPages = Math.ceil(total / limitNum);

    return {
      payments: payments.map((payment) => ({
        id: payment.id,
        paymentDate: payment.paymentDate.toISOString(),
        amount: payment.amountCents / 100,
        reference:
          payment.reference ||
          `PAY-${payment.id.substring(0, 8).toUpperCase()}`,
        method: payment.matchType || 'EFT',
        status: this.mapPaymentStatus(payment.deletedAt, payment.paymentDate),
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      totalOutstanding,
    };
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Get single payment detail with allocations' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment detail with allocations',
    type: ParentPaymentDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentDetail(
    @CurrentParent() session: ParentSession,
    @Param('id') paymentId: string,
  ): Promise<ParentPaymentDetailDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Fetching payment ${paymentId} for parent ${parentId}`);

    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId,
        invoice: { parentId },
      },
      include: {
        invoice: {
          include: {
            child: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Build allocations - for now, a payment is allocated to one invoice
    const allocations = payment.invoice
      ? [
          {
            invoiceId: payment.invoice.id,
            invoiceNumber: payment.invoice.invoiceNumber,
            childName: payment.invoice.child
              ? `${payment.invoice.child.firstName} ${payment.invoice.child.lastName}`
              : undefined,
            allocatedAmount: payment.amountCents / 100,
            invoiceTotal: payment.invoice.totalCents / 100,
          },
        ]
      : [];

    return {
      id: payment.id,
      paymentDate: payment.paymentDate.toISOString(),
      amount: payment.amountCents / 100,
      reference:
        payment.reference || `PAY-${payment.id.substring(0, 8).toUpperCase()}`,
      method: payment.matchType || 'EFT',
      status: this.mapPaymentStatus(payment.deletedAt, payment.paymentDate),
      allocations,
      hasReceipt: false, // TODO: Implement receipt generation
      notes: undefined,
    };
  }

  @Get('payments/:id/receipt')
  @ApiOperation({ summary: 'Download payment receipt PDF' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async downloadPaymentReceipt(
    @CurrentParent() session: ParentSession,
    @Param('id') paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(
      `Downloading receipt for payment ${paymentId}, parent ${parentId}`,
    );

    // Verify payment belongs to this parent
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId,
        invoice: { parentId },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // TODO: Integrate with actual PDF generation service
    res.setHeader('Content-Type', 'application/json');
    res.status(501).json({
      message: 'Receipt generation not yet implemented',
      paymentId: payment.id,
      hint: 'Integration with PDF service pending',
    });
  }

  @Get('bank-details')
  @ApiOperation({ summary: 'Get creche bank details for EFT payments' })
  @ApiResponse({
    status: 200,
    description: 'Creche bank details',
    type: CrecheBankDetailsDto,
  })
  async getBankDetails(
    @CurrentParent() session: ParentSession,
  ): Promise<CrecheBankDetailsDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Fetching bank details for tenant ${tenantId}`);

    // Get tenant info for bank details
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        bankName: true,
        bankAccountNumber: true,
        bankBranchCode: true,
        bankAccountType: true,
        bankSwiftCode: true,
      },
    });

    // Generate a unique payment reference for this parent
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortParentId = parentId.substring(0, 8).toUpperCase();
    const paymentReference = `${shortParentId}-${dateStr}`;

    // If tenant has bank details configured, use them
    // Otherwise, return placeholder values (for demo/development)
    if (tenant?.bankName && tenant?.bankAccountNumber) {
      return {
        bankName: tenant.bankName,
        accountHolderName: tenant.name,
        accountNumber: tenant.bankAccountNumber,
        branchCode: tenant.bankBranchCode || '000000',
        accountType:
          (tenant.bankAccountType as 'Cheque' | 'Savings' | 'Current') ||
          'Cheque',
        swiftCode: tenant.bankSwiftCode || undefined,
        paymentReference,
        paymentInstructions:
          'Please use your unique reference when making payments. Payments may take 1-2 business days to reflect.',
      };
    }

    // Return placeholder bank details for development
    return {
      bankName: 'First National Bank',
      accountHolderName: tenant?.name || 'Little Stars Creche',
      accountNumber: '62123456789',
      branchCode: '250655',
      accountType: 'Cheque',
      paymentReference,
      paymentInstructions:
        'Please use your unique reference when making payments. Payments may take 1-2 business days to reflect.',
    };
  }

  // ============================================================================
  // TASK-PORTAL-016: Parent Portal Profile Endpoints
  // ============================================================================

  @Get('profile')
  @ApiOperation({ summary: 'Get parent profile' })
  @ApiResponse({
    status: 200,
    description: 'Parent profile data',
    type: ParentProfileDto,
  })
  async getProfile(
    @CurrentParent() session: ParentSession,
  ): Promise<ParentProfileDto> {
    const parentId = session.parentId;

    this.logger.debug(`Fetching profile for parent ${parentId}`);

    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Parse preferences from notes if stored there
    let storedPrefs: Record<string, unknown> = {};
    if (parent.notes) {
      const prefsMatch = parent.notes.match(/\[PREFERENCES\]: ({.*})/);
      if (prefsMatch) {
        try {
          storedPrefs = JSON.parse(prefsMatch[1]);
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Map preferred contact to invoice delivery
    let invoiceDelivery: 'email' | 'whatsapp' | 'both' = 'email';
    if (storedPrefs.invoiceDelivery) {
      invoiceDelivery = storedPrefs.invoiceDelivery as
        | 'email'
        | 'whatsapp'
        | 'both';
    } else if (parent.preferredContact === 'WHATSAPP') {
      invoiceDelivery = 'whatsapp';
    } else if (parent.preferredContact === 'BOTH') {
      invoiceDelivery = 'both';
    }

    const communicationPreferences: CommunicationPreferencesDto = {
      invoiceDelivery,
      paymentReminders: (storedPrefs.paymentReminders as boolean) ?? true,
      emailNotifications: (storedPrefs.emailNotifications as boolean) ?? true,
      marketingOptIn: parent.smsOptIn ?? false,
      whatsappOptIn: parent.whatsappOptIn ?? false,
      whatsappConsentTimestamp:
        (storedPrefs.whatsappConsentTimestamp as string) || null,
    };

    // Parse address from address field (stored as JSON string)
    let addressData: Record<string, string> = {};
    if (parent.address) {
      try {
        addressData = JSON.parse(parent.address);
      } catch {
        // If not JSON, treat as street address
        addressData = { street: parent.address };
      }
    }

    return {
      id: parent.id,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email || '',
      phone: parent.phone || undefined,
      alternativePhone: parent.whatsapp || undefined,
      address: {
        street: addressData.street || undefined,
        city: addressData.city || undefined,
        postalCode: addressData.postalCode || undefined,
      },
      communicationPreferences,
      createdAt: parent.createdAt.toISOString(),
    };
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update parent profile' })
  @ApiResponse({
    status: 200,
    description: 'Updated parent profile',
    type: ParentProfileDto,
  })
  async updateProfile(
    @CurrentParent() session: ParentSession,
    @Body() dto: UpdateParentProfileDto,
  ): Promise<ParentProfileDto> {
    const parentId = session.parentId;

    this.logger.debug(`Updating profile for parent ${parentId}`);

    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (dto.firstName) {
      updateData.firstName = dto.firstName;
    }

    if (dto.lastName) {
      updateData.lastName = dto.lastName;
    }

    if (dto.phone !== undefined) {
      updateData.phone = dto.phone || null;
    }

    // Store alternative phone in whatsapp field if provided
    if (dto.alternativePhone !== undefined) {
      updateData.whatsapp = dto.alternativePhone || null;
    }

    // Store address as JSON string in address field
    if (dto.address) {
      const existingAddress = parent.address ? JSON.parse(parent.address) : {};
      updateData.address = JSON.stringify({
        ...existingAddress,
        ...dto.address,
      });
    }

    // Update parent record
    const updatedParent = await this.prisma.parent.update({
      where: { id: parentId },
      data: updateData,
    });

    // Return updated profile
    return this.getProfile(session);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update communication preferences' })
  @ApiResponse({
    status: 200,
    description: 'Updated communication preferences',
    type: CommunicationPreferencesDto,
  })
  async updatePreferences(
    @CurrentParent() session: ParentSession,
    @Body() dto: UpdateCommunicationPreferencesDto,
  ): Promise<CommunicationPreferencesDto> {
    const parentId = session.parentId;

    this.logger.debug(`Updating preferences for parent ${parentId}`);

    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Parse existing notes to get stored preferences
    let storedPrefs: Record<string, unknown> = {};
    if (parent.notes) {
      const prefsMatch = parent.notes.match(/\[PREFERENCES\]: ({.*})/);
      if (prefsMatch) {
        try {
          storedPrefs = JSON.parse(prefsMatch[1]);
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Build updated preferences
    const updateData: {
      whatsappOptIn?: boolean;
      smsOptIn?: boolean;
      preferredContact?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
      notes?: string;
    } = {};

    // Update WhatsApp opt-in
    if (dto.whatsappOptIn !== undefined) {
      updateData.whatsappOptIn = dto.whatsappOptIn;
      if (dto.whatsappOptIn && !storedPrefs.whatsappConsentTimestamp) {
        storedPrefs.whatsappConsentTimestamp = new Date().toISOString();
      } else if (!dto.whatsappOptIn) {
        storedPrefs.whatsappConsentTimestamp = null;
      }
    }

    // Map invoice delivery to preferred contact
    if (dto.invoiceDelivery !== undefined) {
      storedPrefs.invoiceDelivery = dto.invoiceDelivery;
      if (dto.invoiceDelivery === 'whatsapp') {
        updateData.preferredContact = 'WHATSAPP';
      } else if (dto.invoiceDelivery === 'email') {
        updateData.preferredContact = 'EMAIL';
      }
    }

    // Store other preferences in notes
    if (dto.paymentReminders !== undefined) {
      storedPrefs.paymentReminders = dto.paymentReminders;
    }

    if (dto.emailNotifications !== undefined) {
      storedPrefs.emailNotifications = dto.emailNotifications;
    }

    if (dto.marketingOptIn !== undefined) {
      storedPrefs.marketingOptIn = dto.marketingOptIn;
      updateData.smsOptIn = dto.marketingOptIn;
    }

    if (dto.whatsappConsentTimestamp !== undefined) {
      storedPrefs.whatsappConsentTimestamp = dto.whatsappConsentTimestamp;
    }

    // Update notes with preferences JSON
    const prefsJson = JSON.stringify(storedPrefs);
    const notesWithoutPrefs =
      parent.notes?.replace(/\n?\[PREFERENCES\]: {.*}/, '') || '';
    updateData.notes = notesWithoutPrefs
      ? `${notesWithoutPrefs}\n[PREFERENCES]: ${prefsJson}`
      : `[PREFERENCES]: ${prefsJson}`;

    // Update parent record
    await this.prisma.parent.update({
      where: { id: parentId },
      data: updateData,
    });

    // Return updated preferences
    return {
      invoiceDelivery:
        (storedPrefs.invoiceDelivery as 'email' | 'whatsapp' | 'both') ||
        'email',
      paymentReminders: (storedPrefs.paymentReminders as boolean) ?? true,
      emailNotifications: (storedPrefs.emailNotifications as boolean) ?? true,
      marketingOptIn: (storedPrefs.marketingOptIn as boolean) ?? false,
      whatsappOptIn: dto.whatsappOptIn ?? parent.whatsappOptIn ?? false,
      whatsappConsentTimestamp:
        (storedPrefs.whatsappConsentTimestamp as string) || null,
    };
  }

  @Get('children')
  @ApiOperation({ summary: "Get parent's enrolled children" })
  @ApiResponse({
    status: 200,
    description: 'List of enrolled children',
    type: [ParentChildDto],
  })
  async getChildren(
    @CurrentParent() session: ParentSession,
  ): Promise<ParentChildDto[]> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Fetching children for parent ${parentId}`);

    const children = await this.prisma.child.findMany({
      where: {
        parentId,
        tenantId,
        deletedAt: null,
      },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { firstName: 'asc' },
    });

    return children.map((child) => {
      const latestEnrollment = (
        child as typeof child & { enrollments: Array<{ startDate: Date }> }
      ).enrollments?.[0];

      return {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        dateOfBirth: child.dateOfBirth?.toISOString() || undefined,
        enrollmentDate:
          latestEnrollment?.startDate?.toISOString() ||
          child.createdAt?.toISOString() ||
          undefined,
        className: undefined, // Not stored in schema, would need Class relation
        attendanceType: undefined, // Not stored in schema, would need FeeStructure relation
        isActive: child.isActive,
        photoUrl: null, // Photos not stored in current schema
      };
    });
  }

  @Post('delete-request')
  @ApiOperation({ summary: 'Request account deletion' })
  @ApiResponse({
    status: 200,
    description: 'Deletion request submitted',
    type: DeleteAccountResponseDto,
  })
  async requestAccountDeletion(
    @CurrentParent() session: ParentSession,
    @Body() dto: DeleteAccountRequestDto,
  ): Promise<DeleteAccountResponseDto> {
    const parentId = session.parentId;
    const tenantId = session.tenantId;

    this.logger.debug(`Account deletion request from parent ${parentId}`);

    // Check for outstanding balance
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        parentId,
        tenantId,
        isDeleted: false,
        status: {
          in: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'],
        },
      },
      select: { totalCents: true, amountPaidCents: true },
    });

    const outstandingBalance = unpaidInvoices.reduce(
      (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
      0,
    );

    if (outstandingBalance > 0) {
      this.logger.warn(
        `Account deletion request blocked: parent ${parentId} has outstanding balance of ${outstandingBalance / 100}`,
      );
    }

    // Store deletion request in parent metadata
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    const requestId =
      `DEL-${Date.now()}-${parentId.substring(0, 8)}`.toUpperCase();

    // Store deletion request in notes field (temporary solution)
    // In production, this should be a separate DeletionRequest model
    const deletionInfo = JSON.stringify({
      requestId,
      requestedAt: new Date().toISOString(),
      reason: dto.reason || null,
      outstandingBalance: outstandingBalance / 100,
      status: outstandingBalance > 0 ? 'pending_balance' : 'pending_review',
    });

    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        notes: parent.notes
          ? `${parent.notes}\n\n[DELETION_REQUEST]: ${deletionInfo}`
          : `[DELETION_REQUEST]: ${deletionInfo}`,
      },
    });

    // TODO: Send confirmation email to parent
    // TODO: Notify admin of deletion request
    // TODO: Create proper DeletionRequest model in future iteration

    return {
      message:
        outstandingBalance > 0
          ? 'Your account deletion request has been submitted. Please note that your outstanding balance must be cleared before the account can be deleted.'
          : 'Your account deletion request has been submitted. You will receive confirmation via email once processed.',
      requestId,
    };
  }
}
