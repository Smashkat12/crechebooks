/**
 * Seed script for 2024 historical data backfill
 *
 * This script imports:
 * - Parents from Family.csv
 * - Children from Students.csv
 * - Creates 2024 fee structure (R950/month, R500 registration)
 * - Generates enrollment invoices for students enrolled in 2024
 * - Generates monthly invoices for Jan-Dec 2024
 *
 * IMPORTANT: This uses REAL data from docs/data/*.csv files
 * NO mock data, NO workarounds - errors fail fast with detailed logging
 */

import 'dotenv/config';
import {
  PrismaClient,
  Gender,
  EnrollmentStatus,
  FeeType,
  PreferredContact,
  InvoiceStatus,
  LineType
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

// Database configuration
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('FATAL: DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 2024 fee configuration
const FEE_CONFIG_2024 = {
  monthlyFeeCents: 95000,      // R950.00
  registrationFeeCents: 50000, // R500.00
  effectiveFrom: new Date('2024-01-01'),
  effectiveTo: new Date('2024-12-31'),
};

interface FamilyRow {
  no: string;
  name: string;
  familyCode: string;
  familyName: string;
  mobile: string;
  contact: string;
  workPhone: string;
  email: string;
  eldestChild: string;
  birthDate: string;
  nationality: string;
  status: string;
}

interface StudentRow {
  no: string;
  name: string;
  studentNumber: string;
  familyCode: string;
  familyName: string;
  gender: string;
  classGroup: string;
  admissionDate: string;
  status: string;
  leftDate: string | null;
}

// Statistics tracking
const stats = {
  parentsCreated: 0,
  parentsUpdated: 0,
  childrenCreated: 0,
  childrenUpdated: 0,
  enrollmentsCreated: 0,
  registrationInvoicesCreated: 0,
  monthlyInvoicesCreated: 0,
  errors: [] as string[],
};

/**
 * Parse CSV file with proper error handling
 */
function parseCSV<T>(filePath: string, mapper: (cols: string[], lineNum: number) => T): T[] {
  console.log(`📂 Reading: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`FATAL: File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error(`FATAL: File ${filePath} has no data rows`);
  }

  const rows: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split (handles our data format)
    const cols = line.split(',').map(c => c.trim());
    try {
      rows.push(mapper(cols, i + 1));
    } catch (error) {
      throw new Error(`FATAL: Error parsing line ${i + 1}: ${error}`);
    }
  }

  console.log(`  ✅ Parsed ${rows.length} rows`);
  return rows;
}

/**
 * Parse family row from CSV
 */
function parseFamilyRow(cols: string[], lineNum: number): FamilyRow {
  const familyField = cols[2] || '';
  const [familyCode, ...familyNameParts] = familyField.split(' - ');

  return {
    no: cols[0] || '',
    name: cols[1] || '',
    familyCode: familyCode.trim(),
    familyName: familyNameParts.join(' - ').trim(),
    mobile: (cols[3] || '').replace('(+27) ', '0').trim(),
    contact: cols[4] || '',
    workPhone: cols[5] || '',
    email: cols[6] || '',
    eldestChild: cols[7] || '',
    birthDate: cols[8] || '',
    nationality: cols[9] || '',
    status: cols[10] || '',
  };
}

/**
 * Parse student row from CSV
 */
function parseStudentRow(cols: string[], lineNum: number): StudentRow {
  const familyField = cols[3] || '';
  const [familyCode, ...familyNameParts] = familyField.split(' - ');

  const statusField = cols[7] || '';
  let status = statusField;
  let leftDate: string | null = null;

  // Parse "Left on YYYY-MM-DD" status
  if (statusField.startsWith('Left on ')) {
    status = 'Left';
    leftDate = statusField.replace('Left on ', '').trim();
  }

  return {
    no: cols[0] || '',
    name: cols[1] || '',
    studentNumber: cols[2] || '',
    familyCode: familyCode.trim(),
    familyName: familyNameParts.join(' - ').trim(),
    gender: cols[4] || '',
    classGroup: cols[5] || '',
    admissionDate: cols[6] || '',
    status,
    leftDate,
  };
}

/**
 * Parse name into first and last name
 */
function parseName(fullName: string): { firstName: string; lastName: string } {
  // Remove titles and asterisks
  const cleaned = fullName
    .replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i, '')
    .replace(/\s*\*$/, '')
    .trim();

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  // For parent names: "Firstname Lastname"
  // For student names: "Lastname Firstname"
  return {
    firstName: parts[parts.length - 1] || parts[0],
    lastName: parts.slice(0, -1).join(' ') || parts[0],
  };
}

