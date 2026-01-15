/**
 * Payment Allocation Service
 * TASK-PAY-012: Payment Allocation Service
 *
 * @module database/services/payment-allocation
 * @description Service for allocating bank transaction payments to invoices.
 * Handles exact matches, partial payments, overpayments, and multi-invoice allocations.
 * All amounts are in CENTS as integers. Uses Decimal.js for precise calculations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Payment, Invoice, InvoiceStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentRepository } from '../repositories/payment.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { AuditLogService } from './audit-log.service';
import { CreditBalanceService } from './credit-balance.service';
import { XeroSyncService } from './xero-sync.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { MatchType, MatchedBy } from '../entities/payment.entity';
import { AuditAction } from '../entities/audit-log.entity';
import {
  AllocatePaymentDto,
  AllocationDto,
  ReverseAllocationDto,
  AllocationResult,
  XeroSyncStatus,
  AllocationError,
  SuggestedAllocationResult,
  AllocateTransactionInput,
} from '../dto/payment-allocation.dto';

@Injectable()
export class PaymentAllocationService {
  private readonly logger = new Logger(PaymentAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly parentRepo: ParentRepository,
    private readonly auditLogService: AuditLogService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  /**
   * Allocate a transaction payment to one or more invoices
   * @param dto - Allocation request with transaction ID and invoice allocations
   * @returns AllocationResult with created payments and affected invoices
   * @throws NotFoundException if transaction not found
   * @throws BusinessException if transaction is not a credit or allocations are invalid
   */
  async allocatePayment(dto: AllocatePaymentDto): Promise<AllocationResult> {
    this.logger.log(
      `Allocating payment from transaction ${dto.transactionId} to ${dto.allocations.length} invoice(s)`,
    );

    // 1. Get transaction by ID with tenant validation
    const transaction = await this.transactionRepo.findById(
      dto.tenantId,
      dto.transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', dto.transactionId);
    }

    // 2. Validate transaction is a credit (isCredit === true)
    if (!transaction.isCredit) {
      throw new BusinessException(
        'Transaction must be a credit (incoming payment) to allocate to invoices',
        'TRANSACTION_NOT_CREDIT',
        {
          transactionId: dto.transactionId,
          isCredit: transaction.isCredit,
        },
      );
    }

    // 2a. Check if transaction has already been fully allocated
    const existingPayments = await this.paymentRepo.findByTenantId(
      dto.tenantId,
      { transactionId: dto.transactionId },
    );
    const totalAlreadyAllocated = existingPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0,
    );
    if (totalAlreadyAllocated >= transaction.amountCents) {
      throw new BusinessException(
        'Transaction has already been fully allocated',
        'TRANSACTION_ALREADY_ALLOCATED',
        {
          transactionId: dto.transactionId,
          transactionAmount: transaction.amountCents,
          alreadyAllocated: totalAlreadyAllocated,
        },
      );
    }

    // 3. Validate total allocations <= transaction amount
    this.validateAllocations(transaction.amountCents, dto.allocations);

    // 4. Call allocateToMultipleInvoices if multiple allocations
    if (dto.allocations.length > 1) {
      return this.allocateToMultipleInvoices(dto);
    }

    // 5. For single allocation: determine if exact, partial, or overpayment
    const allocation = dto.allocations[0];
    const invoice = await this.invoiceRepo.findById(
      allocation.invoiceId,
      dto.tenantId,
    );
    if (!invoice) {
      throw new NotFoundException('Invoice', allocation.invoiceId);
    }

    // Check if invoice is already fully paid
    const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
    if (outstandingCents <= 0 || invoice.status === 'PAID') {
      throw new BusinessException(
        'Invoice is already fully paid',
        'INVOICE_ALREADY_PAID',
        {
          invoiceId: allocation.invoiceId,
          status: invoice.status,
          amountPaid: invoice.amountPaidCents,
          total: invoice.totalCents,
        },
      );
    }
    const allocationAmount = new Decimal(allocation.amountCents);
    const outstanding = new Decimal(outstandingCents);

    let payment: Payment;

    if (allocationAmount.gt(outstanding)) {
      // Overpayment
      payment = await this.handleOverpayment(
        dto.transactionId,
        allocation.invoiceId,
        allocation.amountCents,
        dto.tenantId,
        dto.userId,
      );
    } else if (allocationAmount.lt(outstanding)) {
      // Partial payment
      payment = await this.handlePartialPayment(
        dto.transactionId,
        allocation.invoiceId,
        allocation.amountCents,
        dto.tenantId,
        dto.userId,
      );
    } else {
      // Exact match
      payment = await this.paymentRepo.create({
        tenantId: dto.tenantId,
        transactionId: dto.transactionId,
        invoiceId: allocation.invoiceId,
        amountCents: allocation.amountCents,
        paymentDate: transaction.date,
        reference: transaction.reference ?? undefined,
        matchType: MatchType.EXACT,
        matchedBy: dto.userId ? MatchedBy.USER : MatchedBy.AI_AUTO,
        matchConfidence: dto.userId ? undefined : 1.0,
      });

      // 7. Update invoice via invoiceRepo.recordPayment() - status auto-set
      await this.invoiceRepo.recordPayment(
        allocation.invoiceId,
        dto.tenantId,
        allocation.amountCents,
      );
    }

    // 8. Sync to Xero (TASK-XERO-003: Real implementation)
    const xeroSyncStatus = await this.syncToXero(payment, invoice);

    // 9. Create audit log entry
    await this.auditLogService.logAction({
      tenantId: dto.tenantId,
      userId: dto.userId,
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.CREATE,
      afterValue: {
        transactionId: dto.transactionId,
        invoiceId: allocation.invoiceId,
        amountCents: allocation.amountCents,
        matchType: payment.matchType,
        matchedBy: payment.matchedBy,
      },
      changeSummary: `Allocated ${allocation.amountCents} cents from transaction ${dto.transactionId} to invoice ${allocation.invoiceId}`,
    });

    // 10. Return AllocationResult
    const totalAllocated = new Decimal(allocation.amountCents);
    const transactionAmount = new Decimal(transaction.amountCents);
    const unallocatedAmountCents = transactionAmount
      .minus(totalAllocated)
      .toNumber();

    return {
      payments: [payment],
      invoicesUpdated: [allocation.invoiceId],
      unallocatedAmountCents,
      xeroSyncStatus,
      errors: [],
    };
  }

  /**
   * Allocate a single transaction to multiple invoices atomically
   * @param dto - Allocation request with multiple invoice allocations
   * @returns AllocationResult with created payments and affected invoices
   * @throws BusinessException if any invoice validation fails
   */
  async allocateToMultipleInvoices(
    dto: AllocatePaymentDto,
  ): Promise<AllocationResult> {
    this.logger.log(
      `Allocating transaction ${dto.transactionId} to ${dto.allocations.length} invoices`,
    );

    const createdPayments: Payment[] = [];
    const invoicesUpdated: string[] = [];
    const errors: AllocationError[] = [];

    // 1. Use prisma.$transaction for atomicity
    try {
      await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.findFirst({
          where: { id: dto.transactionId, tenantId: dto.tenantId },
        });

        if (!transaction) {
          throw new NotFoundException('Transaction', dto.transactionId);
        }

        // 2. For each allocation
        for (const allocation of dto.allocations) {
          // Verify invoice exists and belongs to tenant
          const invoice = await tx.invoice.findUnique({
            where: { id: allocation.invoiceId },
          });

          if (!invoice) {
            errors.push({
              invoiceId: allocation.invoiceId,
              reason: 'Invoice not found',
              code: 'INVOICE_NOT_FOUND',
            });
            throw new NotFoundException('Invoice', allocation.invoiceId);
          }

          if (invoice.tenantId !== dto.tenantId) {
            errors.push({
              invoiceId: allocation.invoiceId,
              reason: 'Invoice does not belong to tenant',
              code: 'TENANT_MISMATCH',
            });
            throw new BusinessException(
              'Invoice does not belong to the specified tenant',
              'TENANT_MISMATCH',
              {
                invoiceTenantId: invoice.tenantId,
                requestTenantId: dto.tenantId,
              },
            );
          }

          // Check if invoice is already fully paid
          const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
          if (outstandingCents <= 0 || invoice.status === 'PAID') {
            errors.push({
              invoiceId: allocation.invoiceId,
              reason: 'Invoice is already fully paid',
              code: 'INVOICE_ALREADY_PAID',
            });
            throw new BusinessException(
              'Invoice is already fully paid',
              'INVOICE_ALREADY_PAID',
              {
                invoiceId: allocation.invoiceId,
                status: invoice.status,
                amountPaid: invoice.amountPaidCents,
                total: invoice.totalCents,
              },
            );
          }
          const allocationAmount = new Decimal(allocation.amountCents);
          const outstanding = new Decimal(outstandingCents);

          let matchType: MatchType;
          if (allocationAmount.gt(outstanding)) {
            matchType = MatchType.OVERPAYMENT;
          } else if (allocationAmount.lt(outstanding)) {
            matchType = MatchType.PARTIAL;
          } else {
            matchType = MatchType.EXACT;
          }

          // Create payment record
          const payment = await tx.payment.create({
            data: {
              tenantId: dto.tenantId,
              transactionId: dto.transactionId,
              invoiceId: allocation.invoiceId,
              amountCents: allocation.amountCents,
              paymentDate: transaction.date,
              reference: transaction.reference ?? null,
              matchType,
              matchedBy: dto.userId ? MatchedBy.USER : MatchedBy.AI_AUTO,
              matchConfidence: dto.userId ? null : 1.0,
            },
          });

          createdPayments.push(payment);

          // Update invoice via recordPayment logic within transaction
          const newAmountPaid =
            invoice.amountPaidCents + allocation.amountCents;
          let newStatus: InvoiceStatus = invoice.status;

          if (newAmountPaid >= invoice.totalCents) {
            newStatus = InvoiceStatus.PAID;
          } else if (newAmountPaid > 0) {
            newStatus = InvoiceStatus.PARTIALLY_PAID;
          }

          await tx.invoice.update({
            where: { id: allocation.invoiceId },
            data: {
              amountPaidCents: newAmountPaid,
              status: newStatus,
            },
          });

          invoicesUpdated.push(allocation.invoiceId);
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to allocate payment to multiple invoices`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    // 3. Aggregate results
    const totalAllocated = dto.allocations.reduce(
      (sum, alloc) => sum.plus(alloc.amountCents),
      new Decimal(0),
    );

    const transaction = await this.transactionRepo.findById(
      dto.tenantId,
      dto.transactionId,
    );
    const transactionAmount = new Decimal(transaction!.amountCents);
    const unallocatedAmountCents = transactionAmount
      .minus(totalAllocated)
      .toNumber();

    // Sync all payments to Xero (TASK-XERO-003: Real implementation)
    let xeroSyncStatus = XeroSyncStatus.SKIPPED;
    for (const payment of createdPayments) {
      const invoice = await this.invoiceRepo.findById(
        payment.invoiceId,
        dto.tenantId,
      );
      if (invoice) {
        const status = await this.syncToXero(payment, invoice);
        // Use the most significant status (SUCCESS > FAILED > SKIPPED)
        if (status === XeroSyncStatus.SUCCESS) {
          xeroSyncStatus = XeroSyncStatus.SUCCESS;
        } else if (
          status === XeroSyncStatus.FAILED &&
          xeroSyncStatus !== XeroSyncStatus.SUCCESS
        ) {
          xeroSyncStatus = XeroSyncStatus.FAILED;
        }
      }
    }

    // 4. Audit log each allocation
    for (const payment of createdPayments) {
      await this.auditLogService.logAction({
        tenantId: dto.tenantId,
        userId: dto.userId,
        entityType: 'Payment',
        entityId: payment.id,
        action: AuditAction.CREATE,
        afterValue: {
          transactionId: payment.transactionId,
          invoiceId: payment.invoiceId,
          amountCents: payment.amountCents,
          matchType: payment.matchType,
          matchedBy: payment.matchedBy,
        },
        changeSummary: `Multi-invoice allocation: ${payment.amountCents} cents to invoice ${payment.invoiceId}`,
      });
    }

    return {
      payments: createdPayments,
      invoicesUpdated,
      unallocatedAmountCents,
      xeroSyncStatus,
      errors,
    };
  }

  /**
   * Handle overpayment allocation (payment amount > invoice outstanding)
   * Creates payment for OUTSTANDING amount only, logs overpayment for future credit balance
   * @param transactionId - Bank transaction ID
   * @param invoiceId - Invoice to allocate to
   * @param overpaymentAmountCents - Total payment amount (exceeds outstanding)
   * @param tenantId - Tenant ID
   * @param userId - User ID performing allocation (optional)
   * @returns Created payment record
   * @throws NotFoundException if transaction or invoice not found
   */
  async handleOverpayment(
    transactionId: string,
    invoiceId: string,
    overpaymentAmountCents: number,
    tenantId: string,
    userId?: string,
  ): Promise<Payment> {
    this.logger.log(
      `Handling overpayment for invoice ${invoiceId}: ${overpaymentAmountCents} cents`,
    );

    // 1. Get invoice, calculate outstanding
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new NotFoundException('Invoice', invoiceId);
    }

    const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
    const overpaymentDecimal = new Decimal(overpaymentAmountCents);
    const outstandingDecimal = new Decimal(outstandingCents);

    if (overpaymentDecimal.lte(outstandingDecimal)) {
      throw new BusinessException(
        'handleOverpayment called but payment does not exceed outstanding amount',
        'INVALID_OVERPAYMENT',
        {
          paymentAmount: overpaymentAmountCents,
          outstanding: outstandingCents,
        },
      );
    }

    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // 2. Create payment for OUTSTANDING amount only (not overpayment)
    const payment = await this.paymentRepo.create({
      tenantId,
      transactionId,
      invoiceId,
      amountCents: outstandingCents, // Only outstanding, not full overpayment
      paymentDate: transaction.date,
      reference: transaction.reference ?? undefined,
      matchType: MatchType.OVERPAYMENT,
      matchedBy: userId ? MatchedBy.USER : MatchedBy.AI_AUTO,
      matchConfidence: userId ? undefined : 0.9, // Slightly lower confidence for overpayments
    });

    // 4. Create credit balance for overpayment (TASK-PAY-018)
    const excessAmountCents = overpaymentDecimal
      .minus(outstandingDecimal)
      .toNumber();

    if (excessAmountCents > 0) {
      await this.creditBalanceService.createFromOverpayment(
        tenantId,
        invoice.parentId,
        payment.id,
        excessAmountCents,
        userId,
      );
      this.logger.log(
        `Created credit balance of R${(excessAmountCents / 100).toFixed(2)} for parent ${invoice.parentId} from overpayment on invoice ${invoiceId}`,
      );
    }

    // 5. Update invoice to PAID via recordPayment()
    await this.invoiceRepo.recordPayment(invoiceId, tenantId, outstandingCents);

    return payment;
  }

  /**
   * Handle partial payment allocation (payment amount < invoice outstanding)
   * @param transactionId - Bank transaction ID
   * @param invoiceId - Invoice to allocate to
   * @param partialAmountCents - Payment amount (less than outstanding)
   * @param tenantId - Tenant ID
   * @param userId - User ID performing allocation (optional)
   * @returns Created payment record
   * @throws NotFoundException if transaction or invoice not found
   * @throws BusinessException if amount exceeds outstanding
   */
  async handlePartialPayment(
    transactionId: string,
    invoiceId: string,
    partialAmountCents: number,
    tenantId: string,
    userId?: string,
  ): Promise<Payment> {
    this.logger.log(
      `Handling partial payment for invoice ${invoiceId}: ${partialAmountCents} cents`,
    );

    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new NotFoundException('Invoice', invoiceId);
    }

    const outstandingCents = invoice.totalCents - invoice.amountPaidCents;

    // 1. Validate partialAmount <= outstanding
    if (partialAmountCents > outstandingCents) {
      throw new BusinessException(
        'Partial payment amount exceeds outstanding invoice amount',
        'AMOUNT_EXCEEDS_OUTSTANDING',
        {
          partialAmount: partialAmountCents,
          outstanding: outstandingCents,
        },
      );
    }

    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // 2. Create payment for partial amount
    const payment = await this.paymentRepo.create({
      tenantId,
      transactionId,
      invoiceId,
      amountCents: partialAmountCents,
      paymentDate: transaction.date,
      reference: transaction.reference ?? undefined,
      matchType: MatchType.PARTIAL,
      matchedBy: userId ? MatchedBy.USER : MatchedBy.AI_AUTO,
      matchConfidence: userId ? undefined : 0.95,
    });

    // 4. Update invoice via recordPayment() - status auto-set to PARTIALLY_PAID
    await this.invoiceRepo.recordPayment(
      invoiceId,
      tenantId,
      partialAmountCents,
    );

    return payment;
  }

  /**
   * Reverse a payment allocation
   * Marks payment as reversed and reverts the invoice amount
   * @param dto - Reversal request with payment ID and reason
   * @returns Updated payment record
   * @throws NotFoundException if payment not found
   * @throws BusinessException if payment already reversed
   */
  async reverseAllocation(dto: ReverseAllocationDto): Promise<Payment> {
    this.logger.log(`Reversing payment allocation ${dto.paymentId}`);

    // 1. Get payment by ID with tenant validation
    const payment = await this.paymentRepo.findById(
      dto.paymentId,
      dto.tenantId,
    );
    if (!payment) {
      throw new NotFoundException('Payment', dto.paymentId);
    }

    // 2. Validate payment.isReversed === false
    if (payment.isReversed) {
      throw new BusinessException(
        'Payment has already been reversed',
        'PAYMENT_ALREADY_REVERSED',
        {
          paymentId: dto.paymentId,
          reversedAt: payment.reversedAt,
          reversalReason: payment.reversalReason,
        },
      );
    }

    const beforeValue = { ...payment };

    // 3. Reverse payment using PaymentRepository.reverse() method
    const reversedPayment = await this.paymentRepo.reverse(
      dto.paymentId,
      dto.tenantId,
      {
        reversalReason: dto.reason,
      },
    );

    // 4. Revert invoice amount: invoiceRepo.recordPayment(id, -payment.amountCents)
    await this.invoiceRepo.recordPayment(
      payment.invoiceId,
      dto.tenantId,
      -payment.amountCents,
    );

    // 5. Audit log the reversal
    await this.auditLogService.logAction({
      tenantId: dto.tenantId,
      userId: dto.userId,
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.UPDATE,
      beforeValue: {
        isReversed: beforeValue.isReversed,
        reversedAt: beforeValue.reversedAt,
        reversalReason: beforeValue.reversalReason,
      },
      afterValue: {
        isReversed: true,
        reversedAt: reversedPayment.reversedAt,
        reversalReason: dto.reason,
      },
      changeSummary: `Payment reversed: ${dto.reason}`,
    });

    // 6. Sync reversal to Xero (TASK-XERO-003: Real implementation)
    // Note: Xero handles payment deletions differently - we log the reversal but don't delete in Xero
    // The payment reversal is tracked in CrecheBooks; Xero sync would require payment deletion API
    const invoice = await this.invoiceRepo.findById(
      payment.invoiceId,
      dto.tenantId,
    );
    if (invoice) {
      // Log the reversal attempt - actual Xero payment deletion is out of scope for TASK-XERO-003
      this.logger.log(
        `Payment ${reversedPayment.id} reversed locally. Xero payment ID: ${reversedPayment.xeroPaymentId ?? 'not synced'}`,
      );
    }

    return reversedPayment;
  }

  /**
   * Validate that total allocations do not exceed transaction amount
   * @param transactionAmountCents - Transaction amount in cents
   * @param allocations - Array of invoice allocations
   * @throws BusinessException if validation fails
   * @private
   */
  private validateAllocations(
    transactionAmountCents: number,
    allocations: AllocationDto[],
  ): void {
    if (allocations.length === 0) {
      throw new BusinessException(
        'At least one allocation is required',
        'NO_ALLOCATIONS',
      );
    }

    // 1. Calculate total allocated
    let totalAllocated = new Decimal(0);
    for (const allocation of allocations) {
      // 2. Validate each allocation amount > 0
      if (allocation.amountCents <= 0) {
        throw new BusinessException(
          'Allocation amount must be greater than zero',
          'INVALID_ALLOCATION_AMOUNT',
          {
            invoiceId: allocation.invoiceId,
            amount: allocation.amountCents,
          },
        );
      }
      totalAllocated = totalAllocated.plus(allocation.amountCents);
    }

    const transactionAmount = new Decimal(transactionAmountCents);

    // 3. Throw BusinessException if total > transactionAmount
    if (totalAllocated.gt(transactionAmount)) {
      throw new BusinessException(
        'Total allocated amount exceeds transaction amount',
        'ALLOCATION_EXCEEDS_TRANSACTION',
        {
          transactionAmount: transactionAmountCents,
          totalAllocated: totalAllocated.toNumber(),
          excess: totalAllocated.minus(transactionAmount).toNumber(),
        },
      );
    }
  }

  /**
   * Sync payment to Xero
   * TASK-XERO-003: Real Xero payment sync implementation
   * @param payment - Payment to sync
   * @param invoice - Related invoice (needed for Xero invoice ID)
   * @returns Xero sync status
   * @private
   */
  /**
   * TASK-STMT-002: Suggest FIFO allocation for a transaction to a parent's invoices
   * Returns suggested allocations for outstanding invoices, oldest first
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param transactionId - Bank transaction ID to allocate
   * @param parentId - Parent ID whose invoices to allocate to
   * @returns Array of suggested allocations with invoice details
   * @throws NotFoundException if transaction not found
   * @throws BusinessException if transaction is not a credit
   */
  async suggestAllocation(
    tenantId: string,
    transactionId: string,
    parentId: string,
  ): Promise<SuggestedAllocationResult[]> {
    this.logger.log(
      `Suggesting allocation for transaction ${transactionId} to parent ${parentId}`,
    );

    // 1. Get transaction and validate
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    if (!transaction.isCredit) {
      throw new BusinessException(
        'Transaction must be a credit (incoming payment) to suggest allocations',
        'TRANSACTION_NOT_CREDIT',
        { transactionId, isCredit: transaction.isCredit },
      );
    }

    // 2. Check how much is already allocated
    const existingPayments = await this.paymentRepo.findByTenantId(tenantId, {
      transactionId,
    });
    const totalAlreadyAllocated = existingPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0,
    );

    const availableAmount = new Decimal(transaction.amountCents).minus(
      totalAlreadyAllocated,
    );

    if (availableAmount.lte(0)) {
      return []; // Transaction fully allocated
    }

    // 3. Get outstanding invoices for parent, oldest first (FIFO)
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: {
          notIn: ['PAID', 'VOID'],
        },
        totalCents: { gt: 0 }, // Exclude credit notes
      },
      orderBy: [
        { dueDate: 'asc' },
        { issueDate: 'asc' },
        { invoiceNumber: 'asc' },
      ],
    });

    const suggestions: SuggestedAllocationResult[] = [];
    let remainingAmount = availableAmount;

    // 4. Allocate to invoices in FIFO order
    for (const invoice of outstandingInvoices) {
      if (remainingAmount.lte(0)) break;

      const outstandingCents = new Decimal(invoice.totalCents).minus(
        invoice.amountPaidCents,
      );

      if (outstandingCents.lte(0)) continue;

      const suggestedAmount = Decimal.min(remainingAmount, outstandingCents);

      suggestions.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        totalCents: invoice.totalCents,
        outstandingCents: outstandingCents.toNumber(),
        suggestedAmountCents: suggestedAmount.toNumber(),
      });

      remainingAmount = remainingAmount.minus(suggestedAmount);
    }

    return suggestions;
  }

  /**
   * TASK-STMT-002: Allocate a bank transaction to specific invoices
   * Wrapper around allocatePayment for statement generation workflow
   *
   * @param input - Allocation input with transaction, parent, and invoice allocations
   * @returns AllocationResult with created payments
   */
  async allocateTransactionToInvoices(
    input: AllocateTransactionInput,
  ): Promise<AllocationResult> {
    this.logger.log(
      `Allocating transaction ${input.transactionId} to ${input.allocations.length} invoices for parent ${input.parentId}`,
    );

    // Validate all invoices belong to the specified parent
    for (const allocation of input.allocations) {
      const invoice = await this.invoiceRepo.findById(
        allocation.invoiceId,
        input.tenantId,
      );
      if (!invoice) {
        throw new NotFoundException('Invoice', allocation.invoiceId);
      }
      if (invoice.parentId !== input.parentId) {
        throw new BusinessException(
          'Invoice does not belong to the specified parent',
          'PARENT_MISMATCH',
          {
            invoiceId: allocation.invoiceId,
            invoiceParentId: invoice.parentId,
            requestParentId: input.parentId,
          },
        );
      }
    }

    // Delegate to existing allocatePayment
    return this.allocatePayment({
      tenantId: input.tenantId,
      transactionId: input.transactionId,
      allocations: input.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amountCents: a.amountCents,
      })),
      userId: input.userId,
    });
  }

  /**
   * TASK-STMT-002: Get all payment allocations for an invoice
   *
   * @param invoiceId - Invoice ID to get allocations for
   * @returns Array of payments allocated to this invoice
   */
  async getAllocationsForInvoice(invoiceId: string): Promise<Payment[]> {
    this.logger.debug(`Getting allocations for invoice ${invoiceId}`);

    return this.prisma.payment.findMany({
      where: {
        invoiceId,
        isReversed: false,
      },
      include: {
        transaction: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  private async syncToXero(
    payment: Payment,
    invoice: Invoice,
  ): Promise<XeroSyncStatus> {
    try {
      // Get parent for contact info
      const parent = await this.parentRepo.findById(
        invoice.parentId,
        invoice.tenantId,
      );
      if (!parent) {
        this.logger.warn(
          `Cannot sync payment: Parent ${invoice.parentId} not found`,
        );
        return XeroSyncStatus.SKIPPED;
      }

      // Sync via XeroSyncService
      const xeroPaymentId = await this.xeroSyncService.syncPayment(
        payment,
        invoice,
        parent,
      );

      if (xeroPaymentId) {
        this.logger.log(
          `Payment ${payment.id} synced to Xero: ${xeroPaymentId}`,
        );
        return XeroSyncStatus.SUCCESS;
      }

      // No Xero connection or invoice not synced - skip without error
      return XeroSyncStatus.SKIPPED;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Xero payment sync error: ${errorMessage}`);
      return XeroSyncStatus.FAILED;
    }
  }
}
