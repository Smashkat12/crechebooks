import { Injectable, Logger } from '@nestjs/common';
import { InvoiceLine, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceLineDto,
  UpdateInvoiceLineDto,
} from '../dto/invoice-line.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class InvoiceLineRepository {
  private readonly logger = new Logger(InvoiceLineRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new invoice line
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateInvoiceLineDto): Promise<InvoiceLine> {
    try {
      return await this.prisma.invoiceLine.create({
        data: {
          invoiceId: dto.invoiceId,
          description: dto.description,
          quantity: dto.quantity ?? 1,
          unitPriceCents: dto.unitPriceCents,
          discountCents: dto.discountCents ?? 0,
          subtotalCents: dto.subtotalCents,
          vatCents: dto.vatCents ?? 0,
          totalCents: dto.totalCents,
          lineType: dto.lineType,
          accountCode: dto.accountCode ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create invoice line: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Invoice', dto.invoiceId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create invoice line',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create multiple invoice lines in a batch
   * @throws NotFoundException if invoice doesn't exist
   * @throws DatabaseException for other database errors
   */
  async createMany(
    invoiceId: string,
    lines: Omit<CreateInvoiceLineDto, 'invoiceId'>[],
  ): Promise<{ count: number }> {
    try {
      const data = lines.map((line, index) => ({
        invoiceId,
        description: line.description,
        quantity: line.quantity ?? 1,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents ?? 0,
        subtotalCents: line.subtotalCents,
        vatCents: line.vatCents ?? 0,
        totalCents: line.totalCents,
        lineType: line.lineType,
        accountCode: line.accountCode ?? null,
        sortOrder: line.sortOrder ?? index,
      }));

      return await this.prisma.invoiceLine.createMany({
        data,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create invoice lines for invoice: ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Invoice', invoiceId);
        }
      }
      throw new DatabaseException(
        'createMany',
        'Failed to create invoice lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find invoice line by ID
   * @returns InvoiceLine or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<InvoiceLine | null> {
    try {
      return await this.prisma.invoiceLine.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoice line by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find invoice line',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all lines for an invoice
   * @returns Array of invoice lines ordered by sortOrder
   * @throws DatabaseException for database errors
   */
  async findByInvoice(invoiceId: string): Promise<InvoiceLine[]> {
    try {
      return await this.prisma.invoiceLine.findMany({
        where: { invoiceId },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find invoice lines for invoice: ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByInvoice',
        'Failed to find invoice lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an invoice line
   * @throws NotFoundException if invoice line doesn't exist
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateInvoiceLineDto): Promise<InvoiceLine> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('InvoiceLine', id);
      }

      const updateData: Prisma.InvoiceLineUpdateInput = {};

      if (dto.description !== undefined) {
        updateData.description = dto.description;
      }
      if (dto.quantity !== undefined) {
        updateData.quantity = dto.quantity;
      }
      if (dto.unitPriceCents !== undefined) {
        updateData.unitPriceCents = dto.unitPriceCents;
      }
      if (dto.discountCents !== undefined) {
        updateData.discountCents = dto.discountCents;
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
      if (dto.lineType !== undefined) {
        updateData.lineType = dto.lineType;
      }
      if (dto.accountCode !== undefined) {
        updateData.accountCode = dto.accountCode;
      }
      if (dto.sortOrder !== undefined) {
        updateData.sortOrder = dto.sortOrder;
      }

      return await this.prisma.invoiceLine.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update invoice line ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update invoice line',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete an invoice line
   * @throws NotFoundException if invoice line doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('InvoiceLine', id);
      }

      await this.prisma.invoiceLine.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete invoice line: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete invoice line',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all lines for an invoice
   * @returns Number of deleted lines
   * @throws DatabaseException for database errors
   */
  async deleteByInvoice(invoiceId: string): Promise<{ count: number }> {
    try {
      return await this.prisma.invoiceLine.deleteMany({
        where: { invoiceId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete invoice lines for invoice: ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteByInvoice',
        'Failed to delete invoice lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reorder lines for an invoice
   * @param lineOrders Array of {id, sortOrder} pairs
   * @throws NotFoundException if any line doesn't exist
   * @throws DatabaseException for database errors
   */
  async reorderLines(
    lineOrders: Array<{ id: string; sortOrder: number }>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        lineOrders.map(({ id, sortOrder }) =>
          this.prisma.invoiceLine.update({
            where: { id },
            data: { sortOrder },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to reorder invoice lines: ${JSON.stringify(lineOrders)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('InvoiceLine', 'one or more IDs');
        }
      }
      throw new DatabaseException(
        'reorderLines',
        'Failed to reorder invoice lines',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
