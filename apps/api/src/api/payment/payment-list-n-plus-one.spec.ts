/**
 * Regression test: listPayments N+1 query fix (AUDIT-PAY-05)
 *
 * Before the fix: listPayments called invoiceRepo.findById() once per payment
 * in the page, producing 1 + N DB queries per request (21 for default page-20).
 *
 * After the fix: a single prisma.invoice.findMany() batch replaces all per-row
 * calls. Total queries: 1 (payments) + 1 (invoice batch) = 2.
 *
 * This spec asserts:
 *  - The invoice.findMany mock is called exactly once regardless of page size.
 *  - The response shape (invoice_number field) is identical to the old contract.
 *  - Payments with no matching invoice in the batch result in invoice_number: undefined.
 */

import { PaymentController } from './payment.controller';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import { PaymentReceiptService } from '../../database/services/payment-receipt.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IUser } from '../../database/entities/user.entity';
import type { Payment } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (tenantId = 'tenant-001'): IUser =>
  ({
    id: 'user-001',
    tenantId,
    tenantRoles: [{ tenantId, role: 'OWNER' }],
  }) as unknown as IUser;

const makePayment = (
  id: string,
  invoiceId: string,
  overrides: Partial<Payment> = {},
): Payment =>
  ({
    id,
    tenantId: 'tenant-001',
    invoiceId,
    transactionId: null,
    amountCents: 100000,
    paymentDate: new Date('2026-01-15'),
    reference: null,
    matchType: 'EXACT_REFERENCE',
    matchedBy: 'AI_AUTO',
    matchConfidence: null,
    isReversed: false,
    reversedAt: null,
    reversalReason: null,
    xeroPaymentId: null,
    deletedAt: null,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  }) as unknown as Payment;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentController.listPayments — N+1 query regression (AUDIT-PAY-05)', () => {
  let controller: PaymentController;
  let paymentRepoMock: jest.Mocked<Pick<PaymentRepository, 'findByTenantId'>>;
  let prismaInvoiceFindManyMock: jest.Mock;

  beforeEach(() => {
    paymentRepoMock = {
      findByTenantId: jest.fn(),
    };

    prismaInvoiceFindManyMock = jest.fn();

    // Minimal PrismaService stub — only invoice.findMany is used in listPayments.
    const prismaMock = {
      invoice: {
        findMany: prismaInvoiceFindManyMock,
      },
    } as unknown as PrismaService;

    controller = new PaymentController(
      {} as unknown as PaymentAllocationService,
      {} as unknown as PaymentMatchingService,
      {} as unknown as PaymentReceiptService,
      {} as unknown as ArrearsService,
      paymentRepoMock as unknown as PaymentRepository,
      {} as unknown as InvoiceRepository,
      prismaMock,
    );
  });

  it('calls invoice.findMany exactly once for a page of 10 payments (not 10 times)', async () => {
    const payments = Array.from({ length: 10 }, (_, i) =>
      makePayment(`pay-${i}`, `inv-${i}`),
    );

    paymentRepoMock.findByTenantId.mockResolvedValue(payments);
    prismaInvoiceFindManyMock.mockResolvedValue(
      payments.map((p) => ({
        id: p.invoiceId,
        invoiceNumber: `INV-2026-00${p.id.slice(-1)}`,
      })),
    );

    await controller.listPayments({ page: 1, limit: 10 }, makeUser());

    // Core assertion: batch query called exactly once — never once-per-payment.
    expect(prismaInvoiceFindManyMock).toHaveBeenCalledTimes(1);
  });

  it('passes the correct invoice IDs and tenantId to the batch query', async () => {
    const payments = [
      makePayment('pay-1', 'inv-aaa'),
      makePayment('pay-2', 'inv-bbb'),
    ];

    paymentRepoMock.findByTenantId.mockResolvedValue(payments);
    prismaInvoiceFindManyMock.mockResolvedValue([
      { id: 'inv-aaa', invoiceNumber: 'INV-2026-001' },
      { id: 'inv-bbb', invoiceNumber: 'INV-2026-002' },
    ]);

    await controller.listPayments({ page: 1, limit: 20 }, makeUser());

    const callArgs = prismaInvoiceFindManyMock.mock.calls[0][0] as {
      where: { id: { in: string[] }; tenantId: string };
    };

    // Both invoice IDs in the batch
    expect(callArgs.where.id.in).toEqual(
      expect.arrayContaining(['inv-aaa', 'inv-bbb']),
    );
    expect(callArgs.where.id.in).toHaveLength(2);

    // Tenant isolation: tenantId must be present in the batch query
    expect(callArgs.where.tenantId).toBe('tenant-001');
  });

  it('maps invoice_number correctly from the batch result', async () => {
    const payments = [
      makePayment('pay-1', 'inv-aaa'),
      makePayment('pay-2', 'inv-bbb'),
    ];

    paymentRepoMock.findByTenantId.mockResolvedValue(payments);
    prismaInvoiceFindManyMock.mockResolvedValue([
      { id: 'inv-aaa', invoiceNumber: 'INV-2026-001' },
      { id: 'inv-bbb', invoiceNumber: 'INV-2026-002' },
    ]);

    const result = await controller.listPayments(
      { page: 1, limit: 20 },
      makeUser(),
    );

    expect(result.data[0].invoice_number).toBe('INV-2026-001');
    expect(result.data[1].invoice_number).toBe('INV-2026-002');
  });

  it('returns invoice_number as undefined when the invoice is not found in the batch', async () => {
    // One payment whose invoiceId is not returned by the batch (e.g., deleted invoice).
    const payments = [makePayment('pay-orphan', 'inv-ghost')];

    paymentRepoMock.findByTenantId.mockResolvedValue(payments);
    prismaInvoiceFindManyMock.mockResolvedValue([]); // batch returns nothing

    const result = await controller.listPayments(
      { page: 1, limit: 20 },
      makeUser(),
    );

    expect(result.data[0].invoice_number).toBeUndefined();
    // Contract unchanged: field is present in the item, just undefined
    expect('invoice_number' in result.data[0]).toBe(true);
  });

  it('deduplicates invoice IDs before sending the batch (shared invoice across two payments)', async () => {
    // Two payments pointing to the same invoice (e.g., split payment)
    const payments = [
      makePayment('pay-1', 'inv-shared'),
      makePayment('pay-2', 'inv-shared'),
    ];

    paymentRepoMock.findByTenantId.mockResolvedValue(payments);
    prismaInvoiceFindManyMock.mockResolvedValue([
      { id: 'inv-shared', invoiceNumber: 'INV-2026-005' },
    ]);

    await controller.listPayments({ page: 1, limit: 20 }, makeUser());

    const callArgs = prismaInvoiceFindManyMock.mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };

    // De-duplicated: only one ID even though two payments share it
    expect(callArgs.where.id.in).toHaveLength(1);
    expect(callArgs.where.id.in[0]).toBe('inv-shared');
  });

  it('skips the batch query entirely when the page is empty', async () => {
    paymentRepoMock.findByTenantId.mockResolvedValue([]);
    // No prisma mock setup needed — it should never be called.

    const result = await controller.listPayments(
      { page: 1, limit: 20 },
      makeUser(),
    );

    expect(prismaInvoiceFindManyMock).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(0);
  });
});
