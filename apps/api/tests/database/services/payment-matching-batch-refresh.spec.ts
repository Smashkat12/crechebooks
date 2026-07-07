/**
 * Regression test for the matcher's intra-batch over-allocation bug.
 *
 * Bug captured 2026-05-10 during the Mar/Apr close: payment-matching loaded
 * outstandingInvoices once at the start and never refreshed. Three R1,000
 * payments from the same parent in one batch all matched the SAME R1,000
 * invoice, paying it 3x. We had to manually reverse + retarget two of them.
 *
 * The fix mutates the in-memory outstandingInvoices list after every
 * successful auto-apply: bumps amountPaidCents on the consumed invoice and
 * removes it from the candidate list once fully paid.
 *
 * This unit test exercises the helper directly so the contract stays pinned
 * regardless of how the matcher loop evolves around it.
 */
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';

describe('PaymentMatchingService - intra-batch invoice consumption', () => {
  // Helper is private — exercise it via a thin unknown cast.
  type InvoiceLike = {
    id: string;
    totalCents: number;
    amountPaidCents: number;
  };

  const buildInvoice = (id: string, total = 100000, paid = 0): InvoiceLike => ({
    id,
    totalCents: total,
    amountPaidCents: paid,
  });

  const callMark = (
    invoices: InvoiceLike[],
    invoiceId: string,
    amountCents: number,
  ): void => {
    // Build a minimal service shell — only the helper is being exercised.
    const svc = Object.create(
      PaymentMatchingService.prototype,
    ) as PaymentMatchingService;
    (
      svc as unknown as {
        markInvoicePaidInBatch: (
          invs: InvoiceLike[],
          id: string,
          cents: number,
        ) => void;
      }
    ).markInvoicePaidInBatch(invoices, invoiceId, amountCents);
  };

  it('bumps amountPaidCents on the matched invoice without removing it for partial payments', () => {
    const invoices = [buildInvoice('INV-1', 100000, 0), buildInvoice('INV-2')];
    callMark(invoices, 'INV-1', 30000);

    expect(invoices).toHaveLength(2);
    expect(invoices[0]).toMatchObject({
      id: 'INV-1',
      totalCents: 100000,
      amountPaidCents: 30000,
    });
  });

  it('removes the invoice from candidates once it is fully paid', () => {
    const invoices = [buildInvoice('INV-1'), buildInvoice('INV-2')];
    callMark(invoices, 'INV-1', 100000);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe('INV-2');
  });

  it('removes the invoice when the payment over-pays it (advance / over-allocation)', () => {
    const invoices = [buildInvoice('INV-1'), buildInvoice('INV-2')];
    callMark(invoices, 'INV-1', 150000);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe('INV-2');
  });

  it('three sequential payments from the same parent flow to three different invoices', () => {
    // Reproduces the prod incident: parent has 3 R1000 invoices outstanding
    // and pays R1000 three times in one batch. The fixed matcher should
    // consume INV-1, then INV-2, then INV-3 — never the same one twice.
    const invoices = [
      buildInvoice('INV-1'),
      buildInvoice('INV-2'),
      buildInvoice('INV-3'),
    ];

    // Simulate the matcher always picking invoices[0] (oldest first).
    const allocated: string[] = [];
    for (let i = 0; i < 3; i++) {
      const target = invoices[0]; // matcher logic
      allocated.push(target.id);
      callMark(invoices, target.id, 100000);
    }

    expect(allocated).toEqual(['INV-1', 'INV-2', 'INV-3']);
    expect(invoices).toHaveLength(0);
  });

  it('is a no-op when invoiceId is not in the list (defensive)', () => {
    const invoices = [buildInvoice('INV-1')];
    callMark(invoices, 'INV-NOT-PRESENT', 50000);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].amountPaidCents).toBe(0);
  });
});
