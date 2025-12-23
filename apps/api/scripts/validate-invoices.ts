/**
 * Validate Invoices Script
 *
 * This script validates that all generated invoices match the CSV source data.
 *
 * Usage: npx ts-node scripts/validate-invoices.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_ID = 'DEMO_TENANT_ID';

// Business start date - Think M8 ECD T/A Elle Elephant started June 2023
// No invoices should exist before this date
const BUSINESS_START_DATE = new Date(Date.UTC(2023, 5, 1)); // June 1, 2023

interface ValidationResult {
  name: string;
  admissionDate: Date;
  leftDate: Date | null;
  expectedFirst: string;
  expectedLast: string;
  expectedCount: number;
  actualFirst: string;
  actualLast: string;
  actualCount: number;
  isValid: boolean;
}

function formatMonth(d: Date): string {
  // Use UTC methods since database stores DATE columns in UTC
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function validate(): Promise<void> {
  console.log('='.repeat(80));
  console.log('VALIDATION: Invoice Data vs CSV Source');
  console.log('='.repeat(80));
  console.log('');

  // Read CSV
  const csvPath = '/home/smash/Documents/dev-env/Playground/ruv/crechebooks/docs/data/Students.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n').slice(1);

  const results: ValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 8) continue;

    const name = parts[1].trim();
    const admissionDateStr = parts[6].trim();
    const status = parts[7].trim();

    // Parse name
    const nameParts = name.split(' ');
    const lastName = nameParts[0];
    const firstName = nameParts.slice(1).join(' ');

    // Get child from DB
    const child = await prisma.child.findFirst({
      where: {
        tenantId: TENANT_ID,
        lastName: { equals: lastName, mode: 'insensitive' },
        firstName: { equals: firstName, mode: 'insensitive' },
      },
    });

    if (!child) {
      console.error(`ERROR: No database match for ${name}`);
      invalidCount++;
      continue;
    }

    // Get invoices
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: TENANT_ID, childId: child.id },
      orderBy: { billingPeriodStart: 'asc' },
    });

    // Parse dates from CSV
    const admissionDate = new Date(admissionDateStr);
    let leftDate: Date | null = null;
    if (status.startsWith('Left on ')) {
      leftDate = new Date(status.replace('Left on ', ''));
    }

    // Calculate expected months using UTC to match database storage
    // Use the later of: admission date OR business start date (June 2023)
    const admissionMonth = new Date(Date.UTC(admissionDate.getFullYear(), admissionDate.getMonth(), 1));
    const expectedFirstMonth = admissionMonth >= BUSINESS_START_DATE ? admissionMonth : BUSINESS_START_DATE;

    let expectedLastMonth: Date;
    if (leftDate) {
      // Last billing month is the month BEFORE they left
      expectedLastMonth = new Date(Date.UTC(leftDate.getFullYear(), leftDate.getMonth() - 1, 1));
    } else {
      // Current month (Dec 2025)
      expectedLastMonth = new Date(Date.UTC(2025, 11, 1));
    }

    // Skip students who left before the business started
    if (expectedLastMonth < BUSINESS_START_DATE) {
      console.log(`  SKIPPED: ${name} - Left before business started (Jun 2023)`);
      continue;
    }

    // Count expected months using UTC
    let expectedCount = 0;
    const m = new Date(expectedFirstMonth);
    while (m <= expectedLastMonth) {
      expectedCount++;
      m.setUTCMonth(m.getUTCMonth() + 1);
    }

    // Actual dates from DB
    const actualFirst = invoices.length > 0 ? new Date(invoices[0].billingPeriodStart) : null;
    const actualLast = invoices.length > 0 ? new Date(invoices[invoices.length - 1].billingPeriodStart) : null;

    // Check if correct
    const firstMatch = actualFirst !== null && actualFirst.getTime() === expectedFirstMonth.getTime();
    const lastMatch = actualLast !== null && actualLast.getTime() === expectedLastMonth.getTime();
    const countMatch = invoices.length === expectedCount;
    const isValid = firstMatch && lastMatch && countMatch;

    const result: ValidationResult = {
      name,
      admissionDate,
      leftDate,
      expectedFirst: formatMonth(expectedFirstMonth),
      expectedLast: formatMonth(expectedLastMonth),
      expectedCount,
      actualFirst: actualFirst ? formatMonth(actualFirst) : 'N/A',
      actualLast: actualLast ? formatMonth(actualLast) : 'N/A',
      actualCount: invoices.length,
      isValid,
    };

    results.push(result);

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }
  }

  // Print results
  console.log('STUDENT INVOICE VALIDATION');
  console.log('-'.repeat(80));
  console.log('');

  // Show invalid entries first
  const invalidResults = results.filter(r => !r.isValid);
  if (invalidResults.length > 0) {
    console.log('❌ INVALID ENTRIES:');
    console.log('');
    for (const r of invalidResults) {
      console.log(`  ${r.name}`);
      console.log(`    CSV: Admitted ${formatMonth(r.admissionDate)}, Left ${r.leftDate ? formatMonth(r.leftDate) : 'current'}`);
      console.log(`    Expected: ${r.expectedFirst} to ${r.expectedLast} (${r.expectedCount} months)`);
      console.log(`    Actual:   ${r.actualFirst} to ${r.actualLast} (${r.actualCount} months)`);
      console.log('');
    }
  }

  // Show summary of valid entries
  const validResults = results.filter(r => r.isValid);
  console.log('✅ VALID ENTRIES:');
  console.log('');
  for (const r of validResults) {
    const leftStr = r.leftDate ? formatMonth(r.leftDate) : 'current';
    console.log(`  ${r.name}: ${r.actualFirst} to ${r.actualLast} (${r.actualCount} months) [Left: ${leftStr}]`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total students: ${results.length}`);
  console.log(`Valid:   ${validCount}`);
  console.log(`Invalid: ${invalidCount}`);
  console.log('');

  if (invalidCount === 0) {
    console.log('✅ ALL INVOICES VALIDATED SUCCESSFULLY');
  } else {
    console.log('❌ VALIDATION FAILED - See issues above');
  }

  await prisma.$disconnect();
}

validate().catch((error) => {
  console.error('Error:', error);
  prisma.$disconnect();
  process.exit(1);
});
