/**
 * Seed database from CSV files in docs/data
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

interface FamilyRow {
  no: string;
  name: string;
  family: string;
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
  number: string;
  family: string;
  gender: string;
  classGroup: string;
  admissionDate: string;
  status: string;
}

function parseCSV<T>(filePath: string, mapper: (row: string[]) => T): T[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const rows: T[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle CSV properly (simple split for now)
    const cols = line.split(',').map(c => c.trim());
    rows.push(mapper(cols));
  }

  return rows;
}

function parseFamilyRow(cols: string[]): FamilyRow {
  return {
    no: cols[0] || '',
    name: cols[1] || '',
    family: cols[2] || '',
    mobile: cols[3]?.replace('(+27) ', '0') || '',
    contact: cols[4] || '',
    workPhone: cols[5] || '',
    email: cols[6] || '',
    eldestChild: cols[7] || '',
    birthDate: cols[8] || '',
    nationality: cols[9] || '',
    status: cols[10] || '',
  };
}

function parseStudentRow(cols: string[]): StudentRow {
  return {
    no: cols[0] || '',
    name: cols[1] || '',
    number: cols[2] || '',
    family: cols[3] || '',
    gender: cols[4] || '',
    classGroup: cols[5] || '',
    admissionDate: cols[6] || '',
    status: cols[7] || '',
  };
}

function extractFamilyCode(family: string): string {
  // "1029 - Makwela" -> "1029"
  const match = family.match(/^(\d+)/);
  return match ? match[1] : family;
}

async function main() {
  console.log('🌱 Starting CSV data import...\n');

  const docsPath = path.join(__dirname, '../../..', 'docs/data');
  const familyPath = path.join(docsPath, 'Family.csv');
  const studentsPath = path.join(docsPath, 'Students.csv');

  // Get or create tenant
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: 'creche-001',
        name: 'Sunshine Creche',
        email: 'admin@sunshinecreche.co.za',
        phone: '0123456789',
        address: '123 Main Street, Pretoria, South Africa',
        settings: {},
      },
    });
    console.log('✅ Created tenant:', tenant.name);
  }

  // Parse CSV files
  console.log('📂 Reading CSV files...');
  const familyRows = parseCSV(familyPath, parseFamilyRow);
  const studentRows = parseCSV(studentsPath, parseStudentRow);
  console.log(`  Found ${familyRows.length} family members and ${studentRows.length} students\n`);

  // Group family members by family code
  const familyGroups = new Map<string, FamilyRow[]>();
  for (const row of familyRows) {
    const code = extractFamilyCode(row.family);
    if (!familyGroups.has(code)) {
      familyGroups.set(code, []);
    }
    familyGroups.get(code)!.push(row);
  }

  // Create parents (one per unique family, preferring one with email)
  console.log('👨‍👩‍👧 Creating parents...');
  const parentsByFamily = new Map<string, string>(); // familyCode -> parentId
  let parentCount = 0;

  for (const [familyCode, members] of familyGroups) {
    // Pick the primary contact (prefer one with email, then first active)
    const primary = members.find(m => m.email && m.status === 'Active')
      || members.find(m => m.email)
      || members.find(m => m.status === 'Active')
      || members[0];

    if (!primary) continue;

    // Extract surname from family field
    const familyMatch = primary.family.match(/- (\w+)/);
    const surname = familyMatch ? familyMatch[1] : 'Unknown';

    // Extract first name
    const nameParts = primary.name.replace(/^(Mr|Mrs|Ms|Miss)\s+/i, '').replace(/\s*\*$/, '').split(' ');
    const firstName = nameParts[0] || 'Parent';

    const emailToUse = primary.email || `${familyCode}@placeholder.local`;

    // First check if parent exists
    let parent = await prisma.parent.findFirst({
      where: { email: emailToUse },
    });

    if (!parent) {
      try {
        parent = await prisma.parent.create({
          data: {
            firstName,
            lastName: surname,
            email: emailToUse,
            phone: primary.mobile || primary.contact || null,
            tenantId: tenant.id,
          },
        });
        parentCount++;
      } catch (e) {
        console.log(`  ⚠️  Error creating: ${primary.name}`);
        continue;
      }
    }

    parentsByFamily.set(familyCode, parent.id);
  }
  console.log(`  ✅ Created ${parentCount} parents\n`);

  // Create children
  console.log('👶 Creating children...');
  let childCount = 0;
  let enrollmentCount = 0;

  for (const student of studentRows) {
    const familyCode = extractFamilyCode(student.family);
    const parentId = parentsByFamily.get(familyCode);

    if (!parentId) {
      console.log(`  ⚠️  No parent found for ${student.name} (family ${familyCode})`);
      continue;
    }

    // Parse name (e.g., "Dzaga Remoneilwe" -> lastName, firstName)
    const nameParts = student.name.split(' ');
    const lastName = nameParts[0] || 'Unknown';
    const firstName = nameParts.slice(1).join(' ') || 'Child';

    // Determine status
    const isActive = student.status === 'Current';

    // Parse admission date
    let admissionDate: Date | undefined;
    if (student.admissionDate && student.admissionDate !== '0000-00-00') {
      admissionDate = new Date(student.admissionDate);
    }

    // Determine class/age group
    let ageGroup = 'Toddlers';
    if (student.classGroup.includes('Leavers')) ageGroup = 'Grade R';
    else if (student.classGroup.includes('Elephants')) ageGroup = 'Pre-Grade R';
    else if (student.classGroup.includes('Ducks')) ageGroup = 'Toddlers';
    else if (student.classGroup.includes('Grade R')) ageGroup = 'Grade R';
    else if (student.classGroup.includes('Grade RR')) ageGroup = 'Pre-Grade R';

    try {
      const child = await prisma.child.create({
        data: {
          firstName,
          lastName,
          dateOfBirth: admissionDate ? new Date(admissionDate.getTime() - 3 * 365 * 24 * 60 * 60 * 1000) : new Date('2020-01-01'), // Estimate DOB
          gender: student.gender === 'Male' ? 'MALE' : 'FEMALE',
          tenantId: tenant.id,
          parentId,
        },
      });
      childCount++;

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          child: { connect: { id: child.id } },
          startDate: admissionDate || new Date('2024-01-01'),
          endDate: isActive ? null : new Date(),
          status: isActive ? 'ACTIVE' : 'WITHDRAWN',
          schedule: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
          tenant: { connect: { id: tenant.id } },
        },
      });
      enrollmentCount++;
    } catch (e: any) {
      console.log(`  ⚠️  Error creating ${student.name}: ${e.message}`);
    }
  }
  console.log(`  ✅ Created ${childCount} children and ${enrollmentCount} enrollments\n`);

  // Create fee structure
  console.log('💰 Creating fee structure...');
  let feeStructure = await prisma.feeStructure.findFirst({
    where: { name: 'Standard Monthly Fee' },
  });
  if (!feeStructure) {
    feeStructure = await prisma.feeStructure.create({
      data: {
        name: 'Standard Monthly Fee',
        description: 'Monthly tuition fee for all age groups',
        amountCents: 220000, // R2,200.00 in cents
        billingCycle: 'MONTHLY',
        feeType: 'TUITION',
        effectiveFrom: new Date('2024-01-01'),
        isActive: true,
        tenant: { connect: { id: tenant.id } },
      },
    });
  }
  console.log(`  ✅ Fee structure: ${feeStructure.name} - R${feeStructure.amountCents / 100}\n`);

  // Summary
  const counts = await Promise.all([
    prisma.parent.count(),
    prisma.child.count(),
    prisma.enrollment.count(),
    prisma.invoice.count(),
  ]);

  console.log('📊 Database Summary:');
  console.log(`  Parents:     ${counts[0]}`);
  console.log(`  Children:    ${counts[1]}`);
  console.log(`  Enrollments: ${counts[2]}`);
  console.log(`  Invoices:    ${counts[3]}`);
  console.log('\n✅ Import complete!');
}

main()
  .catch((e) => {
    console.error('💥 Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
