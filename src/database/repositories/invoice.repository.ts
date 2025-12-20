import { Injectable, Logger } from '@nestjs/common';
import { Invoice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilterDto,
} from '../dto/invoice.dto';
import { InvoiceStatus } from '../entities/invoice.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class InvoiceRepository {
  private readonly logger = new Logger(InvoiceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new invoice
   * @throws NotFoundException if tenant, parent, or child doesn't exist
   * @throws ConflictException if invoice number already exists for tenant
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    try {
      return await this.prisma.invoice.create({
        data: {
          tenantId: dto.tenantId,
          invoiceNumber: dto.invoiceNumber,
          parentId: dto.parentId,
          childId: dto.childId,
          billingPeriodStart: dto.billingPeriodStart,
          billingPeriodEnd: dto.billingPeriodEnd,
          issueDate: dto.issueDate,
          dueDate: dto.dueDate,
          subtotalCents: dto.subtotalCents,
          vatCents: dto.vatCents ?? 0,
          totalCents: dto.totalCents,
          deliveryMethod: dto.deliveryMethod ?? null,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create invoice: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Invoice with number '${dto.invoiceNumber}' already exists for this tenant`,
            { invoiceNumber: dto.invoiceNumber, tenantId: dto.tenantId },
          );
        }
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('parent')) {
            throw new NotFoundException('Parent', dto.parentId);
          }
          if (field?.includes('child')) {
            throw new NotFoundException('Child', dto.childId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find invoice by ID
   * @returns Invoice or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Invoice | null> {
    try {
      return await this.prisma.invoice.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoice by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find invoice by ID with lines included
   * @returns Invoice with lines or null if not found
   * @throws DatabaseException for database errors
   */
  async findByIdWithLines(
    id: string,
  ): Promise<
    (Invoice & { lines: Prisma.InvoiceLineGetPayload<object>[] }) | null
  > {
    try {
      return await this.prisma.invoice.findUnique({
        where: { id },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoice with lines by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByIdWithLines',
        'Failed to find invoice with lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all invoices for a tenant with optional filters
   * @returns Array of invoices (excluding deleted unless specified)
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: InvoiceFilterDto,
  ): Promise<Invoice[]> {
    try {
      const where: Prisma.InvoiceWhereInput = {
        tenantId,
        isDeleted: filter.isDeleted ?? false,
      };

      if (filter.parentId !== undefined) {
        where.parentId = filter.parentId;
      }

      if (filter.childId !== undefined) {
        where.childId = filter.childId;
      }

      if (filter.status !== undefined) {
        where.status = filter.status;
      }

      return await this.prisma.invoice.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoices for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find invoices',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find invoice by invoice number for a tenant
   * @returns Invoice or null if not found
   * @throws DatabaseException for database errors
   */
  async findByInvoiceNumber(
    tenantId: string,
    invoiceNumber: string,
  ): Promise<Invoice | null> {
    try {
      return await this.prisma.invoice.findUnique({
        where: {
          tenantId_invoiceNumber: {
            tenantId,
            invoiceNumber,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoice by number: ${invoiceNumber} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByInvoiceNumber',
        'Failed to find invoice by number',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all invoices for a specific parent
   * @returns Array of invoices
   * @throws DatabaseException for database errors
   */
  async findByParent(tenantId: string, parentId: string): Promise<Invoice[]> {
    try {
      return await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          isDeleted: false,
        },
        orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoices for parent: ${parentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByParent',
        'Failed to find invoices for parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all invoices for a specific child
   * @returns Array of invoices
   * @throws DatabaseException for database errors
   */
  async findByChild(tenantId: string, childId: string): Promise<Invoice[]> {
    try {
      return await this.prisma.invoice.findMany({
        where: {
          tenantId,
          childId,
          isDeleted: false,
        },
        orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoices for child: ${childId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByChild',
        'Failed to find invoices for child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all invoices with a specific status
   * @returns Array of invoices
   * @throws DatabaseException for database errors
   */
  async findByStatus(
    tenantId: string,
    status: InvoiceStatus,
  ): Promise<Invoice[]> {
    try {
      return await this.prisma.invoice.findMany({
        where: {
          tenantId,
          status,
          isDeleted: false,
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceNumber: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoices with status ${status} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStatus',
        'Failed to find invoices by status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all overdue invoices (past due date, not paid/void)
   * @returns Array of overdue invoices
   * @throws DatabaseException for database errors
   */
  async findOverdue(tenantId: string): Promise<Invoice[]> {
    try {
      const now = new Date();
      return await this.prisma.invoice.findMany({
        where: {
          tenantId,
          isDeleted: false,
          dueDate: { lt: now },
          status: {
            notIn: ['PAID', 'VOID'],
          },
        },
        orderBy: [{ dueDate: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find overdue invoices for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOverdue',
        'Failed to find overdue invoices',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an invoice
   * @throws NotFoundException if invoice doesn't exist
   * @throws ConflictException if updating to a duplicate invoice number
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Invoice', id);
      }

      const updateData: Prisma.InvoiceUpdateInput = {};

      if (dto.invoiceNumber !== undefined) {
        updateData.invoiceNumber = dto.invoiceNumber;
      }
      if (dto.billingPeriodStart !== undefined) {
        updateData.billingPeriodStart = dto.billingPeriodStart;
      }
      if (dto.billingPeriodEnd !== undefined) {
        updateData.billingPeriodEnd = dto.billingPeriodEnd;
      }
      if (dto.issueDate !== undefined) {
        updateData.issueDate = dto.issueDate;
      }
      if (dto.dueDate !== undefined) {
        updateData.dueDate = dto.dueDate;
      }
      if (dto.subtotalCents !== undefined) {
        updateData.subtotalCents = dto.subtotalCents;
      }
      if (dto.vatCents !== undefined) {
        updateData.vatCents = dto.vatCents;
      }
      if (dto.totalCents !== undefined) {
        updateData.totalCents = dto.totalCents;
      }
      if (dto.amountPaidCents !== undefined) {
        updateData.amountPaidCents = dto.amountPaidCents;
      }
      if (dto.status !== undefined) {
        updateData.status = dto.status;
      }
      if (dto.deliveryMethod !== undefined) {
        updateData.deliveryMethod = dto.deliveryMethod;
      }
      if (dto.xeroInvoiceId !== undefined) {
        updateData.xeroInvoiceId = dto.xeroInvoiceId;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return await this.prisma.invoice.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update invoice ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Invoice with number '${dto.invoiceNumber}' already exists for this tenant`,
            { invoiceNumber: dto.invoiceNumber },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Soft delete an invoice (set isDeleted to true)
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for database errors
   */
  async softDelete(id: string): Promise<Invoice> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Invoice', id);
      }

      return await this.prisma.invoice.update({
        where: { id },
        data: { isDeleted: true },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete invoice: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to soft delete invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hard delete an invoice (use with caution - also deletes all lines via cascade)
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Invoice', id);
      }

      await this.prisma.invoice.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete invoice: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update delivery status for an invoice
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for database errors
   */
  async updateDeliveryStatus(
    id: string,
    deliveryStatus: 'PENDING' | 'SENT' | 'DELIVERED' | 'OPENED' | 'FAILED',
    deliveredAt?: Date,
  ): Promise<Invoice> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Invoice', id);
      }

      return await this.prisma.invoice.update({
        where: { id },
        data: {
          deliveryStatus,
          deliveredAt: deliveredAt ?? null,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update delivery status for invoice: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateDeliveryStatus',
        'Failed to update delivery status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Record a payment on an invoice
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for database errors
   */
  async recordPayment(id: string, amountCents: number): Promise<Invoice> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Invoice', id);
      }

      const newAmountPaid = existing.amountPaidCents + amountCents;
      let newStatus: InvoiceStatus = existing.status as InvoiceStatus;

      if (newAmountPaid >= existing.totalCents) {
        newStatus = InvoiceStatus.PAID;
      } else if (newAmountPaid > 0) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      return await this.prisma.invoice.update({
        where: { id },
        data: {
          amountPaidCents: newAmountPaid,
          status: newStatus,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to record payment for invoice: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'recordPayment',
        'Failed to record payment',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
