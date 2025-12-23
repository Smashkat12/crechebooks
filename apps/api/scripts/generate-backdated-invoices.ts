/**
 * Generate Backdated Invoices Script
 *
 * This script reads the Students.csv file and generates invoices
 * from each student's admission date until their leaving date (or current).
 *
 * Fee structure by year:
 * - 2019-2023: R800/month (80000 cents)
 * - 2024: R850/month (85000 cents)
 * - 2025: R950/month (95000 cents)
 *
 * Business Rules:
 * - Billing starts from admission MONTH (not day)
 * - If student left, last billing is the month BEFORE leaving date
 * - 10% sibling discount for second child of same parent
 *
 * Usage: npx ts-node scripts/generate-backdated-invoices.ts [--clean]
 *        --clean: Delete all existing invoices before generating
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Prisma 7 requires adapter for database connections
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_ID = 'DEMO_TENANT_ID';
const SYSTEM_USER_ID = '01j9z7d695h6sq7jdc566rr4qf'; // Admin user

// Business start date - Think M8 ECD T/A Elle Elephant started June 2023
// No invoices should be generated before this date
const BUSINESS_START_DATE = new Date(Date.UTC(2023, 5, 1)); // June 1, 2023

// Parse command line arguments
const shouldClean = process.argv.includes('--clean');
const verbose = process.argv.includes('--verbose');

// Fee amounts by year (in cents)
const FEE_BY_YEAR: Record<number, number> = {
  2019: 80000, // R800 (same as 2023 for older records)
  2020: 80000,
  2021: 80000,
  2022: 80000,
  2023: 80000, // R800
  2024: 85000, // R850
  2025: 95000, // R950
};

// Sibling discount percentage
const SIBLING_DISCOUNT_PERCENT = 10;

interface StudentRecord {
  no: number;
  name: string;
  number: string;
  family: string;
  gender: string;
  classType: string;
  admissionDate: Date;
  status: string;
  leftDate?: Date;
}

interface ChildMatch {
  id: string;
  firstName: string;
  lastName: string;
  parentId: string;
  feeStructureId: string;
  feeStructureName: string;
}

// Parse CSV file
function parseCSV(filePath: string): StudentRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const records: StudentRecord[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',');

    if (parts.length < 8) continue;

    const no = parseInt(parts[0], 10);
    const name = parts[1].trim();
    const number = parts[2].trim();
    const family = parts[3].trim();
    const gender = parts[4].trim();
    const classType = parts[5].trim().split('/')[0]; // Get class name without suffix
    const admissionDateStr = parts[6].trim();
    const status = parts[7].trim();

    const admissionDate = new Date(admissionDateStr);

    let leftDate: Date | undefined;
    if (status.startsWith('Left on ')) {
      const leftDateStr = status.replace('Left on ', '');
      leftDate = new Date(leftDateStr);
    }

    records.push({
      no,
      name,
      number,
      family,
      gender,
      classType,
      admissionDate,
      status,
      leftDate,
    });
  }

  return records;
}

// Map class names to fee structure names
function mapClassToFeeStructure(classType: string): string {
  const mapping: Record<string, string> = {
    'Ducks': 'Ducks',
    'Elephants': 'Elephants',
    'Leavers': 'Leavers',
    'Grade R': 'Grade R',
    'Grade RR': 'Grade RR',
  };
  return mapping[classType] || 'Elephants'; // Default to Elephants
}

// Get fee amount for a given year
function getFeeForYear(year: number): number {
  return FEE_BY_YEAR[year] || FEE_BY_YEAR[2025];
}

/**
 * Calculate the last billing month for a student who left.
 * Business rule: if a student leaves on day N of month M, their last billing is:
 * - Month M-1 if N <= 7 (left in first week, no billing for that month)
 * - Month M if N > 7 (left after first week, bill for partial month)
 *
 * For simplicity (and to be safe), we always bill through the month BEFORE leaving.
 * This ensures students are never overbilled.
 */
function getLastBillingMonth(leftDate: Date): Date {
  // Go back to the previous month
  const lastMonth = new Date(leftDate.getFullYear(), leftDate.getMonth() - 1, 1);
  return lastMonth;
}

/**
 * Generate all billing months between start and end dates (inclusive).
 * Both dates are normalized to the 1st of their respective months.
 */
function generateBillingMonths(startDate: Date, endDate: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];

  // Normalize to first of month
  let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  // Validate dates
  if (current > end) {
    console.error(`ERROR: Start date ${current.toISOString()} is after end date ${end.toISOString()}`);
    return [];
  }

  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1, // 1-indexed (1=Jan, 12=Dec)
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

// Generate invoice number
async function generateInvoiceNumber(year: number): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      tenantId: TENANT_ID,
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
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequential = lastSeq + 1;
      }
    }
  }

  return `INV-${year}-${sequential.toString().padStart(3, '0')}`;
}

