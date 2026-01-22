import {
  Controller,
  Get,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import type { ParentSession } from '../auth/decorators/current-parent.decorator';
import { CurrentParent } from '../auth/decorators/current-parent.decorator';
import { ParentDashboardDto } from './dto/parent-dashboard.dto';
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
}
