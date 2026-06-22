/**
 * Pure unit tests for deriveInvoiceStatus (no DB required).
 *
 * Covers the full truth table specified by the balance-integrity fix:
 *  - VOID is sticky (regardless of paid amount)
 *  - DRAFT is preserved when clampedPaid === 0 and current status is DRAFT
 *  - 0-paid non-DRAFT -> SENT
 *  - partial (0 < paid < total) -> PARTIALLY_PAID
 *  - paid >= total -> PAID
 *  - clamp behaviour: derivedPaid > totalCents still yields PAID (value capped externally)
 *  - Never yields OVERDUE or VIEWED
 */
import { deriveInvoiceStatus } from '../../../src/database/repositories/invoice.repository';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';

describe('deriveInvoiceStatus', () => {
  // ── VOID sticky ──────────────────────────────────────────────────────────────

  describe('VOID is sticky', () => {
    it('returns VOID when paid is 0', () => {
      expect(deriveInvoiceStatus(0, 10000, InvoiceStatus.VOID)).toBe(
        InvoiceStatus.VOID,
      );
    });

    it('returns VOID when paid equals total', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.VOID)).toBe(
        InvoiceStatus.VOID,
      );
    });

    it('returns VOID when paid is partial', () => {
      expect(deriveInvoiceStatus(5000, 10000, InvoiceStatus.VOID)).toBe(
        InvoiceStatus.VOID,
      );
    });

    it('returns VOID when clampedPaid equals totalCents exactly', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.VOID)).toBe(
        InvoiceStatus.VOID,
      );
    });
  });

  // ── PAID (clampedPaid >= totalCents) ─────────────────────────────────────────

  describe('PAID when clampedPaid >= totalCents', () => {
    it('returns PAID when paid exactly equals total (from SENT)', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('returns PAID when paid equals total (from DRAFT)', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.DRAFT)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('returns PAID when paid equals total (from PARTIALLY_PAID)', () => {
      expect(
        deriveInvoiceStatus(10000, 10000, InvoiceStatus.PARTIALLY_PAID),
      ).toBe(InvoiceStatus.PAID);
    });

    it('returns PAID when paid equals total (from OVERDUE)', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.OVERDUE)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('returns PAID when paid equals total (from VIEWED)', () => {
      expect(deriveInvoiceStatus(10000, 10000, InvoiceStatus.VIEWED)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('returns PAID when clampedPaid exceeds total (caller already clamped)', () => {
      // The caller (recomputePaidAndStatus) clamps before calling, so this
      // edge case should still yield PAID when passed a value >= totalCents.
      expect(deriveInvoiceStatus(15000, 10000, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.PAID,
      );
    });
  });

  // ── PARTIALLY_PAID ───────────────────────────────────────────────────────────

  describe('PARTIALLY_PAID when 0 < clampedPaid < totalCents', () => {
    it('returns PARTIALLY_PAID from SENT', () => {
      expect(deriveInvoiceStatus(5000, 10000, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.PARTIALLY_PAID,
      );
    });

    it('returns PARTIALLY_PAID from DRAFT', () => {
      expect(deriveInvoiceStatus(1, 10000, InvoiceStatus.DRAFT)).toBe(
        InvoiceStatus.PARTIALLY_PAID,
      );
    });

    it('returns PARTIALLY_PAID from OVERDUE', () => {
      expect(deriveInvoiceStatus(4000, 10000, InvoiceStatus.OVERDUE)).toBe(
        InvoiceStatus.PARTIALLY_PAID,
      );
    });

    it('returns PARTIALLY_PAID from VIEWED', () => {
      expect(deriveInvoiceStatus(3000, 10000, InvoiceStatus.VIEWED)).toBe(
        InvoiceStatus.PARTIALLY_PAID,
      );
    });

    it('returns PARTIALLY_PAID when paid is 1 cent below total', () => {
      expect(
        deriveInvoiceStatus(9999, 10000, InvoiceStatus.PARTIALLY_PAID),
      ).toBe(InvoiceStatus.PARTIALLY_PAID);
    });
  });

  // ── 0-paid: DRAFT preserve vs SENT ───────────────────────────────────────────

  describe('zero paid: DRAFT preserved, everything else becomes SENT', () => {
    it('returns DRAFT when current is DRAFT and paid is 0', () => {
      expect(deriveInvoiceStatus(0, 10000, InvoiceStatus.DRAFT)).toBe(
        InvoiceStatus.DRAFT,
      );
    });

    it('returns SENT when current is SENT and paid is 0', () => {
      expect(deriveInvoiceStatus(0, 10000, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.SENT,
      );
    });

    it('returns SENT when current is OVERDUE and paid is 0', () => {
      // Scheduler manages OVERDUE; recompute never sets it
      expect(deriveInvoiceStatus(0, 10000, InvoiceStatus.OVERDUE)).toBe(
        InvoiceStatus.SENT,
      );
    });

    it('returns SENT when current is VIEWED and paid is 0', () => {
      // Delivery tracking manages VIEWED; recompute never sets it
      expect(deriveInvoiceStatus(0, 10000, InvoiceStatus.VIEWED)).toBe(
        InvoiceStatus.SENT,
      );
    });

    it('returns SENT when current is PARTIALLY_PAID and paid drops to 0 (reversal)', () => {
      expect(
        deriveInvoiceStatus(0, 10000, InvoiceStatus.PARTIALLY_PAID),
      ).toBe(InvoiceStatus.SENT);
    });
  });

  // ── Never sets OVERDUE or VIEWED ─────────────────────────────────────────────

  describe('never emits OVERDUE or VIEWED', () => {
    const allStatuses: InvoiceStatus[] = Object.values(InvoiceStatus);
    const payments = [0, 5000, 10000];

    for (const currentStatus of allStatuses) {
      for (const paid of payments) {
        it(`[${currentStatus}, paid=${paid}] does not return OVERDUE or VIEWED`, () => {
          const result = deriveInvoiceStatus(paid, 10000, currentStatus);
          expect(result).not.toBe(InvoiceStatus.OVERDUE);
          expect(result).not.toBe(InvoiceStatus.VIEWED);
        });
      }
    }
  });

  // ── Boundary / edge values ────────────────────────────────────────────────────

  describe('boundary values', () => {
    it('zero-total invoice: 0-paid SENT -> PAID (0 >= 0)', () => {
      // Edge: totalCents === 0; clampedPaid === 0; 0 >= 0 is true
      expect(deriveInvoiceStatus(0, 0, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('1-cent invoice: paid=1 from SENT yields PAID', () => {
      expect(deriveInvoiceStatus(1, 1, InvoiceStatus.SENT)).toBe(
        InvoiceStatus.PAID,
      );
    });

    it('large invoice: partial payment yields PARTIALLY_PAID', () => {
      expect(
        deriveInvoiceStatus(99999999, 100000000, InvoiceStatus.SENT),
      ).toBe(InvoiceStatus.PARTIALLY_PAID);
    });
  });
});
