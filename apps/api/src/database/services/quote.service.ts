/**
 * Quotes System Service
 * TASK-ACCT-012: Quotes System Foundation
 *
 * @module database/services/quote
 * @description Manages quotes for prospective parents.
 * Handles full lifecycle from creation to invoice conversion.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Only accepted quotes can be converted to invoices.
 * CRITICAL: Most creche fees are VAT exempt under Section 12(h).
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  Quote,
  QuoteLine,
  QuoteStatus,
  VatType,
  LineType,
} from '@prisma/client';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  type QuoteResponse as _QuoteResponse,
  QuoteSummaryResponse,
} from '../dto/quote.dto';

// SA VAT rate (15%)
const SA_VAT_RATE = 0.15;

@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
  ) {}

  /**
   * Generate the next quote number for a tenant
   */
  private async getNextQuoteNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();

    // Atomic increment using upsert
    const counter = await this.prisma.quoteNumberCounter.upsert({
      where: {
        tenantId_year: { tenantId, year },
      },
      create: {
        tenantId,
        year,
        lastNumber: 1,
      },
      update: {
        lastNumber: { increment: 1 },
      },
    });

    return `Q${year}-${String(counter.lastNumber).padStart(4, '0')}`;
  }

  /**
   * Create a new quote
   */
  async createQuote(
    tenantId: string,
    userId: string,
    data: CreateQuoteDto,
  ): Promise<Quote & { lines: QuoteLine[] }> {
    const quoteNumber = await this.getNextQuoteNumber(tenantId);

    // Calculate totals
    const subtotalCents = data.lines.reduce(
      (sum, line) => sum + line.unitPriceCents * (line.quantity ?? 1),
      0,
    );

    // Calculate VAT (most creche fees are exempt under Section 12(h))
    const vatAmountCents = data.lines.reduce((sum, line) => {
      const lineTotal = line.unitPriceCents * (line.quantity ?? 1);
      const vatType = line.vatType || 'EXEMPT';
      if (vatType === 'STANDARD') {
        return sum + Math.round(lineTotal * SA_VAT_RATE);
      }
      return sum;
    }, 0);

    const totalCents = subtotalCents + vatAmountCents;

    // Calculate expiry date
    const validityDays = data.validityDays ?? 30;
    const expiryDate = new Date(
      Date.now() + validityDays * 24 * 60 * 60 * 1000,
    );

    const quote = await this.prisma.quote.create({
      data: {
        tenantId,
        quoteNumber,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        recipientPhone: data.recipientPhone,
        parentId: data.parentId,
        childName: data.childName,
        childDob: data.childDob ? new Date(data.childDob) : null,
        expectedStartDate: data.expectedStartDate
          ? new Date(data.expectedStartDate)
          : null,
        expiryDate,
        validityDays,
        subtotalCents,
        vatAmountCents,
        totalCents,
        notes: data.notes,
        createdById: userId,
        status: 'DRAFT',
        lines: {
          create: data.lines.map((line, index) => ({
            lineNumber: index + 1,
            description: line.description,
            quantity: line.quantity ?? 1,
            unitPriceCents: line.unitPriceCents,
            lineTotalCents: line.unitPriceCents * (line.quantity ?? 1),
            vatType: (line.vatType as VatType) ?? 'EXEMPT',
            feeStructureId: line.feeStructureId,
            lineType: line.lineType ? (line.lineType as LineType) : null,
            accountId: line.accountId,
          })),
        },
      },
      include: { lines: true },
    });

    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quote.id,
      afterValue: {
        quoteNumber,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        totalCents,
        validityDays,
      },
    });

    return quote;
  }

  /**
   * Get a quote by ID
   */
  async getQuoteById(
    tenantId: string,
    quoteId: string,
  ): Promise<Quote & { lines: QuoteLine[] }> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        parent: true,
        createdBy: true,
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  /**
   * Update a draft quote
   */
  async updateQuote(
    tenantId: string,
    userId: string,
    quoteId: string,
    data: UpdateQuoteDto,
  ): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (quote.status !== 'DRAFT') {
      throw new BadRequestException('Only draft quotes can be modified');
    }

    // Recalculate expiry if validity changed
    let expiryDate = quote.expiryDate;
    if (data.validityDays && data.validityDays !== quote.validityDays) {
      expiryDate = new Date(
        quote.quoteDate.getTime() + data.validityDays * 24 * 60 * 60 * 1000,
      );
    }

    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        recipientPhone: data.recipientPhone,
        childName: data.childName,
        childDob: data.childDob ? new Date(data.childDob) : undefined,
        expectedStartDate: data.expectedStartDate
          ? new Date(data.expectedStartDate)
          : undefined,
        validityDays: data.validityDays,
        expiryDate,
        notes: data.notes,
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quoteId,
      beforeValue: {
        recipientName: quote.recipientName,
        recipientEmail: quote.recipientEmail,
      },
      afterValue: {
        recipientName: updated.recipientName,
        recipientEmail: updated.recipientEmail,
      },
    });

    return updated;
  }

  /**
   * Send a quote to recipient
   */
  async sendQuote(
    tenantId: string,
    userId: string,
    quoteId: string,
  ): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (quote.status !== 'DRAFT') {
      throw new BadRequestException('Quote has already been sent');
    }

    // Check if quote has lines
    if (quote.lines.length === 0) {
      throw new BadRequestException('Cannot send quote without line items');
    }

    // TODO: Generate PDF and send email
    // This would integrate with an email service
    // For now, just update the status

    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quoteId,
      beforeValue: { status: 'DRAFT' },
      afterValue: { status: 'SENT', sentAt: updated.sentAt?.toISOString() },
    });

    return updated;
  }

  /**
   * Mark quote as viewed (called when recipient opens)
   */
  async markAsViewed(tenantId: string, quoteId: string): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException(
        'Quote must be sent before it can be viewed',
      );
    }

    // Only update if not already viewed
    if (quote.viewedAt) {
      return quote;
    }

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'VIEWED',
        viewedAt: new Date(),
      },
    });
  }

  /**
   * Accept a quote
   */
  async acceptQuote(tenantId: string, quoteId: string): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException(
        `Cannot accept quote with status ${quote.status}`,
      );
    }

    // Check expiry
    if (quote.expiryDate < new Date()) {
      await this.prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Quote has expired');
    }

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
  }

  /**
   * Decline a quote
   */
  async declineQuote(
    tenantId: string,
    quoteId: string,
    reason?: string,
  ): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (!['SENT', 'VIEWED'].includes(quote.status)) {
      throw new BadRequestException(
        `Cannot decline quote with status ${quote.status}`,
      );
    }

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: reason,
      },
    });
  }

  /**
   * Convert accepted quote - creates parent record and marks quote as converted
   *
   * NOTE: Full invoice creation requires child enrollment first, as Invoice model
   * requires a childId. This method prepares for enrollment by:
   * 1. Creating a Parent record if needed
   * 2. Marking the quote as CONVERTED
   * 3. Returning parent info for enrollment flow
   *
   * The actual invoice should be created during the enrollment process
   * when a Child record is created.
   */
  async convertToInvoice(
    tenantId: string,
    userId: string,
    quoteId: string,
    _dueDate?: Date,
    _notes?: string,
  ): Promise<{ parentId: string; quoteId: string; nextStep: string }> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (quote.status === 'CONVERTED') {
      throw new ConflictException('Quote has already been converted');
    }

    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Only accepted quotes can be converted');
    }

    // If no parent exists, create one from recipient info
    let parentId = quote.parentId;
    if (!parentId) {
      const nameParts = quote.recipientName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const parent = await this.prisma.parent.create({
        data: {
          tenantId,
          firstName,
          lastName,
          email: quote.recipientEmail,
          phone: quote.recipientPhone,
        },
      });
      parentId = parent.id;
    }

    // Update quote status to converted
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'CONVERTED',
        convertedAt: new Date(),
        parentId, // Link parent if created
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quoteId,
      beforeValue: { status: 'ACCEPTED' },
      afterValue: {
        status: 'CONVERTED',
        parentId,
      },
    });

    return {
      parentId,
      quoteId,
      nextStep: 'enroll_child', // Indicates user should proceed to child enrollment
    };
  }

  /**
   * List quotes for a tenant
   */
  async listQuotes(
    tenantId: string,
    options?: {
      status?: QuoteStatus | QuoteStatus[];
      parentId?: string;
      recipientEmail?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ quotes: Quote[]; total: number }> {
    const statusArray = options?.status
      ? Array.isArray(options.status)
        ? options.status
        : [options.status]
      : undefined;

    const where = {
      tenantId,
      ...(statusArray && { status: { in: statusArray } }),
      ...(options?.parentId && { parentId: options.parentId }),
      ...(options?.recipientEmail && {
        recipientEmail: options.recipientEmail,
      }),
      ...(options?.fromDate && { quoteDate: { gte: options.fromDate } }),
      ...(options?.toDate && { quoteDate: { lte: options.toDate } }),
    };

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: { lines: true, parent: true },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { quotes, total };
  }

  /**
   * Get quote summary statistics
   */
  async getQuoteSummary(
    tenantId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<QuoteSummaryResponse> {
    const where = {
      tenantId,
      ...(fromDate && { quoteDate: { gte: fromDate } }),
      ...(toDate && { quoteDate: { lte: toDate } }),
    };

    const quotes = await this.prisma.quote.findMany({
      where,
      select: {
        status: true,
        totalCents: true,
      },
    });

    const statusCounts = {
      DRAFT: 0,
      SENT: 0,
      VIEWED: 0,
      ACCEPTED: 0,
      DECLINED: 0,
      EXPIRED: 0,
      CONVERTED: 0,
    };

    let totalValueCents = 0;
    let pendingValueCents = 0;

    for (const quote of quotes) {
      const status = quote.status as keyof typeof statusCounts;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      totalValueCents += quote.totalCents;

      if (['SENT', 'VIEWED', 'ACCEPTED'].includes(quote.status)) {
        pendingValueCents += quote.totalCents;
      }
    }

    const totalQuotes = quotes.length;
    const sentCount = statusCounts.SENT + statusCounts.VIEWED;
    const _respondedCount =
      statusCounts.ACCEPTED + statusCounts.DECLINED + statusCounts.CONVERTED;
    const conversionRate =
      sentCount > 0
        ? (statusCounts.ACCEPTED + statusCounts.CONVERTED) / sentCount
        : 0;

    return {
      totalQuotes,
      draftCount: statusCounts.DRAFT,
      sentCount: statusCounts.SENT + statusCounts.VIEWED,
      acceptedCount: statusCounts.ACCEPTED,
      declinedCount: statusCounts.DECLINED,
      expiredCount: statusCounts.EXPIRED,
      convertedCount: statusCounts.CONVERTED,
      totalValueCents,
      pendingValueCents,
      conversionRate: Math.round(conversionRate * 100),
    };
  }

  /**
   * Delete a draft quote
   */
  async deleteQuote(
    tenantId: string,
    userId: string,
    quoteId: string,
  ): Promise<void> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (quote.status !== 'DRAFT') {
      throw new BadRequestException('Only draft quotes can be deleted');
    }

    await this.prisma.quote.delete({
      where: { id: quoteId },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quoteId,
      beforeValue: { status: 'DRAFT', quoteNumber: quote.quoteNumber },
      afterValue: { deleted: true },
    });
  }

  /**
   * Duplicate a quote (create new draft from existing)
   */
  async duplicateQuote(
    tenantId: string,
    userId: string,
    quoteId: string,
  ): Promise<Quote & { lines: QuoteLine[] }> {
    const original = await this.getQuoteById(tenantId, quoteId);

    const newQuoteData: CreateQuoteDto = {
      recipientName: original.recipientName,
      recipientEmail: original.recipientEmail,
      recipientPhone: original.recipientPhone || undefined,
      parentId: original.parentId || undefined,
      childName: original.childName || undefined,
      childDob: original.childDob?.toISOString().split('T')[0],
      expectedStartDate: original.expectedStartDate
        ?.toISOString()
        .split('T')[0],
      validityDays: original.validityDays,
      notes: original.notes || undefined,
      lines: original.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatType: line.vatType,
        feeStructureId: line.feeStructureId || undefined,
        lineType: line.lineType || undefined,
        accountId: line.accountId || undefined,
      })),
    };

    return this.createQuote(tenantId, userId, newQuoteData);
  }

  /**
   * Update expired quotes (run by scheduler)
   */
  async updateExpiredQuotes(tenantId: string): Promise<number> {
    const result = await this.prisma.quote.updateMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'VIEWED'] },
        expiryDate: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    return result.count;
  }
}