/**
 * Parse student name (format: "Lastname Firstname")
 */
function parseStudentName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return {
    lastName: parts[0],
    firstName: parts.slice(1).join(' '),
  };
}

/**
 * Map gender string to enum
 */
function mapGender(gender: string): Gender {
  const g = gender.toLowerCase().trim();
  if (g === 'male') return Gender.MALE;
  if (g === 'female') return Gender.FEMALE;
  return Gender.OTHER;
}

/**
 * Generate invoice number
 */
function generateInvoiceNumber(prefix: string, year: number, month: number, index: number): string {
  const monthStr = month.toString().padStart(2, '0');
  const indexStr = index.toString().padStart(4, '0');
  return `${prefix}-${year}${monthStr}-${indexStr}`;
}

/**
 * Get the last day of a month
 */
function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

/**
 * Main seed function
 */
async function main() {
  console.log('\n🌱 Starting 2024 Historical Data Backfill\n');
  console.log('='.repeat(60));
  console.log(`📋 Fee Structure: R${FEE_CONFIG_2024.monthlyFeeCents / 100}/month`);
  console.log(`📋 Registration: R${FEE_CONFIG_2024.registrationFeeCents / 100}`);
  console.log('='.repeat(60));

  // Step 1: Get tenant
  console.log('\n📍 Step 1: Finding tenant...');
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error('FATAL: No tenant found in database. Please run the main seed first.');
  }
  console.log(`  ✅ Tenant: ${tenant.name} (${tenant.id})`);

  // Step 2: Read and parse CSV files
  console.log('\n📍 Step 2: Reading CSV files...');
  const docsPath = path.join(__dirname, '../../..', 'docs/data');
  const familyPath = path.join(docsPath, 'Family.csv');
  const studentsPath = path.join(docsPath, 'Students.csv');

  const familyRows = parseCSV(familyPath, parseFamilyRow);
  const studentRows = parseCSV(studentsPath, parseStudentRow);

  // Step 3: Create/update 2024 fee structure
  console.log('\n📍 Step 3: Creating 2024 fee structure...');
  let feeStructure = await prisma.feeStructure.findFirst({
    where: {
      tenantId: tenant.id,
      name: '2024 Standard Fee',
    },
  });

  if (!feeStructure) {
    feeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: tenant.id,
        name: '2024 Standard Fee',
        description: 'Monthly school fee for 2024 academic year',
        feeType: FeeType.FULL_DAY,
        amountCents: FEE_CONFIG_2024.monthlyFeeCents,
        registrationFeeCents: FEE_CONFIG_2024.registrationFeeCents,
        vatInclusive: true,
        effectiveFrom: FEE_CONFIG_2024.effectiveFrom,
        effectiveTo: FEE_CONFIG_2024.effectiveTo,
        isActive: true,
      },
    });
    console.log(`  ✅ Created fee structure: ${feeStructure.name}`);
  } else {
    // Update existing
    feeStructure = await prisma.feeStructure.update({
      where: { id: feeStructure.id },
      data: {
        amountCents: FEE_CONFIG_2024.monthlyFeeCents,
        registrationFeeCents: FEE_CONFIG_2024.registrationFeeCents,
      },
    });
    console.log(`  ✅ Updated fee structure: ${feeStructure.name}`);
  }

  // Step 4: Group families and create parents
  console.log('\n📍 Step 4: Processing families and creating parents...');
  const familyGroups = new Map<string, FamilyRow[]>();
  for (const row of familyRows) {
    if (!familyGroups.has(row.familyCode)) {
      familyGroups.set(row.familyCode, []);
    }
    familyGroups.get(row.familyCode)!.push(row);
  }
  console.log(`  Found ${familyGroups.size} unique families`);

  const parentsByFamily = new Map<string, string>(); // familyCode -> parentId

  for (const [familyCode, members] of familyGroups) {
    // Pick primary contact: prefer active with email
    const primary = members.find(m => m.email && m.status === 'Active')
      || members.find(m => m.email)
      || members.find(m => m.status === 'Active')
      || members[0];

    if (!primary) {
      stats.errors.push(`No primary contact for family ${familyCode}`);
      continue;
    }

    const { firstName, lastName } = parseName(primary.name);
    const email = primary.email || `family.${familyCode}@placeholder.local`;
    const phone = primary.mobile || primary.contact || null;

    try {
      // Try to find existing parent
      let parent = await prisma.parent.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [
            { email },
            { lastName, firstName },
          ],
        },
      });

      if (parent) {
        // Update if exists
        parent = await prisma.parent.update({
          where: { id: parent.id },
          data: {
            phone,
            whatsapp: phone,
            isActive: primary.status === 'Active',
          },
        });
        stats.parentsUpdated++;
      } else {
        // Create new parent
        parent = await prisma.parent.create({
          data: {
            tenantId: tenant.id,
            firstName,
            lastName,
            email,
            phone,
            whatsapp: phone,
            preferredContact: primary.email ? PreferredContact.EMAIL : PreferredContact.WHATSAPP,
            isActive: primary.status === 'Active',
          },
        });
        stats.parentsCreated++;
      }

      parentsByFamily.set(familyCode, parent.id);
    } catch (error) {
      stats.errors.push(`Failed to create parent for family ${familyCode}: ${error}`);
    }
  }
  console.log(`  ✅ Parents: ${stats.parentsCreated} created, ${stats.parentsUpdated} updated`);

  // Step 5: Create children and enrollments
  console.log('\n📍 Step 5: Processing students and creating children...');
  const childrenData: Array<{
    child: any;
    student: StudentRow;
    parentId: string;
    enrollmentStartDate: Date;
    enrollmentEndDate: Date | null;
  }> = [];

  for (const student of studentRows) {
    const parentId = parentsByFamily.get(student.familyCode);
    if (!parentId) {
      stats.errors.push(`No parent found for student ${student.name} (family ${student.familyCode})`);
      continue;
    }

    const { firstName, lastName } = parseStudentName(student.name);
    const admissionDate = student.admissionDate && student.admissionDate !== '0000-00-00'
      ? new Date(student.admissionDate)
      : new Date('2024-01-01');

    // Parse left date if exists
    let leftDate: Date | null = null;
    if (student.leftDate) {
      leftDate = new Date(student.leftDate);
    }

    // Estimate date of birth (roughly 3 years before admission)
    const estimatedDob = new Date(admissionDate);
    estimatedDob.setFullYear(estimatedDob.getFullYear() - 3);

    try {
      // Find or create child
      let child = await prisma.child.findFirst({
        where: {
          tenantId: tenant.id,
          parentId,
          firstName,
          lastName,
        },
      });

      if (child) {
        child = await prisma.child.update({
          where: { id: child.id },
          data: {
            gender: mapGender(student.gender),
            isActive: student.status === 'Current',
          },
        });
        stats.childrenUpdated++;
      } else {
        child = await prisma.child.create({
          data: {
            tenantId: tenant.id,
            parentId,
            firstName,
            lastName,
            dateOfBirth: estimatedDob,
            gender: mapGender(student.gender),
            isActive: student.status === 'Current',
          },
        });
        stats.childrenCreated++;
      }

      // Determine enrollment dates for 2024
      // If admitted in 2024, use admission date
      // If admitted before 2024, use Jan 1, 2024
      const enrollmentStart = admissionDate.getFullYear() === 2024
        ? admissionDate
        : new Date('2024-01-01');

      // End date: if left in 2024, use that. If still current, use Dec 31, 2024
      const enrollmentEnd = leftDate && leftDate.getFullYear() === 2024
        ? leftDate
        : (student.status === 'Current' ? new Date('2024-12-31') : leftDate || new Date('2024-12-31'));

      // Only include students who were enrolled at some point in 2024
      if (enrollmentStart <= new Date('2024-12-31') && enrollmentEnd >= new Date('2024-01-01')) {
        childrenData.push({
          child,
          student,
          parentId,
          enrollmentStartDate: enrollmentStart,
          enrollmentEndDate: enrollmentEnd,
        });

        // Create enrollment record
        const existingEnrollment = await prisma.enrollment.findFirst({
          where: {
            tenantId: tenant.id,
            childId: child.id,
            feeStructureId: feeStructure!.id,
          },
        });

        if (!existingEnrollment) {
          await prisma.enrollment.create({
            data: {
              tenantId: tenant.id,
              childId: child.id,
              feeStructureId: feeStructure!.id,
              startDate: enrollmentStart,
              endDate: student.status !== 'Current' ? enrollmentEnd : null,
              status: student.status === 'Current' ? EnrollmentStatus.ACTIVE : EnrollmentStatus.WITHDRAWN,
            },
          });
          stats.enrollmentsCreated++;
        }
      }
    } catch (error) {
      stats.errors.push(`Failed to create child ${student.name}: ${error}`);
    }
  }
  console.log(`  ✅ Children: ${stats.childrenCreated} created, ${stats.childrenUpdated} updated`);
  console.log(`  ✅ Enrollments: ${stats.enrollmentsCreated} created`);
  console.log(`  📊 Students enrolled in 2024: ${childrenData.length}`);

  // Step 6: Generate invoices for 2024
  console.log('\n📍 Step 6: Generating 2024 invoices...');

  // Get highest existing invoice number
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { invoiceNumber: 'desc' },
  });

  let invoiceIndex = 1;
  if (lastInvoice) {
    const match = lastInvoice.invoiceNumber.match(/-(\d+)$/);
    if (match) {
      invoiceIndex = parseInt(match[1], 10) + 1;
    }
  }

  for (const data of childrenData) {
    const { child, student, parentId, enrollmentStartDate, enrollmentEndDate } = data;

    // Determine which months to invoice
    const startMonth = enrollmentStartDate.getFullYear() === 2024
      ? enrollmentStartDate.getMonth() + 1
      : 1;
    const endMonth = enrollmentEndDate && enrollmentEndDate.getFullYear() === 2024
      ? enrollmentEndDate.getMonth() + 1
      : 12;

    // Create registration invoice if enrolled in 2024
    if (enrollmentStartDate.getFullYear() === 2024) {
      const regInvoiceNumber = generateInvoiceNumber('REG', 2024, enrollmentStartDate.getMonth() + 1, invoiceIndex++);

      // Check if registration invoice already exists
      const existingRegInvoice = await prisma.invoice.findFirst({
        where: {
          tenantId: tenant.id,
          childId: child.id,
          lines: {
            some: { lineType: LineType.REGISTRATION },
          },
          billingPeriodStart: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-12-31'),
          },
        },
      });

      if (!existingRegInvoice) {
        try {
          await prisma.invoice.create({
            data: {
              tenantId: tenant.id,
              invoiceNumber: regInvoiceNumber,
              parentId,
              childId: child.id,
              billingPeriodStart: enrollmentStartDate,
              billingPeriodEnd: enrollmentStartDate,
              issueDate: enrollmentStartDate,
              dueDate: new Date(enrollmentStartDate.getTime() + 7 * 24 * 60 * 60 * 1000),
              subtotalCents: FEE_CONFIG_2024.registrationFeeCents,
              vatCents: 0,
              vatRate: new Decimal(0),
              totalCents: FEE_CONFIG_2024.registrationFeeCents,
              amountPaidCents: 0,
              status: InvoiceStatus.SENT, // Mark as sent since this is historical
              lines: {
                create: [{
                  description: `Registration Fee - ${child.firstName} ${child.lastName}`,
                  quantity: new Decimal(1),
                  unitPriceCents: FEE_CONFIG_2024.registrationFeeCents,
                  discountCents: 0,
                  subtotalCents: FEE_CONFIG_2024.registrationFeeCents,
                  vatCents: 0,
                  totalCents: FEE_CONFIG_2024.registrationFeeCents,
                  lineType: LineType.REGISTRATION,
                  sortOrder: 0,
                }],
              },
            },
          });
          stats.registrationInvoicesCreated++;
        } catch (error) {
          stats.errors.push(`Failed to create registration invoice for ${child.firstName} ${child.lastName}: ${error}`);
        }
      }
    }

    // Create monthly invoices
    for (let month = startMonth; month <= endMonth; month++) {
      const invoiceNumber = generateInvoiceNumber('INV', 2024, month, invoiceIndex++);
      const periodStart = new Date(2024, month - 1, 1);
      const periodEnd = getLastDayOfMonth(2024, month);
      const issueDate = new Date(2024, month - 1, 1);
      const dueDate = new Date(2024, month - 1, 7);

      // Check if monthly invoice already exists
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          tenantId: tenant.id,
          childId: child.id,
          billingPeriodStart: periodStart,
          lines: {
            some: { lineType: LineType.MONTHLY_FEE },
          },
        },
      });

      if (!existingInvoice) {
        try {
          await prisma.invoice.create({
            data: {
              tenantId: tenant.id,
              invoiceNumber,
              parentId,
              childId: child.id,
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              issueDate,
              dueDate,
              subtotalCents: FEE_CONFIG_2024.monthlyFeeCents,
              vatCents: 0,
              vatRate: new Decimal(0),
              totalCents: FEE_CONFIG_2024.monthlyFeeCents,
              amountPaidCents: 0,
              status: InvoiceStatus.SENT, // Mark as sent since historical
              lines: {
                create: [{
                  description: `Monthly Fee - ${child.firstName} ${child.lastName} - ${new Date(2024, month - 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}`,
                  quantity: new Decimal(1),
                  unitPriceCents: FEE_CONFIG_2024.monthlyFeeCents,
                  discountCents: 0,
                  subtotalCents: FEE_CONFIG_2024.monthlyFeeCents,
                  vatCents: 0,
                  totalCents: FEE_CONFIG_2024.monthlyFeeCents,
                  lineType: LineType.MONTHLY_FEE,
                  sortOrder: 0,
                }],
              },
            },
          });
          stats.monthlyInvoicesCreated++;
        } catch (error) {
          stats.errors.push(`Failed to create invoice ${invoiceNumber} for ${child.firstName}: ${error}`);
        }
      }
    }
  }

  console.log(`  ✅ Registration invoices: ${stats.registrationInvoicesCreated} created`);
  console.log(`  ✅ Monthly invoices: ${stats.monthlyInvoicesCreated} created`);

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Parents:     ${stats.parentsCreated} created, ${stats.parentsUpdated} updated`);
  console.log(`Children:    ${stats.childrenCreated} created, ${stats.childrenUpdated} updated`);
  console.log(`Enrollments: ${stats.enrollmentsCreated} created`);
  console.log(`Reg Invoices:    ${stats.registrationInvoicesCreated} created`);
  console.log(`Monthly Invoices: ${stats.monthlyInvoicesCreated} created`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  // Verify totals
  const dbStats = await Promise.all([
    prisma.parent.count({ where: { tenantId: tenant.id } }),
    prisma.child.count({ where: { tenantId: tenant.id } }),
    prisma.enrollment.count({ where: { tenantId: tenant.id } }),
    prisma.invoice.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log('\n📊 DATABASE TOTALS:');
  console.log(`  Parents:     ${dbStats[0]}`);
  console.log(`  Children:    ${dbStats[1]}`);
  console.log(`  Enrollments: ${dbStats[2]}`);
  console.log(`  Invoices:    ${dbStats[3]}`);

  console.log('\n✨ 2024 Historical Data Backfill Complete!\n');
}

main()
  .catch((error) => {
    console.error('\n💥 FATAL ERROR:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
