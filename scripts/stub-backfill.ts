#!/usr/bin/env ts-node
/**
 * Stub.africa Backfill Script
 * TASK-STUB-PARITY: Push existing CrecheBooks data to Stub.
 *
 * Pushes:
 * 1. All 2026 invoices as sales via pushSale()
 * 2. All categorized expenses via pushExpense()
 * 3. All allocated payments as income via pushIncome()
 *
 * Idempotent: uses deterministic IDs (cb-inv-{id}, cb-exp-{id}, cb-pmt-{id}).
 * Rate-limited: 200ms delay between requests to respect Stub API limits.
 *
 * Usage:
 *   npx ts-node scripts/stub-backfill.ts [--dry-run] [--from 2026-01-01] [--tenant TENANT_ID]
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const FROM_DATE = fromIdx >= 0 ? args[fromIdx + 1] : '2026-01-01';
const tenantIdx = args.indexOf('--tenant');
const TENANT_ID =
  tenantIdx >= 0
    ? args[tenantIdx + 1]
    : process.env.CB_TENANT_ID ?? 'bdff4374-64d5-420c-b454-8e85e9df552a';

const STUB_API_KEY = process.env.STUB_API_KEY ?? '';
const STUB_APP_ID = process.env.STUB_APP_ID ?? '';
const STUB_BASE_URL =
  process.env.STUB_BASE_URL ?? 'https://connect.stub.africa';
const RATE_LIMIT_MS = 200;

interface Stats {
  invoices: { pushed: number; skipped: number; failed: number };
  expenses: { pushed: number; skipped: number; failed: number };
  payments: { pushed: number; skipped: number; failed: number };
}

const stats: Stats = {
  invoices: { pushed: 0, skipped: 0, failed: 0 },
  expenses: { pushed: 0, skipped: 0, failed: 0 },
  payments: { pushed: 0, skipped: 0, failed: 0 },
};

async function getStubUid(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ stub_business_uid: string }>>`
    SELECT stub_business_uid FROM stub_connections
    WHERE tenant_id = ${TENANT_ID} AND is_active = true LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].stub_business_uid) {
    throw new Error(
      `No active Stub connection for tenant ${TENANT_ID}. Connect via Settings first.`,
    );
  }
  return rows[0].stub_business_uid;
}

async function stubPost(
  endpoint: string,
  uid: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] POST ${endpoint}`, JSON.stringify(data).slice(0, 200));
    return;
  }

  await axios.post(`${STUB_BASE_URL}${endpoint}`, {
    apikey: STUB_API_KEY,
    appid: STUB_APP_ID,
    uid,
    data,
  });
}

function centsToRands(cents: number): number {
  return Math.round(cents) / 100;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillInvoices(uid: string): Promise<void> {
  console.log('\n--- Backfilling Invoices as Sales ---');

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: TENANT_ID,
      isDeleted: false,
      issueDate: { gte: new Date(FROM_DATE) },
    },
    include: {
      parent: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      lines: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { issueDate: 'asc' },
  });

  console.log(`  Found ${invoices.length} invoices to push`);

  for (const inv of invoices) {
    const saleId = `cb-inv-${inv.id}`;

    try {
      const sale: Record<string, unknown> = {
        id: saleId,
        items: inv.lines.map((line) => ({
          id: `cb-line-${line.id}`,
          name: line.description,
          price: centsToRands(line.unitPriceCents),
          quantity: Number(line.quantity),
        })),
        customer: {
          id: `cb-parent-${inv.parent.id}`,
          name: `${inv.parent.firstName} ${inv.parent.lastName}`,
          email: inv.parent.email ?? undefined,
        },
      };

      // Include payment if invoice is paid
      if (inv.status === 'PAID') {
        sale.payment = {
          id: `cb-inv-pmt-${inv.id}`,
          date: inv.issueDate.toISOString().split('T')[0],
          name: `${inv.invoiceNumber} - ${inv.parent.firstName} ${inv.parent.lastName}`,
          currency: 'ZAR',
          amount: centsToRands(inv.totalCents),
        };
      }

      await stubPost('/api/push/sale', uid, sale);
      stats.invoices.pushed++;
      console.log(
        `  ✓ ${inv.invoiceNumber} (${inv.status}) → ${saleId}`,
      );
    } catch (err) {
      stats.invoices.failed++;
      console.error(
        `  ✗ ${inv.invoiceNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await sleep(RATE_LIMIT_MS);
  }
}

async function backfillExpenses(uid: string): Promise<void> {
  console.log('\n--- Backfilling Categorized Expenses ---');

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId: TENANT_ID,
      isCredit: false,
      status: 'CATEGORIZED',
      date: { gte: new Date(FROM_DATE) },
    },
    include: {
      categorizations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { date: 'asc' },
  });

  console.log(`  Found ${transactions.length} categorized expenses to push`);

  for (const tx of transactions) {
    const expenseId = `cb-exp-${tx.id}`;
    const cat = tx.categorizations[0];

    if (!cat) {
      stats.expenses.skipped++;
      continue;
    }

    try {
      await stubPost('/api/push/expense', uid, {
        id: expenseId,
        date: tx.date.toISOString().split('T')[0],
        name: tx.description,
        category: cat.accountName ?? 'General Expenses',
        notes: tx.reference ?? undefined,
        currency: 'ZAR',
        amount: centsToRands(Math.abs(tx.amountCents)),
      });
      stats.expenses.pushed++;
      console.log(`  ✓ ${tx.description.slice(0, 40)} → ${expenseId}`);
    } catch (err) {
      stats.expenses.failed++;
      console.error(
        `  ✗ ${tx.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await sleep(RATE_LIMIT_MS);
  }
}

async function backfillPayments(uid: string): Promise<void> {
  console.log('\n--- Backfilling Allocated Payments as Income ---');

  const payments = await prisma.payment.findMany({
    where: {
      tenantId: TENANT_ID,
      isReversed: false,
      paymentDate: { gte: new Date(FROM_DATE) },
    },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          parent: { select: { firstName: true, lastName: true } },
          lines: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
    orderBy: { paymentDate: 'asc' },
  });

  console.log(`  Found ${payments.length} payments to push`);

  for (const pmt of payments) {
    const paymentId = `cb-pmt-${pmt.id}`;
    const parentName = pmt.invoice?.parent
      ? `${pmt.invoice.parent.firstName} ${pmt.invoice.parent.lastName}`
      : 'Unknown';
    const invoiceRef = pmt.invoice?.invoiceNumber ?? pmt.invoiceId;

    try {
      await stubPost('/api/push/income', uid, {
        id: paymentId,
        date: pmt.paymentDate.toISOString().split('T')[0],
        name: `${invoiceRef} - ${parentName}`,
        category: 'School fees',
        notes: pmt.reference
          ? `Ref: ${pmt.reference}`
          : `Payment for ${invoiceRef}`,
        currency: 'ZAR',
        amount: centsToRands(pmt.amountCents),
      });
      stats.payments.pushed++;
      console.log(`  ✓ ${invoiceRef} R${centsToRands(pmt.amountCents)} → ${paymentId}`);
    } catch (err) {
      stats.payments.failed++;
      console.error(
        `  ✗ ${pmt.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await sleep(RATE_LIMIT_MS);
  }
}

async function main(): Promise<void> {
  console.log('=== Stub.africa Backfill ===');
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  From:   ${FROM_DATE}`);
  console.log(`  Mode:   ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  if (!DRY_RUN && (!STUB_API_KEY || !STUB_APP_ID)) {
    console.error('ERROR: STUB_API_KEY and STUB_APP_ID env vars required');
    process.exit(1);
  }

  const uid = await getStubUid();
  console.log(`  Stub UID: ${uid}`);

  await backfillInvoices(uid);
  await backfillExpenses(uid);
  await backfillPayments(uid);

  console.log('\n=== Summary ===');
  console.log(`  Invoices:  ${stats.invoices.pushed} pushed, ${stats.invoices.failed} failed, ${stats.invoices.skipped} skipped`);
  console.log(`  Expenses:  ${stats.expenses.pushed} pushed, ${stats.expenses.failed} failed, ${stats.expenses.skipped} skipped`);
  console.log(`  Payments:  ${stats.payments.pushed} pushed, ${stats.payments.failed} failed, ${stats.payments.skipped} skipped`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  prisma.$disconnect().then(() => process.exit(1));
});
