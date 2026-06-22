/**
 * Backfill Invoice Paid Script
 *
 * Recomputes amountPaidCents and status for every invoice from its payment rows.
 * Runs globally across all tenants (app-level multi-tenancy, no RLS).
 *
 * Usage (dry-run, default — writes nothing):
 *   npx tsx scripts/backfill-invoice-paid.ts
 *
 * Usage (apply writes):
 *   BACKFILL_APPLY=1 npx tsx scripts/backfill-invoice-paid.ts
 *   # or
 *   npx tsx scripts/backfill-invoice-paid.ts --apply
 *
 * Exit codes:
 *   0  — no drift found (or all drift corrected in apply mode)
 *   1  — drift remains after apply (or unexpected error)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { deriveInvoiceStatus } from '../src/database/repositories/invoice.repository';
import { InvoiceStatus } from '../src/database/entities/invoice.entity';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const applyWrites =
  process.argv.includes('--apply') || process.env.BACKFILL_APPLY === '1';

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BATCH_SIZE = 500;

interface DriftRow {
  invoiceId: string;
  tenantId: string;
  invoiceNumber: string;
  storedPaid: number;
  derivedPaid: number;
  storedStatus: string;
  derivedStatus: InvoiceStatus;
}

async function run(): Promise<void> {
  console.log('='.repeat(80));
  console.log('BACKFILL: Invoice amountPaidCents + status');
  console.log('='.repeat(80));
  console.log(`Mode: ${applyWrites ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`);
  console.log('');

  let cursor: string | undefined = undefined;
  let totalInspected = 0;
  const driftRows: DriftRow[] = [];

  // Paginated scan of all invoices globally
  while (true) {
    const batch = await prisma.invoice.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        tenantId: true,
        invoiceNumber: true,
        totalCents: true,
        amountPaidCents: true,
        status: true,
      },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    totalInspected += batch.length;

    for (const invoice of batch) {
      // Derive paid from payment rows
      const aggregate = await prisma.payment.aggregate({
        where: {
          invoiceId: invoice.id,
          isReversed: false,
          deletedAt: null,
        },
        _sum: { amountCents: true },
      });
      const derivedPaid = aggregate._sum.amountCents ?? 0;
      const clampedPaid = Math.max(0, Math.min(derivedPaid, invoice.totalCents));

      const derivedStatus = deriveInvoiceStatus(
        clampedPaid,
        invoice.totalCents,
        invoice.status as InvoiceStatus,
      );

      const paidDrifts = invoice.amountPaidCents !== clampedPaid;
      const statusDrifts = invoice.status !== derivedStatus;

      if (paidDrifts || statusDrifts) {
        driftRows.push({
          invoiceId: invoice.id,
          tenantId: invoice.tenantId,
          invoiceNumber: invoice.invoiceNumber,
          storedPaid: invoice.amountPaidCents,
          derivedPaid: clampedPaid,
          storedStatus: invoice.status,
          derivedStatus,
        });
      }
    }

    process.stdout.write(`\rInspected ${totalInspected} invoices, drift so far: ${driftRows.length}`);
  }

  console.log('');
  console.log('');

  if (driftRows.length === 0) {
    console.log('No drift detected. All invoices are consistent.');
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }

  // Log drift details
  console.log(`Drift detected in ${driftRows.length} invoice(s):`);
  console.log('');
  for (const row of driftRows) {
    const paidChange = row.storedPaid !== row.derivedPaid
      ? `  paid: ${row.storedPaid} -> ${row.derivedPaid} (delta: ${row.derivedPaid - row.storedPaid})`
      : '';
    const statusChange = row.storedStatus !== row.derivedStatus
      ? `  status: ${row.storedStatus} -> ${row.derivedStatus}`
      : '';
    console.log(`  ${row.invoiceId} | tenant=${row.tenantId} | inv=${row.invoiceNumber}`);
    if (paidChange) console.log(paidChange);
    if (statusChange) console.log(statusChange);
  }

  const totalDeltaCents = driftRows.reduce(
    (sum, r) => sum + (r.derivedPaid - r.storedPaid),
    0,
  );
  console.log('');
  console.log(`Total drift rows: ${driftRows.length}`);
  console.log(`Net delta cents across all invoices: ${totalDeltaCents}`);
  console.log('');

  if (!applyWrites) {
    console.log('DRY-RUN: no writes performed. Re-run with --apply or BACKFILL_APPLY=1 to fix.');
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  }

  // Apply corrections — one small transaction per invoice.
  // IMPORTANT (live DB safety): re-derive paid + status INSIDE the tx so a payment
  // landing between scan and apply is not clobbered with a stale value. Only write
  // if drift still exists at the moment of the transaction.
  console.log('Applying corrections...');
  let failCount = 0;
  let appliedCount = 0;
  let skippedCount = 0;
  for (const row of driftRows) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: row.invoiceId },
          select: {
            totalCents: true,
            amountPaidCents: true,
            status: true,
          },
        });
        // Invoice could have been deleted between scan and apply.
        if (!invoice) return 'skipped' as const;

        // Re-run the same aggregate filter at write-time.
        const aggregate = await tx.payment.aggregate({
          where: {
            invoiceId: row.invoiceId,
            isReversed: false,
            deletedAt: null,
          },
          _sum: { amountCents: true },
        });
        const derivedPaid = aggregate._sum.amountCents ?? 0;
        const clampedPaid = Math.max(
          0,
          Math.min(derivedPaid, invoice.totalCents),
        );
        const derivedStatus = deriveInvoiceStatus(
          clampedPaid,
          invoice.totalCents,
          invoice.status as InvoiceStatus,
        );

        // Idempotent: only write if drift still exists at this instant.
        if (
          invoice.amountPaidCents === clampedPaid &&
          invoice.status === derivedStatus
        ) {
          return 'skipped' as const;
        }

        await tx.invoice.update({
          where: { id: row.invoiceId },
          data: { amountPaidCents: clampedPaid, status: derivedStatus },
        });
        return 'applied' as const;
      });

      if (result === 'applied') appliedCount++;
      else skippedCount++;
    } catch (err) {
      console.error(`  FAILED to update ${row.invoiceId}: ${err instanceof Error ? err.message : String(err)}`);
      failCount++;
    }
  }

  console.log('');
  console.log(
    `Apply complete: ${appliedCount} corrected, ${skippedCount} already-consistent at write-time, ${failCount} failed.`,
  );
  if (failCount === 0) {
    console.log('Done.');
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  } else {
    console.error(`${failCount} of ${driftRows.length} corrections failed. Drift remains.`);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Unexpected error:', error);
  prisma.$disconnect().catch(() => undefined);
  pool.end().catch(() => undefined);
  process.exit(1);
});