async function main() {
  console.log('=== Backdated Invoice Generation Script ===\n');
  console.log(`Options: clean=${shouldClean}, verbose=${verbose}\n`);

  // 0. Clean existing invoices if requested
  if (shouldClean) {
    console.log('Cleaning existing invoices...');

    // First delete invoice lines (foreign key constraint)
    const deletedLines = await prisma.invoiceLine.deleteMany({
      where: {
        invoice: {
          tenantId: TENANT_ID,
        },
      },
    });
    console.log(`  Deleted ${deletedLines.count} invoice lines`);

    // Then delete invoices
    const deletedInvoices = await prisma.invoice.deleteMany({
      where: {
        tenantId: TENANT_ID,
      },
    });
    console.log(`  Deleted ${deletedInvoices.count} invoices\n`);
  }

  // 1. Read and parse CSV
  const csvPath = path.join(__dirname, '../../..', 'docs/data/Students.csv');
  console.log(`Reading CSV from: ${csvPath}`);

  const studentRecords = parseCSV(csvPath);
  console.log(`Found ${studentRecords.length} student records in CSV\n`);

  // 2. Get all children from database
  const children = await prisma.child.findMany({
    where: { tenantId: TENANT_ID },
    include: {
      parent: true,
      enrollments: {
        include: {
          feeStructure: true,
        },
      },
    },
  });
  console.log(`Found ${children.length} children in database\n`);

  // 3. Get fee structures
  const feeStructures = await prisma.feeStructure.findMany({
    where: { tenantId: TENANT_ID },
  });
  const feeStructureMap = new Map(feeStructures.map(fs => [fs.name, fs.id]));
  console.log(`Found ${feeStructures.length} fee structures\n`);

  // 4. Match CSV records to database children
  const matches: Array<{ student: StudentRecord; child: typeof children[0] }> = [];

  for (const student of studentRecords) {
    // Parse name (format: "Lastname Firstname")
    const nameParts = student.name.split(' ');
    const lastName = nameParts[0];
    const firstName = nameParts.slice(1).join(' ');

    const child = children.find(c =>
      c.lastName.toLowerCase() === lastName.toLowerCase() &&
      c.firstName.toLowerCase() === firstName.toLowerCase()
    );

    if (child) {
      matches.push({ student, child });
    } else {
      console.log(`WARNING: No match for ${student.name}`);
    }
  }

  console.log(`\nMatched ${matches.length} students to database children\n`);

  // 5. Determine end date (current month or leaving date)
  const now = new Date();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // 6. Group children by parent for sibling discount calculation
  const childrenByParent = new Map<string, Array<{ student: StudentRecord; child: typeof children[0] }>>();

  for (const match of matches) {
    const parentId = match.child.parentId;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId)!.push(match);
  }

  // 7. Generate invoices
  let totalInvoices = 0;
  let totalAmount = 0;
  const invoicesByYear: Record<number, number> = {};
  const amountByYear: Record<number, number> = {};

  for (const [parentId, familyMembers] of childrenByParent) {
    // Sort by admission date to determine who gets sibling discount
    const sortedMembers = [...familyMembers].sort(
      (a, b) => a.student.admissionDate.getTime() - b.student.admissionDate.getTime()
    );

    for (let childIndex = 0; childIndex < sortedMembers.length; childIndex++) {
      const { student, child } = sortedMembers[childIndex];

      // Determine billing start date
      // Use the later of: admission date OR business start date (June 2023)
      const admissionMonth = new Date(Date.UTC(
        student.admissionDate.getFullYear(),
        student.admissionDate.getMonth(),
        1
      ));
      const billingStartDate = admissionMonth >= BUSINESS_START_DATE ? admissionMonth : BUSINESS_START_DATE;

      // Determine billing end date
      // If student left, use the month BEFORE they left
      // If current, use current month
      let billingEndDate: Date;
      if (student.leftDate) {
        billingEndDate = getLastBillingMonth(student.leftDate);
      } else {
        billingEndDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)); // Current month
      }

      // Skip students who left before the business started
      if (billingEndDate < BUSINESS_START_DATE) {
        console.log(`  SKIPPED: Left before business started (${billingEndDate.toISOString().split('T')[0]})`);
        continue;
      }

      // Validate: billing start must be before or equal to billing end
      if (billingStartDate > billingEndDate) {
        console.error(`ERROR: ${student.name} - billing start ${billingStartDate.toISOString()} is after billing end ${billingEndDate.toISOString()}`);
        console.error(`  This student was enrolled for less than a month after business started. Skipping.`);
        continue;
      }

      // Generate billing months (from the adjusted start date)
      const billingMonths = generateBillingMonths(billingStartDate, billingEndDate);

      // Get fee structure ID
      const feeStructureName = mapClassToFeeStructure(student.classType);
      const feeStructureId = feeStructureMap.get(feeStructureName);

      if (!feeStructureId) {
        console.error(`ERROR: No fee structure for class "${student.classType}". Skipping ${student.name}`);
        continue;
      }

      // Should this child get sibling discount?
      const hasSiblingDiscount = childIndex > 0;

      // Log student details
      const admissionStr = student.admissionDate.toISOString().split('T')[0];
      const leftStr = student.leftDate ? student.leftDate.toISOString().split('T')[0] : 'current';
      const firstBillingMonth = billingMonths.length > 0 ? `${billingMonths[0].year}-${String(billingMonths[0].month).padStart(2, '0')}` : 'N/A';
      const lastBillingMonth = billingMonths.length > 0 ? `${billingMonths[billingMonths.length - 1].year}-${String(billingMonths[billingMonths.length - 1].month).padStart(2, '0')}` : 'N/A';

      // Check if billing was adjusted due to business start date
      const wasAdjusted = admissionMonth < BUSINESS_START_DATE;

      console.log(`\n${student.name} (${student.classType})`);
      console.log(`  Admission: ${admissionStr} | Left: ${leftStr}`);
      if (wasAdjusted) {
        console.log(`  Billing: ${firstBillingMonth} to ${lastBillingMonth} (${billingMonths.length} months) [Adjusted from admission - business started Jun 2023]`);
      } else {
        console.log(`  Billing: ${firstBillingMonth} to ${lastBillingMonth} (${billingMonths.length} months)`);
      }
      console.log(`  Sibling Discount: ${hasSiblingDiscount ? 'Yes (10%)' : 'No'}`);

      for (const { year, month } of billingMonths) {
        // Check if invoice already exists
        // IMPORTANT: Use UTC dates to prevent timezone issues with PostgreSQL DATE columns
        // Local time dates get truncated to the UTC date portion, causing off-by-one-month errors
        const billingPeriodStart = new Date(Date.UTC(year, month - 1, 1));
        const billingPeriodEnd = new Date(Date.UTC(year, month, 0));

        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            tenantId: TENANT_ID,
            childId: child.id,
            billingPeriodStart,
            billingPeriodEnd,
          },
        });

        if (existingInvoice) {
          continue; // Skip existing invoices
        }

        // Get fee for this year
        const baseFee = getFeeForYear(year);

        // Calculate discount if applicable
        const discountAmount = hasSiblingDiscount ? Math.round(baseFee * SIBLING_DISCOUNT_PERCENT / 100) : 0;
        const subtotal = baseFee - discountAmount;
        const vatAmount = 0; // Educational services are VAT exempt
        const total = subtotal;

        // Generate invoice number
        const invoiceNumber = await generateInvoiceNumber(year);

        // Set issue date and due date (7 days after issue)
        // Use UTC dates for consistency with DATE columns
        const issueDate = new Date(Date.UTC(year, month - 1, 1));
        const dueDate = new Date(Date.UTC(year, month - 1, 8)); // 7 days after issue

        // Create invoice
        const invoice = await prisma.invoice.create({
          data: {
            tenantId: TENANT_ID,
            invoiceNumber,
            parentId: child.parentId,
            childId: child.id,
            billingPeriodStart,
            billingPeriodEnd,
            issueDate,
            dueDate,
            subtotalCents: subtotal,
            vatCents: vatAmount,
            totalCents: total,
            status: 'DRAFT',
          },
        });

        // Create line items
        await prisma.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            description: feeStructureName,
            quantity: 1,
            unitPriceCents: baseFee,
            discountCents: 0,
            subtotalCents: baseFee,
            vatCents: 0,
            totalCents: baseFee,
            lineType: 'MONTHLY_FEE',
            accountCode: '4000',
            sortOrder: 0,
          },
        });

        // Add discount line if applicable
        if (discountAmount > 0) {
          await prisma.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              description: `Sibling Discount (${SIBLING_DISCOUNT_PERCENT}%)`,
              quantity: 1,
              unitPriceCents: -discountAmount,
              discountCents: 0,
              subtotalCents: -discountAmount,
              vatCents: 0,
              totalCents: -discountAmount,
              lineType: 'DISCOUNT',
              accountCode: '4000',
              sortOrder: 1,
            },
          });
        }

        totalInvoices++;
        totalAmount += total;
        invoicesByYear[year] = (invoicesByYear[year] || 0) + 1;
        amountByYear[year] = (amountByYear[year] || 0) + total;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('=== GENERATION SUMMARY ===');
  console.log('='.repeat(60));
  console.log(`Total invoices created: ${totalInvoices}`);
  console.log(`Total amount: R ${(totalAmount / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
  console.log('\nBreakdown by year:');
  for (const year of Object.keys(invoicesByYear).sort()) {
    const count = invoicesByYear[parseInt(year)];
    const amount = amountByYear[parseInt(year)];
    console.log(`  ${year}: ${count} invoices, R ${(amount / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
  }
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  prisma.$disconnect();
  process.exit(1);
});
