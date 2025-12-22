import 'dotenv/config';
import { PrismaClient, Gender, EnrollmentStatus, FeeType, PreferredContact } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// Prisma 7 requires adapter for database connections
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Demo tenant ID - will be replaced with real tenant in production
const DEMO_TENANT_ID = 'DEMO_TENANT_ID';

interface ParsedParent {
  name: string;
  mobile: string | null;
  email: string | null;
}

interface ParsedFamily {
  familyCode: string;
  familyName: string;
  eldestChild: string | null;
  parents: ParsedParent[];
  status: string;
}

interface ParsedStudent {
  name: string;
  studentNumber: string;
  familyCode: string;
  gender: string;
  className: string;
  admissionDate: string;
  status: string;
}

// Class to fee structure mapping
const CLASS_FEE_MAP: Record<string, { name: string; amountCents: number }> = {
  'Ducks': { name: 'Ducks', amountCents: 200000 }, // R2000
  'Elephants': { name: 'Elephants', amountCents: 220000 }, // R2200
  'Leavers': { name: 'Leavers', amountCents: 250000 }, // R2500
  'Grade R': { name: 'Grade R', amountCents: 280000 }, // R2800
  'Grade RR': { name: 'Grade RR', amountCents: 260000 }, // R2600
};

/**
 * Read and parse JSON file with error handling
 */
function readJsonFile<T>(filePath: string): T {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent) as T;
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse student name in "Surname Firstname" format
 */
function parseStudentName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  const [lastName, ...firstNameParts] = parts;
  return {
    lastName,
    firstName: firstNameParts.join(' '),
  };
}

/**
 * Parse parent name and extract title if present
 */
function parseParentName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName
    .replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i, '')
    .trim();

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return { firstName, lastName };
}

/**
 * Extract class name from className field (e.g., "Ducks/A" -> "Ducks")
 */
function extractClassName(className: string): string {
  return className.split('/')[0].trim();
}

/**
 * Map gender string to Gender enum
 */
function mapGender(genderStr: string): Gender {
  const normalized = genderStr.toLowerCase();
  if (normalized === 'male') return Gender.MALE;
  if (normalized === 'female') return Gender.FEMALE;
  return Gender.OTHER;
}

/**
 * Get or create demo tenant
 */
async function ensureTenant() {
  console.log('📋 Ensuring demo tenant exists...');

  const tenant = await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    create: {
      id: DEMO_TENANT_ID,
      name: 'Demo Creche',
      email: 'demo@creche.example',
      addressLine1: '123 Demo Street',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '2000',
      phone: '0110000000',
      subscriptionStatus: 'TRIAL',
    },
    update: {},
  });

  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);
  return tenant;
}

/**
 * Create fee structures for each class
 */
async function createFeeStructures() {
  console.log('\n💰 Creating fee structures...');

  const feeStructures: Awaited<ReturnType<typeof prisma.feeStructure.create>>[] = [];

  for (const [className, { name, amountCents }] of Object.entries(CLASS_FEE_MAP)) {
    // Find existing fee structure
    const existing = await prisma.feeStructure.findFirst({
      where: {
        tenantId: DEMO_TENANT_ID,
        name,
        effectiveFrom: new Date('2023-01-01'),
      },
    });

    if (existing) {
      // Update existing
      const updated = await prisma.feeStructure.update({
        where: { id: existing.id },
        data: {
          amountCents,
          isActive: true,
        },
      });
      feeStructures.push(updated);
    } else {
      // Create new
      const created = await prisma.feeStructure.create({
        data: {
          id: randomUUID(),
          tenantId: DEMO_TENANT_ID,
          name,
          description: `${name} class monthly fee`,
          feeType: FeeType.FULL_DAY,
          amountCents,
          vatInclusive: true,
          effectiveFrom: new Date('2023-01-01'),
          isActive: true,
        },
      });
      feeStructures.push(created);
    }
  }

  console.log(`✅ Created ${feeStructures.length} fee structures`);
  return feeStructures;
}

/**
 * Import families and create parent records
 */
