import { Injectable, Logger } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  ReversePaymentDto,
  PaymentFilterDto,
} from '../dto/payment.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class PaymentRepository {
  private readonly logger = new Logger(PaymentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payment linking a transaction to an invoice
   * @throws NotFoundException if tenant, transaction, or invoice doesn't exist
   * @throws ConflictException if xeroPaymentId already exists
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreatePaymentDto): Promise<Payment> {
    try {
      return await this.prisma.payment.create({
        data: {
          tenantId: dto.tenantId,
          xeroPaymentId: dto.xeroPaymentId ?? null,
          transactionId: dto.transactionId ?? null,
          invoiceId: dto.invoiceId,
          amountCents: dto.amountCents,
          paymentDate: dto.paymentDate,
          reference: dto.reference ?? null,
          matchType: dto.matchType,
          matchConfidence: dto.matchConfidence ?? null,
          matchedBy: dto.matchedBy,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create payment: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Payment with xeroPaymentId '${dto.xeroPaymentId}' already exists`,
            { xeroPaymentId: dto.xeroPaymentId },
          );
        }
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('transaction')) {
            throw new NotFoundException(
              'Transaction',
              dto.transactionId ?? 'null',
            );
          }
          if (field?.includes('invoice')) {
            throw new NotFoundException('Invoice', dto.invoiceId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payment by ID with tenant isolation
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param id - Payment ID
   * @param tenantId - Tenant ID for isolation
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Payment or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(
    id: string,
    tenantId: string,
    includeDeleted = false,
  ): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findFirst({
        where: {
          id,
          tenantId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payment by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payment by Xero Payment ID
   * @returns Payment or null if not found
   * @throws DatabaseException for database errors
   */
  async findByXeroPaymentId(xeroPaymentId: string): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findUnique({
        where: { xeroPaymentId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payment by xeroPaymentId: ${xeroPaymentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByXeroPaymentId',
        'Failed to find payment by Xero ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payments for a transaction
   * @returns Array of payments
   * @throws DatabaseException for database errors
   */
  async findByTransactionId(transactionId: string): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        where: { transactionId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payments for transaction: ${transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTransactionId',
        'Failed to find payments for transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payments for an invoice
   * @returns Array of payments
   * @throws DatabaseException for database errors
   */
  async findByInvoiceId(invoiceId: string): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        where: { invoiceId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payments for invoice: ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByInvoiceId',
        'Failed to find payments for invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payments for a tenant with optional filters
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param filter - Filter options
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Array of payments
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: PaymentFilterDto,
    includeDeleted = false,
  ): Promise<Payment[]> {
    try {
      const where: Prisma.PaymentWhereInput = {
        tenantId,
        // TASK-DATA-003: Exclude soft-deleted records by default
        ...(includeDeleted ? {} : { deletedAt: null }),
      };

      if (filter?.transactionId !== undefined) {
        where.transactionId = filter.transactionId;
      }
      if (filter?.invoiceId !== undefined) {
        where.invoiceId = filter.invoiceId;
      }
      if (filter?.matchType !== undefined) {
        where.matchType = filter.matchType;
      }
      if (filter?.matchedBy !== undefined) {
        where.matchedBy = filter.matchedBy;
      }
      if (filter?.isReversed !== undefined) {
        where.isReversed = filter.isReversed;
      }

      return await this.prisma.payment.findMany({
        where,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payments for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find payments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a payment
   * @throws NotFoundException if payment doesn't exist
   * @throws ConflictException if updating to a duplicate xeroPaymentId
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdatePaymentDto,
  ): Promise<Payment> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payment', id);
      }

      const updateData: Prisma.PaymentUpdateInput = {};

      if (dto.xeroPaymentId !== undefined) {
        updateData.xeroPaymentId = dto.xeroPaymentId;
      }
      if (dto.transactionId !== undefined) {
        updateData.transaction = dto.transactionId
          ? { connect: { id: dto.transactionId } }
          : { disconnect: true };
      }
      if (dto.invoiceId !== undefined) {
        updateData.invoice = { connect: { id: dto.invoiceId } };
      }
      if (dto.amountCents !== undefined) {
        updateData.amountCents = dto.amountCents;
      }
      if (dto.paymentDate !== undefined) {
        updateData.paymentDate = dto.paymentDate;
      }
      if (dto.reference !== undefined) {
        updateData.reference = dto.reference;
      }
      if (dto.matchType !== undefined) {
        updateData.matchType = dto.matchType;
      }
      if (dto.matchConfidence !== undefined) {
        updateData.matchConfidence = dto.matchConfidence;
      }
      if (dto.matchedBy !== undefined) {
        updateData.matchedBy = dto.matchedBy;
      }

      return await this.prisma.payment.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update payment ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Payment with xeroPaymentId '${dto.xeroPaymentId}' already exists`,
            { xeroPaymentId: dto.xeroPaymentId },
          );
        }
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('transaction')) {
            throw new NotFoundException(
              'Transaction',
              dto.transactionId ?? 'null',
            );
          }
          if (field?.includes('invoice')) {
            throw new NotFoundException('Invoice', dto.invoiceId ?? 'null');
          }
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reverse a payment
   * Sets isReversed to true, records reversedAt and reversalReason
   * @throws NotFoundException if payment doesn't exist
   * @throws ConflictException if payment is already reversed
   * @throws DatabaseException for database errors
   */
  async reverse(
    id: string,
    tenantId: string,
    dto: ReversePaymentDto,
  ): Promise<Payment> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payment', id);
      }

      if (existing.isReversed) {
        throw new ConflictException(`Payment '${id}' is already reversed`, {
          paymentId: id,
          reversedAt: existing.reversedAt,
        });
      }

      return await this.prisma.payment.update({
        where: { id },
        data: {
          isReversed: true,
          reversedAt: new Date(),
          reversalReason: dto.reversalReason,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to reverse payment ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'reverse',
        'Failed to reverse payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Soft delete a payment (set deletedAt timestamp) with tenant isolation
   * TASK-DATA-003: Soft delete implementation for data retention
   * @param id - Payment ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if payment doesn't exist or is already deleted
   * @throws DatabaseException for database errors
   */
  async softDelete(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch entity data (excluding already deleted)
        const existing = await tx.payment.findFirst({
          where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
          throw new NotFoundException('Payment', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Payment',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: new Date(),
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Payment soft-deleted: ${existing.amountCents}c for invoice ${existing.invoiceId}`,
          },
        });

        // Step 3: Set deletedAt timestamp (soft delete)
        await tx.payment.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        this.logger.debug(
          `TASK-DATA-003: Payment ${id} soft-deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete payment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to soft delete payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Restore a soft-deleted payment
   * TASK-DATA-003: Restore functionality for accidentally deleted records
   * @param id - Payment ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @returns Restored payment
   * @throws NotFoundException if payment doesn't exist or is not deleted
   * @throws DatabaseException for database errors
   */
  async restore(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<Payment> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch soft-deleted entity
        const existing = await tx.payment.findFirst({
          where: { id, tenantId, deletedAt: { not: null } },
        });

        if (!existing) {
          throw new NotFoundException('Payment', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Payment',
            entityId: id,
            action: 'UPDATE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: null,
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Payment restored: ${existing.amountCents}c for invoice ${existing.invoiceId}`,
          },
        });

        // Step 3: Clear deletedAt timestamp (restore)
        const restored = await tx.payment.update({
          where: { id },
          data: { deletedAt: null },
        });

        this.logger.debug(
          `TASK-DATA-003: Payment ${id} restored with audit trail`,
        );

        return restored;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to restore payment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'restore',
        'Failed to restore payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hard delete a payment (permanent deletion with audit logging)
   * TASK-DATA-003: Kept as option for permanent deletion when needed
   * @throws NotFoundException if payment doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string, userId?: string): Promise<void> {
    try {
      // Use transaction to ensure audit log and delete succeed together
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch entity data for audit snapshot (include soft-deleted)
        const existing = await tx.payment.findFirst({
          where: { id, tenantId },
        });

        if (!existing) {
          throw new NotFoundException('Payment', id);
        }

        // Step 2: Create audit log entry (transactional)
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Payment',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: Prisma.DbNull,
            changeSummary: `Payment permanently deleted: ${existing.amountCents}c for invoice ${existing.invoiceId}`,
          },
        });

        // Step 3: Execute delete
        await tx.payment.delete({
          where: { id },
        });

        this.logger.debug(
          `TASK-DATA-003: Payment ${id} permanently deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete payment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete payment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate total paid amount for an invoice (excluding reversed and soft-deleted payments)
   * TASK-DATA-003: Updated to exclude soft-deleted payments
   * @returns Total amount in cents
   * @throws DatabaseException for database errors
   */
  async calculateTotalPaidForInvoice(invoiceId: string): Promise<number> {
    try {
      const result = await this.prisma.payment.aggregate({
        where: {
          invoiceId,
          isReversed: false,
          deletedAt: null, // TASK-DATA-003: Exclude soft-deleted
        },
        _sum: {
          amountCents: true,
        },
      });

      return result._sum.amountCents ?? 0;
    } catch (error) {
      this.logger.error(
        `Failed to calculate total paid for invoice: ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculateTotalPaidForInvoice',
        'Failed to calculate total paid',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all non-reversed payments for a tenant
   * TASK-DATA-003: Updated to exclude soft-deleted payments
   * @returns Array of active payments (not reversed, not soft-deleted)
   * @throws DatabaseException for database errors
   */
  async findActiveByTenantId(tenantId: string): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        where: {
          tenantId,
          isReversed: false,
          deletedAt: null, // TASK-DATA-003: Exclude soft-deleted
        },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active payments for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveByTenantId',
        'Failed to find active payments',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
