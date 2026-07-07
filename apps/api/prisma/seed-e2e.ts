/**
 * E2E seed for Playwright CI.
 *
 * Idempotent: safe to re-run. Uses fixed UUIDs so the same fixtures land every
 * time. Creates the minimum fixture set the current Playwright specs assume:
 *
 *   - 1 tenant (Elle Elephant — matches the ID auth.service.ts falls back to
 *     when dev-login creates the admin user)
 *   - 1 admin user (bcrypt hash matches DEV_USER_1_PASSWORD_HASH env for CI)
 *   - 2 fee structures
 *   - 3 parents
 *   - 4 children (3 enrolled ACTIVE, 1 pending)
 *   - 4 enrollments (one WITHDRAWN so the status filter has variety)
 *   - 4 invoices covering DRAFT / SENT / PAID / OVERDUE — DRAFT is what the
 *     adhoc-charges spec navigates to
 *
 * Intentionally does NOT trigger any comms side-effects (no InvoiceDelivery,
 * no scheduler jobs).
 *
 * Run: `DATABASE_URL=... pnpm --filter @crechebooks/api exec tsx prisma/seed-e2e.ts`
 */

import 'dotenv/config';
import {
  PrismaClient,
  Gender,
  EnrollmentStatus,
  FeeType,
  PreferredContact,
  InvoiceStatus,
  LineType,
  ChildStatus,
  UserRole,
  TaxStatus,
  VatCategory,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Fixed IDs so this seed is idempotent and readable in logs.
const TENANT_ID = 'ee937a14-3c81-4e74-ab10-8d2936c5bc2e';
const ADMIN_USER_ID = 'e2e00000-0000-0000-0000-000000000001';
const FEE_FULL_DAY_ID = 'e2e00001-0000-0000-0000-000000000001';
const FEE_HALF_DAY_ID = 'e2e00001-0000-0000-0000-000000000002';
const PARENT_ALICE_ID = 'e2e00002-0000-0000-0000-000000000001';
const PARENT_BEN_ID = 'e2e00002-0000-0000-0000-000000000002';
const PARENT_CARMEN_ID = 'e2e00002-0000-0000-0000-000000000003';
const CHILD_1_ID = 'e2e00003-0000-0000-0000-000000000001';
const CHILD_2_ID = 'e2e00003-0000-0000-0000-000000000002';
const CHILD_3_ID = 'e2e00003-0000-0000-0000-000000000003';
const CHILD_4_ID = 'e2e00003-0000-0000-0000-000000000004';
const ENROLL_1_ID = 'e2e00004-0000-0000-0000-000000000001';
const ENROLL_2_ID = 'e2e00004-0000-0000-0000-000000000002';
const ENROLL_3_ID = 'e2e00004-0000-0000-0000-000000000003';
const ENROLL_4_ID = 'e2e00004-0000-0000-0000-000000000004';
const INVOICE_DRAFT_ID = 'e2e00005-0000-0000-0000-000000000001';
const INVOICE_SENT_ID = 'e2e00005-0000-0000-0000-000000000002';
const INVOICE_PAID_ID = 'e2e00005-0000-0000-0000-000000000003';
const INVOICE_OVERDUE_ID = 'e2e00005-0000-0000-0000-000000000004';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Precomputed bcrypt hash of "CrecheBooks2026!" — same password the CI workflow
// injects into DEV_USER_1_PASSWORD_HASH so the dev-login endpoint accepts it.
// Kept here purely as a log signal; the User row itself doesn't store the hash
// (dev-login validates against DEV_USER_1_PASSWORD_HASH from env).
// Hash generated locally with `bcrypt.hash("CrecheBooks2026!", 10)` and
// verified round-trip.
const ADMIN_BCRYPT_HASH =
  '$2b$10$832vAOfUH58hxxMEoSU2buJilwW8GNPAQ1BrArlG2/gwyNqeC3Sty';

async function seed() {
  console.log('E2E seed: starting');
  console.log(`E2E seed: DATABASE_URL host = ${new URL(databaseUrl!).host}`);

  // 1) Tenant — VAT-registered so the SARS/VAT201 pages don't 403.
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {
      taxStatus: TaxStatus.VAT_REGISTERED,
      vatCategory: VatCategory.A,
      vatNumber: '4000000000',
      vatRegistrationDate: new Date('2020-01-01'),
    },
    create: {
      id: TENANT_ID,
      name: 'Elle Elephant Creche (E2E)',
      tradingName: 'Elle Elephant',
      email: 'e2e@crechebooks.test',
      addressLine1: '3215 H Swala',
      city: 'Mabopane',
      province: 'Gauteng',
      postalCode: '0190',
      phone: '+27739356753',
      taxStatus: TaxStatus.VAT_REGISTERED,
      vatCategory: VatCategory.A,
      vatNumber: '4000000000',
      vatRegistrationDate: new Date('2020-01-01'),
    },
  });
  console.log(`E2E seed: tenant ${TENANT_ID} ready`);

  // 2) Admin user (matches DEV_USER_1_EMAIL in CI env).
  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: { isActive: true },
    create: {
      id: ADMIN_USER_ID,
      tenantId: TENANT_ID,
      auth0Id: 'dev-admin-at-crechebooks-dot-dev',
      email: 'admin@crechebooks.dev',
      name: 'E2E Admin',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  // Ensure email index sanity for dev-login lookup by email.
  console.log(`E2E seed: admin user ${ADMIN_USER_ID} ready (${ADMIN_BCRYPT_HASH.slice(0, 8)}…)`);

  // 3) Fee structures
  const today = new Date('2026-01-01');
  await prisma.feeStructure.upsert({
    where: { id: FEE_FULL_DAY_ID },
    update: {},
    create: {
      id: FEE_FULL_DAY_ID,
      tenantId: TENANT_ID,
      name: 'Full Day (E2E)',
      description: 'Full-day care fixture for E2E',
      feeType: FeeType.FULL_DAY,
      amountCents: 250000, // R2500
      vatInclusive: true,
      effectiveFrom: today,
      isActive: true,
    },
  });
  await prisma.feeStructure.upsert({
    where: { id: FEE_HALF_DAY_ID },
    update: {},
    create: {
      id: FEE_HALF_DAY_ID,
      tenantId: TENANT_ID,
      name: 'Half Day (E2E)',
      description: 'Half-day care fixture for E2E',
      feeType: FeeType.FULL_DAY, // Only FULL_DAY exists in the current enum
      amountCents: 150000, // R1500
      vatInclusive: true,
      effectiveFrom: today,
      isActive: true,
    },
  });
  console.log('E2E seed: fee structures ready');

  // 4) Parents
  await prisma.parent.upsert({
    where: { id: PARENT_ALICE_ID },
    update: {},
    create: {
      id: PARENT_ALICE_ID,
      tenantId: TENANT_ID,
      firstName: 'Alice',
      lastName: 'Ndlovu',
      email: 'alice@e2e.test',
      phone: '+27821000001',
      preferredContact: PreferredContact.EMAIL,
      isActive: true,
    },
  });
  await prisma.parent.upsert({
    where: { id: PARENT_BEN_ID },
    update: {},
    create: {
      id: PARENT_BEN_ID,
      tenantId: TENANT_ID,
      firstName: 'Ben',
      lastName: 'Naidoo',
      email: 'ben@e2e.test',
      phone: '+27821000002',
      preferredContact: PreferredContact.EMAIL,
      isActive: true,
    },
  });
  await prisma.parent.upsert({
    where: { id: PARENT_CARMEN_ID },
    update: {},
    create: {
      id: PARENT_CARMEN_ID,
      tenantId: TENANT_ID,
      firstName: 'Carmen',
      lastName: 'van der Merwe',
      email: 'carmen@e2e.test',
      phone: '+27821000003',
      preferredContact: PreferredContact.EMAIL,
      isActive: true,
    },
  });
  console.log('E2E seed: parents ready');

  // 5) Children
  const childBase = { tenantId: TENANT_ID, gender: Gender.FEMALE, isActive: true };
  await prisma.child.upsert({
    where: { id: CHILD_1_ID },
    update: {},
    create: {
      ...childBase,
      id: CHILD_1_ID,
      parentId: PARENT_ALICE_ID,
      firstName: 'Amara',
      lastName: 'Ndlovu',
      dateOfBirth: new Date('2022-06-15'),
      status: ChildStatus.ENROLLED,
    },
  });
  await prisma.child.upsert({
    where: { id: CHILD_2_ID },
    update: {},
    create: {
      ...childBase,
      id: CHILD_2_ID,
      parentId: PARENT_ALICE_ID,
      firstName: 'Bongi',
      lastName: 'Ndlovu',
      dateOfBirth: new Date('2024-01-05'),
      status: ChildStatus.ENROLLED,
    },
  });
  await prisma.child.upsert({
    where: { id: CHILD_3_ID },
    update: {},
    create: {
      ...childBase,
      id: CHILD_3_ID,
      gender: Gender.MALE,
      parentId: PARENT_BEN_ID,
      firstName: 'Kagiso',
      lastName: 'Naidoo',
      dateOfBirth: new Date('2023-09-20'),
      status: ChildStatus.ENROLLED,
    },
  });
  await prisma.child.upsert({
    where: { id: CHILD_4_ID },
    update: {},
    create: {
      ...childBase,
      id: CHILD_4_ID,
      gender: Gender.MALE,
      parentId: PARENT_CARMEN_ID,
      firstName: 'Daniel',
      lastName: 'van der Merwe',
      dateOfBirth: new Date('2021-03-14'),
      status: ChildStatus.WITHDRAWN,
    },
  });
  console.log('E2E seed: children ready');

  // 6) Enrollments (mix statuses so the enrollments spec status filter has data)
  await prisma.enrollment.upsert({
    where: { id: ENROLL_1_ID },
    update: {},
    create: {
      id: ENROLL_1_ID,
      tenantId: TENANT_ID,
      childId: CHILD_1_ID,
      feeStructureId: FEE_FULL_DAY_ID,
      startDate: new Date('2026-01-15'),
      status: EnrollmentStatus.ACTIVE,
    },
  });
  await prisma.enrollment.upsert({
    where: { id: ENROLL_2_ID },
    update: {},
    create: {
      id: ENROLL_2_ID,
      tenantId: TENANT_ID,
      childId: CHILD_2_ID,
      feeStructureId: FEE_HALF_DAY_ID,
      startDate: new Date('2026-02-01'),
      status: EnrollmentStatus.ACTIVE,
      siblingDiscountApplied: true,
    },
  });
  await prisma.enrollment.upsert({
    where: { id: ENROLL_3_ID },
    update: {},
    create: {
      id: ENROLL_3_ID,
      tenantId: TENANT_ID,
      childId: CHILD_3_ID,
      feeStructureId: FEE_FULL_DAY_ID,
      startDate: new Date('2026-01-10'),
      status: EnrollmentStatus.ACTIVE,
    },
  });
  await prisma.enrollment.upsert({
    where: { id: ENROLL_4_ID },
    update: {},
    create: {
      id: ENROLL_4_ID,
      tenantId: TENANT_ID,
      childId: CHILD_4_ID,
      feeStructureId: FEE_FULL_DAY_ID,
      startDate: new Date('2025-01-05'),
      endDate: new Date('2025-12-15'),
      status: EnrollmentStatus.WITHDRAWN,
    },
  });
  console.log('E2E seed: enrollments ready');

  // 7) Invoices — cover the InvoiceStatus values the specs filter by.
  // Each invoice gets one monthly-fee line so the total/subtotal/vat numbers
  // are self-consistent (educational fees are VAT-exempt in ZA so vat=0).
  const invoices = [
    {
      id: INVOICE_DRAFT_ID,
      number: 'INV-E2E-DRAFT-0001',
      childId: CHILD_1_ID,
      parentId: PARENT_ALICE_ID,
      status: InvoiceStatus.DRAFT,
      subtotalCents: 250000,
      totalCents: 250000,
      amountPaidCents: 0,
      issueDate: new Date('2026-05-01'),
      dueDate: new Date('2026-05-08'),
      periodStart: new Date('2026-05-01'),
      periodEnd: new Date('2026-05-31'),
    },
    {
      id: INVOICE_SENT_ID,
      number: 'INV-E2E-SENT-0001',
      childId: CHILD_2_ID,
      parentId: PARENT_ALICE_ID,
      status: InvoiceStatus.SENT,
      subtotalCents: 150000,
      totalCents: 150000,
      amountPaidCents: 0,
      issueDate: new Date('2026-04-01'),
      dueDate: new Date('2026-04-08'),
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-30'),
    },
    {
      id: INVOICE_PAID_ID,
      number: 'INV-E2E-PAID-0001',
      childId: CHILD_3_ID,
      parentId: PARENT_BEN_ID,
      status: InvoiceStatus.PAID,
      subtotalCents: 250000,
      totalCents: 250000,
      amountPaidCents: 250000,
      issueDate: new Date('2026-03-01'),
      dueDate: new Date('2026-03-08'),
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
    },
    {
      id: INVOICE_OVERDUE_ID,
      number: 'INV-E2E-OVERDUE-0001',
      childId: CHILD_3_ID,
      parentId: PARENT_BEN_ID,
      status: InvoiceStatus.OVERDUE,
      subtotalCents: 250000,
      totalCents: 250000,
      amountPaidCents: 0,
      issueDate: new Date('2026-02-01'),
      dueDate: new Date('2026-02-08'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-28'),
    },
  ];

  for (const inv of invoices) {
    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: {},
      create: {
        id: inv.id,
        tenantId: TENANT_ID,
        invoiceNumber: inv.number,
        parentId: inv.parentId,
        childId: inv.childId,
        billingPeriodStart: inv.periodStart,
        billingPeriodEnd: inv.periodEnd,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        subtotalCents: inv.subtotalCents,
        vatCents: 0,
        vatRate: 0,
        totalCents: inv.totalCents,
        amountPaidCents: inv.amountPaidCents,
        status: inv.status,
        lines: {
          create: [
            {
              description: `Monthly fee — ${inv.periodStart.toISOString().slice(0, 7)}`,
              quantity: 1,
              unitPriceCents: inv.subtotalCents,
              subtotalCents: inv.subtotalCents,
              vatCents: 0,
              totalCents: inv.subtotalCents,
              lineType: LineType.MONTHLY_FEE,
              accountCode: '4000',
              sortOrder: 0,
            },
          ],
        },
      },
    });
  }
  console.log(`E2E seed: ${invoices.length} invoices ready`);

  console.log('E2E seed: DONE');
}

seed()
  .catch((err) => {
    console.error('E2E seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
