import 'dotenv/config';
import { PrismaClient, InvoiceStatus, LineType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// Database setup
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Constants
const DEMO_TENANT_ID = 'ee937a14-3c81-4e74-ab10-8d2936c5bc2e';
const VAT_RATE = new Decimal('0.15');
const DEFAULT_DUE_DAYS = 7;
const SCHOOL_FEES_ACCOUNT = '4000';

/**
 * Generate invoice number
 */
async function generateInvoiceNumber(year: number): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      tenantId: DEMO_TENANT_ID,
      invoiceNumber: {
        startsWith: `INV-${year}-`,
      },
    },
    orderBy: {
      invoiceNumber: 'desc',
    },
  });

  let sequential = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-');
    if (parts.length === 3) {
      const lastSequential = parseInt(parts[2], 10);
      if (!isNaN(lastSequential)) {
        sequential = lastSequential + 1;
      }
    }
  }

  return `INV-${year}-${sequential.toString().padStart(3, '0')}`;
}

/**
 * Calculate VAT using banker's rounding
 */
function calculateVAT(amountCents: number): number {
  const amount = new Decimal(amountCents);
  const vat = amount.mul(VAT_RATE);
  return vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * Generate invoices for a specific month
 */
async function generateMonthlyInvoices(billingMonth: string): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  console.log(`\n📅 Generating invoices for ${billingMonth}...`);

  const [yearStr, monthStr] = billingMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const billingPeriodStart = new Date(year, month - 1, 1);
  const billingPeriodEnd = new Date(year, month, 0); // Last day of month

  // Get tenant VAT status
  const tenant = await prisma.tenant.findUnique({
    where: { id: DEMO_TENANT_ID },
  });
  const isVatRegistered = tenant?.taxStatus === 'VAT_REGISTERED';

  // Get active enrollments with relations
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: DEMO_TENANT_ID,
      status: 'ACTIVE',
    },
    include: {
      child: {
        include: {
          parent: true,
        },
      },
      feeStructure: true,
    },
  });

  console.log(`   Found ${enrollments.length} active enrollments`);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const enrollment of enrollments) {
    const childName = `${enrollment.child.firstName} ${enrollment.child.lastName}`;

    // Check for existing invoice
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        tenantId: DEMO_TENANT_ID,
        childId: enrollment.childId,
        billingPeriodStart,
        billingPeriodEnd,
      },
    });

    if (existingInvoice) {
      skipped++;
      continue;
    }

    try {
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(year);

      // Calculate dates
      const issueDate = new Date(year, month - 1, 1); // 1st of billing month
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);

      // Get monthly fee
      const monthlyFeeCents = enrollment.customFeeOverrideCents ?? enrollment.feeStructure.amountCents;

      // Calculate VAT
      const vatCents = isVatRegistered ? calculateVAT(monthlyFeeCents) : 0;
      const totalCents = monthlyFeeCents + vatCents;

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          id: randomUUID(),
          tenantId: DEMO_TENANT_ID,
          invoiceNumber,
          parentId: enrollment.child.parentId,
          childId: enrollment.childId,
          billingPeriodStart,
          billingPeriodEnd,
          issueDate,
          dueDate,
          subtotalCents: monthlyFeeCents,
          vatCents,
          totalCents,
          status: InvoiceStatus.SENT, // Mark as sent for testing
        },
      });

      // Create invoice line
      await prisma.invoiceLine.create({
        data: {
          id: randomUUID(),
          invoiceId: invoice.id,
          description: `${enrollment.feeStructure.name} - ${billingMonth}`,
          quantity: 1,
          unitPriceCents: monthlyFeeCents,
          discountCents: 0,
          subtotalCents: monthlyFeeCents,
          vatCents,
          totalCents,
          lineType: LineType.MONTHLY_FEE,
          accountCode: SCHOOL_FEES_ACCOUNT,
          sortOrder: 0,
        },
      });

      created++;
      console.log(`   ✅ ${invoiceNumber}: ${childName} - R${(totalCents / 100).toFixed(2)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${childName}: ${errorMessage}`);
    }
  }

  return { created, skipped, errors };
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('🧾 Starting invoice generation...\n');

  // Generate invoices for the past 24 months (to match transaction dates)
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < 24; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    months.push(`${year}-${month}`);
  }

  // Sort chronologically
  months.sort();

  let totalCreated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const month of months) {
    const result = await generateMonthlyInvoices(month);
    totalCreated += result.created;
    totalSkipped += result.skipped;
    allErrors.push(...result.errors);
  }

  console.log('\n✨ Invoice generation complete!');
  console.log(`   📊 Total created: ${totalCreated}`);
  console.log(`   🔄 Skipped (duplicates): ${totalSkipped}`);
  if (allErrors.length > 0) {
    console.log(`   ❌ Errors: ${allErrors.length}`);
  }

  // Summary
  const invoiceCount = await prisma.invoice.count({
    where: { tenantId: DEMO_TENANT_ID },
  });

  const totalInvoiced = await prisma.invoice.aggregate({
    where: { tenantId: DEMO_TENANT_ID },
    _sum: { totalCents: true },
  });

  console.log(`\n📊 Invoice Summary:`);
  console.log(`   Total invoices: ${invoiceCount}`);
  console.log(`   Total invoiced: R${((totalInvoiced._sum.totalCents || 0) / 100).toFixed(2)}`);

  // Show recent invoices
  console.log('\n📝 Recent Invoices:');
  const recentInvoices = await prisma.invoice.findMany({
    where: { tenantId: DEMO_TENANT_ID },
    include: {
      child: true,
    },
    orderBy: { billingPeriodStart: 'desc' },
    take: 10,
  });

  for (const inv of recentInvoices) {
    const period = `${inv.billingPeriodStart.toISOString().split('T')[0].substring(0, 7)}`;
    console.log(`   ${inv.invoiceNumber}: ${inv.child.firstName} ${inv.child.lastName} - ${period} - R${(inv.totalCents / 100).toFixed(2)}`);
  }
}

main()
  .catch((error) => {
    console.error('\n💥 Invoice generation failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