async function importFamilies(families: ParsedFamily[]) {
  console.log(`\n👨‍👩‍👧‍👦 Importing ${families.length} families...`);

  const parentMap = new Map<string, string>(); // familyCode -> parentId
  let created = 0;
  let updated = 0;

  for (const family of families) {
    // Use first parent as primary contact
    const primaryParent = family.parents[0];
    if (!primaryParent) {
      console.warn(`⚠️  Family ${family.familyCode} has no parents, skipping`);
      continue;
    }

    const { firstName, lastName } = parseParentName(primaryParent.name);

    // Use email as unique identifier if available, otherwise use familyCode
    const email = primaryParent.email || `family${family.familyCode}@demo.local`;

    try {
      const parent = await prisma.parent.upsert({
        where: {
          tenantId_email: {
            tenantId: DEMO_TENANT_ID,
            email,
          },
        },
        create: {
          id: randomUUID(),
          tenantId: DEMO_TENANT_ID,
          firstName,
          lastName,
          email,
          phone: primaryParent.mobile,
          whatsapp: primaryParent.mobile,
          preferredContact: primaryParent.email ? PreferredContact.EMAIL : PreferredContact.WHATSAPP,
          isActive: family.status === 'Active',
        },
        update: {
          firstName,
          lastName,
          phone: primaryParent.mobile,
          whatsapp: primaryParent.mobile,
          isActive: family.status === 'Active',
        },
      });

      parentMap.set(family.familyCode, parent.id);

      if (parent.createdAt.getTime() === parent.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Failed to import family ${family.familyCode}:`, error);
    }
  }

  console.log(`✅ Parents: ${created} created, ${updated} updated`);
  return parentMap;
}

/**
 * Import students and create child records with enrollments
 */
async function importStudents(
  students: ParsedStudent[],
  parentMap: Map<string, string>,
  feeStructures: any[]
) {
  console.log(`\n👶 Importing ${students.length} students...`);

  let childrenCreated = 0;
  let childrenUpdated = 0;
  let enrollmentsCreated = 0;
  let skipped = 0;

  for (const student of students) {
    const parentId = parentMap.get(student.familyCode);

    if (!parentId) {
      console.warn(`⚠️  No parent found for family ${student.familyCode}, skipping ${student.name}`);
      skipped++;
      continue;
    }

    const { firstName, lastName } = parseStudentName(student.name);
    const className = extractClassName(student.className);

    // Find matching fee structure
    const feeStructure = feeStructures.find(fs => fs.name === className);
    if (!feeStructure) {
      console.warn(`⚠️  No fee structure found for class "${className}", skipping ${student.name}`);
      skipped++;
      continue;
    }

    // Parse admission date
    const admissionDate = new Date(student.admissionDate);
    if (isNaN(admissionDate.getTime())) {
      console.warn(`⚠️  Invalid admission date for ${student.name}, skipping`);
      skipped++;
      continue;
    }

    // Estimate date of birth (assuming child is 3-5 years old at admission)
    const estimatedAge = className.includes('Grade') ? 5 : 3;
    const dateOfBirth = new Date(admissionDate);
    dateOfBirth.setFullYear(dateOfBirth.getFullYear() - estimatedAge);

    try {
      // Find existing child by matching names
      const existingChild = await prisma.child.findFirst({
        where: {
          tenantId: DEMO_TENANT_ID,
          parentId,
          firstName,
          lastName,
        },
      });

      let child;
      if (existingChild) {
        // Update existing child
        child = await prisma.child.update({
          where: { id: existingChild.id },
          data: {
            dateOfBirth,
            gender: mapGender(student.gender),
            isActive: student.status === 'Current',
          },
        });
        childrenUpdated++;
      } else {
        // Create new child
        child = await prisma.child.create({
          data: {
            id: randomUUID(),
            tenantId: DEMO_TENANT_ID,
            parentId,
            firstName,
            lastName,
            dateOfBirth,
            gender: mapGender(student.gender),
            isActive: student.status === 'Current',
          },
        });
        childrenCreated++;
      }

      // Create enrollment for Current students
      if (student.status === 'Current') {
        // Check if enrollment already exists
        const existingEnrollment = await prisma.enrollment.findFirst({
          where: {
            tenantId: DEMO_TENANT_ID,
            childId: child.id,
            feeStructureId: feeStructure.id,
            startDate: admissionDate,
          },
        });

        if (existingEnrollment) {
          // Update status
          await prisma.enrollment.update({
            where: { id: existingEnrollment.id },
            data: { status: EnrollmentStatus.ACTIVE },
          });
        } else {
          // Create new enrollment
          await prisma.enrollment.create({
            data: {
              id: randomUUID(),
              tenantId: DEMO_TENANT_ID,
              childId: child.id,
              feeStructureId: feeStructure.id,
              startDate: admissionDate,
              status: EnrollmentStatus.ACTIVE,
            },
          });
          enrollmentsCreated++;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to import student ${student.name}:`, error);
      skipped++;
    }
  }

  console.log(`✅ Children: ${childrenCreated} created, ${childrenUpdated} updated`);
  console.log(`✅ Enrollments: ${enrollmentsCreated} created`);
  if (skipped > 0) {
    console.log(`⚠️  Skipped: ${skipped} students`);
  }
}

/**
 * Main seed function
 */
async function main() {
  console.log('🌱 Starting data import from parsed JSON files...\n');

  // Read data files
  const familiesPath = '/tmp/families.json';
  const studentsPath = '/tmp/students.json';

  console.log('📂 Reading data files...');
  const families = readJsonFile<ParsedFamily[]>(familiesPath);
  const students = readJsonFile<ParsedStudent[]>(studentsPath);

  console.log(`✅ Loaded ${families.length} families and ${students.length} students`);

  // Ensure tenant exists
  await ensureTenant();

  // Create fee structures
  const feeStructures = await createFeeStructures();

  // Import families -> parents
  const parentMap = await importFamilies(families);

  // Import students -> children + enrollments
  await importStudents(students, parentMap, feeStructures);

  console.log('\n✨ Import completed successfully!');
}

main()
  .catch((error) => {
    console.error('\n💥 Import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
