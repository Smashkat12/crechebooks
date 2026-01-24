/**
 * Supplier Management Service
 * TASK-ACCT-013: Supplier Management Foundation
 *
 * @module database/services/supplier
 * @description Manages suppliers and accounts payable (AP).
 * Handles supplier CRUD, bill creation, payment tracking, and payables summary.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Never allow overpayment on bills.
 * CRITICAL: Never store unmasked bank account numbers in logs.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { Supplier, SupplierBill, SupplierBillPayment, BillStatus, VatType } from '@prisma/client';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateSupplierBillDto,
  RecordBillPaymentDto,
} from '../dto/supplier.dto';

// SA VAT rate (15%)
const SA_VAT_RATE = 0.15;

@Injectable()
export class SupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
  ) {}

  /**
   * Create a new supplier
   */
  async createSupplier(
    tenantId: string,
    userId: string,
    data: CreateSupplierDto,
  ): Promise<Supplier> {
    // Check for duplicate supplier name
    const existing = await this.prisma.supplier.findFirst({
      where: { tenantId, name: data.name },
    });

    if (existing) {
      throw new ConflictException(`Supplier with name "${data.name}" already exists`);
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        tenantId,
        name: data.name,
        tradingName: data.tradingName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        vatNumber: data.vatNumber,
        registrationNumber: data.registrationNumber,
        paymentTermsDays: data.paymentTermsDays ?? 30,
        bankName: data.bankName,
        branchCode: data.branchCode,
        accountNumber: data.accountNumber,
        accountType: data.accountType,
        defaultAccountId: data.defaultAccountId,
      },
    });

    // Audit log - mask bank account number
    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'Supplier',
      entityId: supplier.id,
      afterValue: {
        id: supplier.id,
        name: supplier.name,
        email: supplier.email,
        vatNumber: supplier.vatNumber,
        paymentTermsDays: supplier.paymentTermsDays,
        // Mask account number for security
        accountNumber: data.accountNumber ? `****${data.accountNumber.slice(-4)}` : null,
      },
    });

    return supplier;
  }

  /**
   * Update an existing supplier
   */
  async updateSupplier(
    tenantId: string,
    userId: string,
    supplierId: string,
    data: UpdateSupplierDto,
  ): Promise<Supplier> {
    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Supplier not found`);
    }

    // Check for duplicate name if changing
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.prisma.supplier.findFirst({
        where: { tenantId, name: data.name, id: { not: supplierId } },
      });
      if (duplicate) {
        throw new ConflictException(`Supplier with name "${data.name}" already exists`);
      }
    }

    const supplier = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        name: data.name,
        tradingName: data.tradingName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        vatNumber: data.vatNumber,
        registrationNumber: data.registrationNumber,
        paymentTermsDays: data.paymentTermsDays,
        bankName: data.bankName,
        branchCode: data.branchCode,
        accountNumber: data.accountNumber,
        accountType: data.accountType,
        defaultAccountId: data.defaultAccountId,
        isActive: data.isActive,
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Supplier',
      entityId: supplier.id,
      beforeValue: {
        name: existing.name,
        email: existing.email,
        isActive: existing.isActive,
      },
      afterValue: {
        name: supplier.name,
        email: supplier.email,
        isActive: supplier.isActive,
      },
    });

    return supplier;
  }

  /**
   * Get a supplier by ID
   */
  async getSupplierById(tenantId: string, supplierId: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  /**
   * List all suppliers for a tenant
   */
  async listSuppliers(
    tenantId: string,
    options?: {
      isActive?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ suppliers: Supplier[]; total: number }> {
    const where = {
      tenantId,
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' as const } },
          { tradingName: { contains: options.search, mode: 'insensitive' as const } },
          { email: { contains: options.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { suppliers, total };
  }

  /**
   * Deactivate a supplier (soft delete)
   */
  async deactivateSupplier(
    tenantId: string,
    userId: string,
    supplierId: string,
  ): Promise<Supplier> {
    const supplier = await this.getSupplierById(tenantId, supplierId);

    // Check for unpaid bills
    const unpaidBills = await this.prisma.supplierBill.count({
      where: {
        supplierId,
        tenantId,
        status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
    });

    if (unpaidBills > 0) {
      throw new BadRequestException(
        `Cannot deactivate supplier with ${unpaidBills} unpaid bill(s)`,
      );
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Supplier',
      entityId: supplierId,
      beforeValue: { isActive: true },
      afterValue: { isActive: false, reason: 'Deactivated by user' },
    });

    return updated;
  }

  /**
   * Create a supplier bill with line items
   */
  async createBill(
    tenantId: string,
    userId: string,
    data: CreateSupplierBillDto,
  ): Promise<SupplierBill> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (!supplier.isActive) {
      throw new BadRequestException('Cannot create bill for inactive supplier');
    }

    // Check for duplicate bill number
    const existingBill = await this.prisma.supplierBill.findFirst({
      where: {
        tenantId,
        supplierId: data.supplierId,
        billNumber: data.billNumber,
      },
    });

    if (existingBill) {
      throw new ConflictException(
        `Bill number "${data.billNumber}" already exists for this supplier`,
      );
    }

    // Calculate totals
    const subtotalCents = data.lines.reduce(
      (sum, line) => sum + line.unitPriceCents * (line.quantity ?? 1),
      0,
    );

    const vatAmountCents = data.lines.reduce((sum, line) => {
      const lineTotal = line.unitPriceCents * (line.quantity ?? 1);
      const vatType = line.vatType || 'STANDARD';
      if (vatType === 'STANDARD') {
        return sum + Math.round(lineTotal * SA_VAT_RATE);
      }
      return sum;
    }, 0);

    const totalCents = subtotalCents + vatAmountCents;

    // Calculate due date from payment terms if not provided
    const billDate = new Date(data.billDate);
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : new Date(billDate.getTime() + supplier.paymentTermsDays * 24 * 60 * 60 * 1000);

    const bill = await this.prisma.supplierBill.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        billNumber: data.billNumber,
        billDate,
        dueDate,
        subtotalCents,
        vatAmountCents,
        totalCents,
        balanceDueCents: totalCents,
        purchaseOrderRef: data.purchaseOrderRef,
        notes: data.notes,
        attachmentUrl: data.attachmentUrl,
        createdById: userId,
        status: 'AWAITING_PAYMENT',
        lines: {
          create: data.lines.map((line, index) => ({
            lineNumber: index + 1,
            description: line.description,
            quantity: line.quantity ?? 1,
            unitPriceCents: line.unitPriceCents,
            lineTotalCents: line.unitPriceCents * (line.quantity ?? 1),
            vatType: (line.vatType as VatType) ?? 'STANDARD',
            accountId: line.accountId ?? supplier.defaultAccountId,
          })),
        },
      },
      include: { lines: true, supplier: true },
    });

    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'SupplierBill',
      entityId: bill.id,
      afterValue: {
        billNumber: bill.billNumber,
        supplierId: bill.supplierId,
        supplierName: supplier.name,
        totalCents: bill.totalCents,
        dueDate: bill.dueDate.toISOString(),
      },
    });

    return bill;
  }

  /**
   * Get a bill by ID
   */
  async getBillById(
    tenantId: string,
    billId: string,
  ): Promise<SupplierBill & { lines: any[]; supplier: Supplier; payments: any[] }> {
    const bill = await this.prisma.supplierBill.findFirst({
      where: { id: billId, tenantId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        supplier: true,
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  /**
   * List bills for a tenant
   */
  async listBills(
    tenantId: string,
    options?: {
      supplierId?: string;
      status?: BillStatus | BillStatus[];
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ bills: SupplierBill[]; total: number }> {
    const statusArray = options?.status
      ? Array.isArray(options.status)
        ? options.status
        : [options.status]
      : undefined;

    const where = {
      tenantId,
      ...(options?.supplierId && { supplierId: options.supplierId }),
      ...(statusArray && { status: { in: statusArray } }),
      ...(options?.fromDate && { billDate: { gte: options.fromDate } }),
      ...(options?.toDate && { billDate: { lte: options.toDate } }),
    };

    const [bills, total] = await Promise.all([
      this.prisma.supplierBill.findMany({
        where,
        include: { supplier: true },
        orderBy: { dueDate: 'asc' },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      this.prisma.supplierBill.count({ where }),
    ]);

    return { bills, total };
  }

  /**
   * Record a payment against a bill
   */
  async recordBillPayment(
    tenantId: string,
    userId: string,
    billId: string,
    data: RecordBillPaymentDto,
  ): Promise<SupplierBillPayment> {
    const bill = await this.prisma.supplierBill.findFirst({
      where: { id: billId, tenantId },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    if (bill.status === 'PAID') {
      throw new BadRequestException('Bill is already fully paid');
    }

    if (bill.status === 'VOID') {
      throw new BadRequestException('Cannot record payment for voided bill');
    }

    if (data.amountCents > bill.balanceDueCents) {
      throw new BadRequestException(
        `Payment amount (${data.amountCents}) exceeds balance due (${bill.balanceDueCents})`,
      );
    }

    const paymentDate = new Date(data.paymentDate);

    const payment = await this.prisma.supplierBillPayment.create({
      data: {
        tenantId,
        billId,
        amountCents: data.amountCents,
        paymentDate,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        transactionId: data.transactionId,
      },
    });

    // Update bill balance and status
    const newBalance = bill.balanceDueCents - data.amountCents;
    const newPaidCents = bill.paidCents + data.amountCents;

    let newStatus: BillStatus = bill.status;
    if (newBalance === 0) {
      newStatus = 'PAID';
    } else if (newPaidCents > 0) {
      newStatus = 'PARTIALLY_PAID';
    }

    await this.prisma.supplierBill.update({
      where: { id: billId },
      data: {
        balanceDueCents: newBalance,
        paidCents: newPaidCents,
        status: newStatus,
        paidDate: newStatus === 'PAID' ? paymentDate : null,
      },
    });

    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'SupplierBillPayment',
      entityId: payment.id,
      afterValue: {
        billId,
        amountCents: data.amountCents,
        paymentMethod: data.paymentMethod,
        newBalance,
        newStatus,
      },
    });

    return payment;
  }

  /**
   * Void a bill (must have no payments)
   */
  async voidBill(tenantId: string, userId: string, billId: string): Promise<SupplierBill> {
    const bill = await this.prisma.supplierBill.findFirst({
      where: { id: billId, tenantId },
      include: { payments: true },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    if (bill.payments.length > 0) {
      throw new BadRequestException('Cannot void bill with existing payments');
    }

    if (bill.status === 'VOID') {
      throw new BadRequestException('Bill is already voided');
    }

    const updated = await this.prisma.supplierBill.update({
      where: { id: billId },
      data: {
        status: 'VOID',
        balanceDueCents: 0,
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'SupplierBill',
      entityId: billId,
      beforeValue: { status: bill.status },
      afterValue: { status: 'VOID', reason: 'Voided by user' },
    });

    return updated;
  }

  /**
   * Get accounts payable summary for dashboard
   */
  async getPayablesSummary(tenantId: string): Promise<{
    totalDueCents: number;
    overdueCents: number;
    dueThisWeekCents: number;
    dueThisMonthCents: number;
    supplierCount: number;
    billCount: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const bills = await this.prisma.supplierBill.findMany({
      where: {
        tenantId,
        status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: {
        balanceDueCents: true,
        dueDate: true,
        supplierId: true,
      },
    });

    const totalDueCents = bills.reduce((sum, b) => sum + b.balanceDueCents, 0);

    const overdueCents = bills
      .filter((b) => b.dueDate < today)
      .reduce((sum, b) => sum + b.balanceDueCents, 0);

    const dueThisWeekCents = bills
      .filter((b) => b.dueDate >= today && b.dueDate <= weekFromNow)
      .reduce((sum, b) => sum + b.balanceDueCents, 0);

    const dueThisMonthCents = bills
      .filter((b) => b.dueDate >= today && b.dueDate <= monthFromNow)
      .reduce((sum, b) => sum + b.balanceDueCents, 0);

    const supplierCount = new Set(bills.map((b) => b.supplierId)).size;

    return {
      totalDueCents,
      overdueCents,
      dueThisWeekCents,
      dueThisMonthCents,
      supplierCount,
      billCount: bills.length,
    };
  }

  /**
   * Get supplier statement (all transactions)
   */
  async getSupplierStatement(
    tenantId: string,
    supplierId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    supplier: Supplier;
    openingBalanceCents: number;
    transactions: Array<{
      date: Date;
      type: 'BILL' | 'PAYMENT';
      reference: string;
      description: string;
      debitCents: number;
      creditCents: number;
      balanceCents: number;
    }>;
    closingBalanceCents: number;
  }> {
    const supplier = await this.getSupplierById(tenantId, supplierId);

    // Get opening balance (sum of unpaid bills before fromDate)
    const openingBills = await this.prisma.supplierBill.findMany({
      where: {
        supplierId,
        tenantId,
        billDate: { lt: fromDate },
        status: { not: 'VOID' },
      },
      select: { balanceDueCents: true },
    });

    const openingBalanceCents = openingBills.reduce((sum, b) => sum + b.balanceDueCents, 0);

    // Get bills in period
    const bills = await this.prisma.supplierBill.findMany({
      where: {
        supplierId,
        tenantId,
        billDate: { gte: fromDate, lte: toDate },
        status: { not: 'VOID' },
      },
      orderBy: { billDate: 'asc' },
    });

    // Get payments in period
    const payments = await this.prisma.supplierBillPayment.findMany({
      where: {
        tenantId,
        bill: { supplierId },
        paymentDate: { gte: fromDate, lte: toDate },
      },
      include: { bill: true },
      orderBy: { paymentDate: 'asc' },
    });

    // Combine and sort transactions
    const transactions: Array<{
      date: Date;
      type: 'BILL' | 'PAYMENT';
      reference: string;
      description: string;
      debitCents: number;
      creditCents: number;
      balanceCents: number;
    }> = [];

    for (const bill of bills) {
      transactions.push({
        date: bill.billDate,
        type: 'BILL',
        reference: bill.billNumber,
        description: `Bill - ${bill.billNumber}`,
        debitCents: bill.totalCents,
        creditCents: 0,
        balanceCents: 0, // Will calculate below
      });
    }

    for (const payment of payments) {
      transactions.push({
        date: payment.paymentDate,
        type: 'PAYMENT',
        reference: payment.reference || payment.id,
        description: `Payment - ${payment.paymentMethod}`,
        debitCents: 0,
        creditCents: payment.amountCents,
        balanceCents: 0,
      });
    }

    // Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running balance
    let runningBalance = openingBalanceCents;
    for (const tx of transactions) {
      runningBalance = runningBalance + tx.debitCents - tx.creditCents;
      tx.balanceCents = runningBalance;
    }

    return {
      supplier,
      openingBalanceCents,
      transactions,
      closingBalanceCents: runningBalance,
    };
  }

  /**
   * Link a bank transaction to a supplier
   */
  async linkTransactionToSupplier(
    tenantId: string,
    userId: string,
    transactionId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { supplierId },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Transaction',
      entityId: transactionId,
      beforeValue: { supplierId: transaction.supplierId },
      afterValue: { supplierId, supplierName: supplier.name },
    });
  }

  /**
   * Update overdue bills status (to be run by scheduler)
   */
  async updateOverdueBills(tenantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.supplierBill.updateMany({
      where: {
        tenantId,
        status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: today },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
