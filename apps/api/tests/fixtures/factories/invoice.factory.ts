/**
 * Invoice Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { Invoice, InvoiceStatus, DeliveryMethod, DeliveryStatus } from '@prisma/client';
import { generateUniqueId } from '../utils';

export interface InvoiceFactoryOptions {
  tenantId: string;
  parentId: string;
  childId: string;
  invoiceNumber?: string;
  billingPeriodStart?: Date;
  billingPeriodEnd?: Date;
  issueDate?: Date;
  dueDate?: Date;
  subtotalCents?: number;
  vatCents?: number;
  vatRate?: number;
  totalCents?: number;
  amountPaidCents?: number;
  status?: InvoiceStatus;
  deliveryMethod?: DeliveryMethod | null;
  deliveryStatus?: DeliveryStatus | null;
}

/**
 * Create a test invoice with sensible defaults
 */
export async function createInvoice(
  prisma: PrismaService,
  opts: InvoiceFactoryOptions,
): Promise<Invoice> {
  const uniqueId = generateUniqueId();
  const subtotalCents = opts.subtotalCents ?? 300000; // R3,000
  const vatCents = opts.vatCents ?? 0;
  const totalCents = opts.totalCents ?? subtotalCents + vatCents;

  return prisma.invoice.create({
    data: {
      tenantId: opts.tenantId,
      parentId: opts.parentId,
      childId: opts.childId,
      invoiceNumber: opts.invoiceNumber ?? `INV-TEST-${uniqueId.slice(0, 8).toUpperCase()}`,
      billingPeriodStart: opts.billingPeriodStart ?? new Date('2025-01-01'),
      billingPeriodEnd: opts.billingPeriodEnd ?? new Date('2025-01-31'),
      issueDate: opts.issueDate ?? new Date(),
      dueDate: opts.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      subtotalCents,
      vatCents,
      vatRate: opts.vatRate ?? 0,
      totalCents,
      amountPaidCents: opts.amountPaidCents ?? 0,
      status: opts.status ?? 'DRAFT',
      deliveryMethod: opts.deliveryMethod ?? null,
      deliveryStatus: opts.deliveryStatus ?? null,
    },
  });
}

/**
 * Create a paid invoice
 */
export async function createPaidInvoice(
  prisma: PrismaService,
  opts: InvoiceFactoryOptions,
): Promise<Invoice> {
  const totalCents = opts.totalCents ?? (opts.subtotalCents ?? 300000) + (opts.vatCents ?? 0);

  return createInvoice(prisma, {
    ...opts,
    amountPaidCents: totalCents,
    status: 'PAID',
  });
}
