/**
 * Mutation-tool handler unit tests.
 *
 * Focus areas:
 *   - Preview-default (confirm=false makes no writes)
 *   - Tenant isolation (cross-tenant ids rejected)
 *   - Audit-log emission on confirmed writes
 *   - No delivery/notification side effects (the tools never call any client)
 */

import { Logger } from '@nestjs/common';
import type { AgentToolContext } from './interfaces/agent-tool.interface';
import { AgentToolError } from './interfaces/agent-tool.interface';
import { generateInvoicesTool } from './mutation/generate-invoices.tool';
import { allocatePaymentTool } from './mutation/allocate-payment.tool';
import { runPaymentMatchingTool } from './mutation/run-payment-matching.tool';
import { categorizeTransactionsTool } from './mutation/categorize-transactions.tool';

const TENANT = 'tenant-mut-01';
const USER = 'user-mut-01';

function makeCtx(prisma: unknown): AgentToolContext {
  return {
    tenantId: TENANT,
    userId: USER,
    agentId: 'agent-under-test',
    prisma: prisma as AgentToolContext['prisma'],
    logger: new Logger('test'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// generate_invoices
// ─────────────────────────────────────────────────────────────────────

describe('generate_invoices', () => {
  it('returns a preview and writes nothing when confirm is omitted', async () => {
    const count = jest.fn().mockResolvedValue(7);
    const create = jest.fn();
    const ctx = makeCtx({
      enrollment: { count },
      auditLog: { create },
    });

    const res = (await generateInvoicesTool.handler(
      { month: '2026-06' },
      ctx,
    )) as { preview: boolean; activeEnrollments: number };

    expect(res.preview).toBe(true);
    expect(res.activeEnrollments).toBe(7);
    expect(create).not.toHaveBeenCalled();
  });

  it('audit-logs on confirm and reports the delegation target', async () => {
    const count = jest.fn().mockResolvedValue(3);
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const ctx = makeCtx({
      enrollment: { count },
      auditLog: { create },
    });

    const res = (await generateInvoicesTool.handler(
      { month: '2026-06', confirm: true },
      ctx,
    )) as { queued: boolean; message: string };

    expect(res.queued).toBe(true);
    expect(res.message).toMatch(/InvoiceGenerationService/);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          userId: USER,
          agentId: 'agent-under-test',
          entityType: 'invoice_batch',
          action: 'CREATE',
        }),
      }),
    );
  });

  it('rejects a malformed month', async () => {
    const ctx = makeCtx({
      enrollment: { count: jest.fn() },
      auditLog: { create: jest.fn() },
    });
    await expect(
      generateInvoicesTool.handler({ month: '20260601' }, ctx),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ─────────────────────────────────────────────────────────────────────
// allocate_payment
// ─────────────────────────────────────────────────────────────────────

describe('allocate_payment', () => {
  const buildTxAndInvoice = (
    opts: {
      txTenant?: string;
      invoiceTenant?: string;
      isCredit?: boolean;
      outstanding?: number;
    } = {},
  ) => {
    const tx = {
      id: 'tx-1',
      tenantId: opts.txTenant ?? TENANT,
      amountCents: 100000,
      isCredit: opts.isCredit ?? true,
      date: new Date('2026-06-10'),
      reference: 'INV-100',
      isDeleted: false,
    };
    const invoice = {
      id: 'inv-1',
      tenantId: opts.invoiceTenant ?? TENANT,
      totalCents: 100000,
      amountPaidCents: 100000 - (opts.outstanding ?? 100000),
      status: 'SENT',
      isDeleted: false,
    };
    return { tx, invoice };
  };

  it('returns a preview and writes nothing when confirm is omitted', async () => {
    const { tx, invoice } = buildTxAndInvoice();
    const findTx = jest.fn().mockResolvedValue(tx);
    const findInv = jest.fn().mockResolvedValue(invoice);
    const $transaction = jest.fn();
    const ctx = makeCtx({
      transaction: { findUnique: findTx },
      invoice: { findUnique: findInv },
      $transaction,
    });

    const res = (await allocatePaymentTool.handler(
      {
        transactionId: 'tx-1',
        invoiceId: 'inv-1',
        amountCents: 50000,
      },
      ctx,
    )) as { preview: boolean; would: { resultingStatus: string } };

    expect(res.preview).toBe(true);
    expect(res.would.resultingStatus).toBe('PARTIALLY_PAID');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant transaction', async () => {
    const { tx, invoice } = buildTxAndInvoice({ txTenant: 'other-tenant' });
    const ctx = makeCtx({
      transaction: { findUnique: jest.fn().mockResolvedValue(tx) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    });
    await expect(
      allocatePaymentTool.handler(
        {
          transactionId: 'tx-1',
          invoiceId: 'inv-1',
          amountCents: 100,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('rejects over-allocation', async () => {
    const { tx, invoice } = buildTxAndInvoice({ outstanding: 30000 });
    const ctx = makeCtx({
      transaction: { findUnique: jest.fn().mockResolvedValue(tx) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    });
    await expect(
      allocatePaymentTool.handler(
        {
          transactionId: 'tx-1',
          invoiceId: 'inv-1',
          amountCents: 50000,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'OVER_ALLOCATION' });
  });

  it('rejects allocating a debit', async () => {
    const { tx, invoice } = buildTxAndInvoice({ isCredit: false });
    const ctx = makeCtx({
      transaction: { findUnique: jest.fn().mockResolvedValue(tx) },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    });
    await expect(
      allocatePaymentTool.handler(
        {
          transactionId: 'tx-1',
          invoiceId: 'inv-1',
          amountCents: 100,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
  });

  it('writes atomically through $transaction on confirm', async () => {
    const { tx, invoice } = buildTxAndInvoice();
    const findTx = jest.fn().mockResolvedValue(tx);
    const findInv = jest.fn().mockResolvedValue(invoice);
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'pay-99' });
    const invoiceUpdate = jest.fn().mockResolvedValue({
      id: 'inv-1',
      amountPaidCents: 100000,
      totalCents: 100000,
      status: 'PAID',
    });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'log-1' });
    const $transaction = jest
      .fn()
      .mockImplementation(async (cb: (client: unknown) => Promise<unknown>) => {
        const tx2 = {
          payment: { create: paymentCreate },
          invoice: { update: invoiceUpdate },
          auditLog: { create: auditCreate },
        };
        return cb(tx2);
      });
    const ctx = makeCtx({
      transaction: { findUnique: findTx },
      invoice: { findUnique: findInv },
      $transaction,
    });

    const res = (await allocatePaymentTool.handler(
      {
        transactionId: 'tx-1',
        invoiceId: 'inv-1',
        amountCents: 100000,
        confirm: true,
      },
      ctx,
    )) as { allocated: boolean; paymentId: string; invoiceStatus: string };

    expect(res.allocated).toBe(true);
    expect(res.paymentId).toBe('pay-99');
    expect(res.invoiceStatus).toBe('PAID');
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          entityType: 'invoice',
          entityId: 'inv-1',
          action: 'MATCH',
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// run_payment_matching
// ─────────────────────────────────────────────────────────────────────

describe('run_payment_matching', () => {
  it('previews candidates without writing', async () => {
    const findManyTx = jest.fn().mockResolvedValue([
      {
        id: 'tx-a',
        amountCents: 15000,
        reference: 'INV-42',
        payeeName: 'JANE',
        date: new Date('2026-06-01'),
      },
    ]);
    const findManyInv = jest
      .fn()
      .mockResolvedValue([
        { id: 'inv-42', invoiceNumber: 'INV-42', parentId: 'p1' },
      ]);
    const auditCreate = jest.fn();
    const ctx = makeCtx({
      transaction: { findMany: findManyTx },
      invoice: { findMany: findManyInv },
      auditLog: { create: auditCreate },
    });

    const res = (await runPaymentMatchingTool.handler({}, ctx)) as {
      preview: boolean;
      proposals: Array<{ matchReason: string }>;
    };

    expect(res.preview).toBe(true);
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0].matchReason).toBe('EXACT_AMOUNT+REFERENCE');
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('audit-logs on confirm and does not run the real matcher', async () => {
    const findManyTx = jest.fn().mockResolvedValue([]);
    const findManyInv = jest.fn().mockResolvedValue([]);
    const auditCreate = jest.fn().mockResolvedValue({ id: 'log' });
    const ctx = makeCtx({
      transaction: { findMany: findManyTx },
      invoice: { findMany: findManyInv },
      auditLog: { create: auditCreate },
    });

    const res = (await runPaymentMatchingTool.handler(
      { confirm: true, minConfidence: 0.85 },
      ctx,
    )) as { queued: boolean; message: string };

    expect(res.queued).toBe(true);
    expect(res.message).toMatch(/PaymentMatchingService/);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          entityType: 'payment_match_run',
          action: 'MATCH',
        }),
      }),
    );
  });

  it('rejects an out-of-range minConfidence', async () => {
    const ctx = makeCtx({
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    });
    await expect(
      runPaymentMatchingTool.handler({ minConfidence: 5 }, ctx),
    ).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ─────────────────────────────────────────────────────────────────────
// categorize_transactions
// ─────────────────────────────────────────────────────────────────────

describe('categorize_transactions', () => {
  it('previews without writing when confirm is omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        tenantId: TENANT,
        status: 'PENDING',
        payeeName: 'X',
        amountCents: 100,
      },
    ]);
    const $transaction = jest.fn();
    const ctx = makeCtx({
      transaction: { findMany },
      $transaction,
    });

    const res = (await categorizeTransactionsTool.handler(
      {
        transactionIds: ['t1'],
        accountCode: '5100',
        accountName: 'Groceries',
      },
      ctx,
    )) as { preview: boolean; would: { transactionCount: number } };

    expect(res.preview).toBe(true);
    expect(res.would.transactionCount).toBe(1);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('rejects when any tx belongs to another tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        tenantId: TENANT,
        status: 'PENDING',
        payeeName: 'X',
        amountCents: 100,
      },
      {
        id: 't2',
        tenantId: 'other-tenant',
        status: 'PENDING',
        payeeName: 'Y',
        amountCents: 200,
      },
    ]);
    const ctx = makeCtx({ transaction: { findMany }, $transaction: jest.fn() });
    await expect(
      categorizeTransactionsTool.handler(
        {
          transactionIds: ['t1', 't2'],
          accountCode: '5100',
          accountName: 'Groceries',
          confirm: true,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('rejects when transactionIds contain unknown ids', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        tenantId: TENANT,
        status: 'PENDING',
        payeeName: 'X',
        amountCents: 100,
      },
    ]);
    const ctx = makeCtx({ transaction: { findMany }, $transaction: jest.fn() });
    await expect(
      categorizeTransactionsTool.handler(
        {
          transactionIds: ['t1', 't-missing'],
          accountCode: '5100',
          accountName: 'Groceries',
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('writes a Categorization per tx + audit-logs on confirm', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        tenantId: TENANT,
        status: 'PENDING',
        payeeName: 'X',
        amountCents: 100,
      },
      {
        id: 't2',
        tenantId: TENANT,
        status: 'PENDING',
        payeeName: 'Y',
        amountCents: 200,
      },
    ]);
    const catCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'c1' })
      .mockResolvedValueOnce({ id: 'c2' });
    const txUpdate = jest.fn().mockResolvedValue({});
    const auditCreate = jest.fn().mockResolvedValue({});
    const $transaction = jest
      .fn()
      .mockImplementation(async (cb: (client: unknown) => Promise<unknown>) => {
        const client = {
          categorization: { create: catCreate },
          transaction: { update: txUpdate },
          auditLog: { create: auditCreate },
        };
        return cb(client);
      });
    const ctx = makeCtx({ transaction: { findMany }, $transaction });

    const res = (await categorizeTransactionsTool.handler(
      {
        transactionIds: ['t1', 't2'],
        accountCode: '5100',
        accountName: 'Groceries',
        vatType: 'STANDARD',
        confidence: 92,
        reasoning: 'Payee matches historical grocery vendor',
        confirm: true,
      },
      ctx,
    )) as { categorized: boolean; transactionCount: number };

    expect(res.categorized).toBe(true);
    expect(res.transactionCount).toBe(2);
    expect(catCreate).toHaveBeenCalledTimes(2);
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          entityType: 'transaction',
          action: 'CATEGORIZE',
        }),
      }),
    );
  });
});
