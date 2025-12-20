<task_spec id="TASK-PAY-013" version="2.0">

<metadata>
  <title>Arrears Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>26</sequence>
  <implements>
    <requirement_ref>REQ-PAY-007</requirement_ref>
    <requirement_ref>REQ-PAY-008</requirement_ref>
    <requirement_ref>REQ-PAY-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-001</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-21</last_updated>
  <spec_version>2.0</spec_version>
</metadata>

<project_context>
## Current Project State
- **Total Tests**: 945 passing
- **Test Command**: `npm test` (Jest with Prisma test database)
- **Logic Layer Progress**: 10/21 tasks complete (47.6%)
- **Last Completed**: TASK-PAY-012 (Payment Allocation Service)

## Critical Rules (from constitution.md)
1. **All monetary values stored as integers (cents)** - NEVER use floats
2. **Use Decimal.js for all calculations** with precision 2, banker's rounding
3. **All async operations must have explicit try-catch handling**
4. **Tenant isolation enforced at query level** - ALWAYS filter by tenantId
5. **No mock data in tests** - use real Prisma database
6. **Fail fast** - throw with detailed errors, no silent failures or workarounds
7. **All changes logged with audit trail** (via AuditLogService)

## Technology Stack
- NestJS 10.x with TypeScript
- Prisma ORM with PostgreSQL
- Jest for testing with real database
- class-validator for DTOs
- Decimal.js for financial calculations
- Logger from @nestjs/common (NOT LoggerService)
</project_context>

<context>
This task creates the ArrearsService which calculates and reports on outstanding payments.
It provides aging analysis (current, 30 days, 60 days, 90+ days), identifies top debtors,
tracks parent payment history, and generates CSV exports for follow-up. This service powers
the arrears dashboard and enables proactive debt collection. The aging buckets help
prioritize collection efforts and identify high-risk accounts.
</context>

<actual_file_structure>
## CRITICAL: Actual Project Paths (NOT src/core/)

Services are in: `src/database/services/`
DTOs are in: `src/database/dto/`
Tests are in: `tests/database/services/`
Module is: `src/database/database.module.ts`
Exports are in: `src/database/services/index.ts` and `src/database/dto/index.ts`

## Existing Files to Reference (READ THESE FIRST)

### Repositories (use these directly via constructor injection):
- `src/database/repositories/invoice.repository.ts` - Has findByStatus(), findOverdue(), findByTenantId()
- `src/database/repositories/payment.repository.ts` - Has findByInvoiceId(), findByTenantId()
- `src/database/repositories/parent.repository.ts` - Has findById(), findByTenantId()

### Related Services (reference for patterns):
- `src/database/services/payment-matching.service.ts` - Similar service pattern
- `src/database/services/payment-allocation.service.ts` - Shows DTO patterns

### Entities:
- `src/database/entities/invoice.entity.ts` - InvoiceStatus enum: DRAFT, SENT, VIEWED, PARTIALLY_PAID, PAID, OVERDUE, VOID
- `src/database/entities/payment.entity.ts` - Payment entity, MatchType, MatchedBy

### Shared Exceptions:
- `src/shared/exceptions/` - NotFoundException, BusinessException, DatabaseException
</actual_file_structure>

<input_context_files>
  <file purpose="naming_conventions" priority="1">specs/constitution.md</file>
  <file purpose="invoice_entity" priority="2">src/database/entities/invoice.entity.ts</file>
  <file purpose="payment_entity" priority="3">src/database/entities/payment.entity.ts</file>
  <file purpose="invoice_repository" priority="4">src/database/repositories/invoice.repository.ts</file>
  <file purpose="payment_repository" priority="5">src/database/repositories/payment.repository.ts</file>
  <file purpose="parent_repository" priority="6">src/database/repositories/parent.repository.ts</file>
  <file purpose="service_pattern" priority="7">src/database/services/payment-allocation.service.ts</file>
  <file purpose="module_registration" priority="8">src/database/database.module.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-003 completed (Invoice entity exists) - ✅ VERIFIED</check>
  <check>TASK-PAY-001 completed (Payment entity exists) - ✅ VERIFIED</check>
  <check>InvoiceRepository available - ✅ VERIFIED at src/database/repositories/invoice.repository.ts</check>
  <check>PaymentRepository available - ✅ VERIFIED at src/database/repositories/payment.repository.ts</check>
  <check>ParentRepository available - ✅ VERIFIED at src/database/repositories/parent.repository.ts</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ArrearsService at src/database/services/arrears.service.ts
    - Create arrears.dto.ts at src/database/dto/arrears.dto.ts
    - Implement getArrearsReport (summary with aging)
    - Implement calculateAging (current, 30, 60, 90+ day buckets)
    - Implement getParentHistory (payment patterns per parent)
    - Implement getTopDebtors (sorted by outstanding amount)
    - Implement exportArrearsCSV (for external follow-up)
    - Calculate days overdue based on invoice due date
    - Support filtering by date range, parent, or minimum amount
    - Add to DatabaseModule providers and exports
    - Export from src/database/services/index.ts and src/database/dto/index.ts
    - Create integration tests at tests/database/services/arrears.service.spec.ts
  </in_scope>
  <out_of_scope>
    - Payment reminder sending (TASK-PAY-014)
    - API endpoints (API layer tasks)
    - Dashboard UI components
    - Automated debt collection workflows
    - Xero sync (not needed for arrears calculation)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/database/services/arrears.service.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { PrismaService } from '../prisma/prisma.service';
      import { InvoiceRepository } from '../repositories/invoice.repository';
      import { PaymentRepository } from '../repositories/payment.repository';
      import { ParentRepository } from '../repositories/parent.repository';
      import Decimal from 'decimal.js';

      @Injectable()
      export class ArrearsService {
        private readonly logger = new Logger(ArrearsService.name);

        constructor(
          private readonly prisma: PrismaService,
          private readonly invoiceRepo: InvoiceRepository,
          private readonly paymentRepo: PaymentRepository,
          private readonly parentRepo: ParentRepository,
        ) {}

        async getArrearsReport(
          tenantId: string,
          filters?: ArrearsFilters
        ): Promise&lt;ArrearsReport&gt;

        calculateAging(
          invoices: InvoiceWithRelations[]
        ): AgingBuckets

        async getParentHistory(
          parentId: string,
          tenantId: string
        ): Promise&lt;ParentPaymentHistory&gt;

        async getTopDebtors(
          tenantId: string,
          limit?: number
        ): Promise&lt;DebtorSummary[]&gt;

        async exportArrearsCSV(
          tenantId: string,
          filters?: ArrearsFilters
        ): Promise&lt;string&gt;

        private calculateDaysOverdue(
          dueDate: Date
        ): number

        private categorizeByAgingBucket(
          daysOverdue: number
        ): AgingBucketType
      }
    </signature>
    <signature file="src/database/dto/arrears.dto.ts">
      import {
        IsUUID,
        IsOptional,
        IsDate,
        IsInt,
        Min,
      } from 'class-validator';
      import { Type } from 'class-transformer';

      export class ArrearsFiltersDto {
        @IsOptional()
        @IsDate()
        @Type(() => Date)
        dateFrom?: Date;

        @IsOptional()
        @IsDate()
        @Type(() => Date)
        dateTo?: Date;

        @IsOptional()
        @IsUUID()
        parentId?: string;

        @IsOptional()
        @IsInt()
        @Min(0)
        minAmountCents?: number;
      }

      export type AgingBucketType = 'current' | '30' | '60' | '90+';

      export interface AgingBuckets {
        currentCents: number;      // 0-7 days overdue
        days30Cents: number;       // 8-30 days overdue
        days60Cents: number;       // 31-60 days overdue
        days90PlusCents: number;   // 61+ days overdue
      }

      export interface ArrearsReportSummary {
        totalOutstandingCents: number;
        totalInvoices: number;
        aging: AgingBuckets;
      }

      export interface DebtorSummary {
        parentId: string;
        parentName: string;
        parentEmail: string | null;
        parentPhone: string | null;
        totalOutstandingCents: number;
        oldestInvoiceDate: Date;
        invoiceCount: number;
        maxDaysOverdue: number;
      }

      export interface ArrearsInvoice {
        invoiceId: string;
        invoiceNumber: string;
        parentId: string;
        parentName: string;
        childId: string;
        childName: string;
        issueDate: Date;
        dueDate: Date;
        totalCents: number;
        amountPaidCents: number;
        outstandingCents: number;
        daysOverdue: number;
        agingBucket: AgingBucketType;
      }

      export interface ArrearsReport {
        summary: ArrearsReportSummary;
        topDebtors: DebtorSummary[];
        invoices: ArrearsInvoice[];
        generatedAt: Date;
      }

      export interface PaymentHistoryEntry {
        invoiceId: string;
        invoiceNumber: string;
        invoiceDate: Date;
        dueDate: Date;
        paidDate: Date | null;
        totalCents: number;
        paidCents: number;
        daysToPayment: number | null;
        status: 'paid' | 'partial' | 'overdue';
      }

      export interface ParentPaymentHistory {
        parentId: string;
        parentName: string;
        totalInvoicedCents: number;
        totalPaidCents: number;
        totalOutstandingCents: number;
        onTimePaymentCount: number;
        latePaymentCount: number;
        averageDaysToPayment: number;
        paymentHistory: PaymentHistoryEntry[];
      }
    </signature>
  </signatures>

  <constraints>
    - Days overdue calculated from invoice.dueDate to current date (new Date())
    - Aging buckets: current (0-7 days), 30 (8-30), 60 (31-60), 90+ (61+)
    - Only include invoices with outstanding balance > 0 (totalCents - amountPaidCents > 0)
    - Only include invoices in status SENT, PARTIALLY_PAID, or OVERDUE
    - Top debtors sorted by totalOutstandingCents (descending)
    - CSV export includes all invoice details for follow-up
    - Parent history includes both paid and outstanding invoices
    - MUST respect tenant isolation (tenantId in all queries)
    - Performance: use raw SQL queries for getTopDebtors aggregation
    - ALL amounts in CENTS (integers) - convert to currency only at presentation layer
    - Use Decimal.js for all calculations to avoid floating point errors
  </constraints>

  <verification>
    - Service instantiates without errors via NestJS DI
    - getArrearsReport returns correct summary with aging buckets
    - Aging buckets calculated correctly based on days overdue thresholds
    - Top debtors sorted by outstanding amount descending
    - Parent history shows accurate payment patterns and averages
    - CSV export generates valid CSV format with proper escaping
    - Filters apply correctly (date range, parent, min amount)
    - Days overdue is 0 for not-yet-due invoices
    - Performance acceptable with 10,000+ invoices (use database-level aggregation)
    - All tests pass with real database
    - Lint passes (npm run lint)
    - Build passes (npm run build)
    - Test count increases (currently 945, expect ~980+)
  </verification>
</definition_of_done>

<implementation_steps>
## Step-by-Step Implementation Guide

### Step 1: Read Context Files
Read these files to understand patterns (in this order):
1. specs/constitution.md - Coding standards and rules
2. src/database/services/payment-allocation.service.ts - Service patterns
3. src/database/dto/payment-allocation.dto.ts - DTO patterns
4. src/database/repositories/invoice.repository.ts - Available methods
5. src/database/repositories/payment.repository.ts - Available methods
6. src/database/repositories/parent.repository.ts - Available methods
7. src/database/database.module.ts - Module registration pattern

### Step 2: Create DTOs (src/database/dto/arrears.dto.ts)
- Create ArrearsFiltersDto with class-validator decorators
- Create interfaces: AgingBuckets, ArrearsReport, DebtorSummary, ArrearsInvoice
- Create ParentPaymentHistory and PaymentHistoryEntry interfaces
- Add export to src/database/dto/index.ts

### Step 3: Create ArrearsService (src/database/services/arrears.service.ts)
- Inject: PrismaService, InvoiceRepository, PaymentRepository, ParentRepository
- Implement getArrearsReport() - main entry point
- Implement calculateAging() - bucket calculation
- Implement getParentHistory() - payment pattern analysis
- Implement getTopDebtors() - use raw SQL for performance
- Implement exportArrearsCSV() - CSV generation with proper escaping
- Implement private helpers: calculateDaysOverdue(), categorizeByAgingBucket()

### Step 4: Register in Module
- Add to DatabaseModule providers array
- Add to DatabaseModule exports array
- Add export to src/database/services/index.ts

### Step 5: Create Integration Tests (tests/database/services/arrears.service.spec.ts)
- Use REAL Prisma database (no mocks)
- Create test data via repositories in beforeEach
- Test all public methods
- Test edge cases: no invoices, all paid, various aging buckets
- Test filters: dateFrom, dateTo, parentId, minAmountCents
- Test CSV export format
- Clean up test data in afterEach

### Step 6: Validate
1. Run: `npm run lint` - fix any issues
2. Run: `npm run build` - ensure compiles
3. Run: `npm test` - all tests must pass (945+ tests)
</implementation_steps>

<pseudo_code>
// src/database/services/arrears.service.ts

@Injectable()
export class ArrearsService:
  private readonly logger = new Logger(ArrearsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly parentRepo: ParentRepository,
  )

  async getArrearsReport(tenantId: string, filters?: ArrearsFiltersDto): Promise&lt;ArrearsReport&gt;:
    this.logger.log(`Generating arrears report for tenant ${tenantId}`)

    // 1. Build where clause for outstanding invoices
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      isDeleted: false,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
    }

    // 2. Apply filters
    if filters?.dateFrom:
      where.issueDate = { gte: filters.dateFrom }
    if filters?.dateTo:
      where.issueDate = { ...where.issueDate, lte: filters.dateTo }
    if filters?.parentId:
      where.parentId = filters.parentId

    // 3. Query invoices with relations
    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { parent: true, child: true },
      orderBy: { dueDate: 'asc' },
    })

    // 4. Filter by outstanding balance and optional minAmount
    const outstandingInvoices = invoices.filter(inv => {
      const outstanding = inv.totalCents - inv.amountPaidCents
      if outstanding <= 0: return false
      if filters?.minAmountCents && outstanding < filters.minAmountCents: return false
      return true
    })

    // 5. Calculate aging
    const aging = this.calculateAging(outstandingInvoices)

    // 6. Get top debtors
    const topDebtors = await this.getTopDebtors(tenantId, 10)

    // 7. Build arrears invoice list
    const arrearsInvoices = outstandingInvoices.map(inv => {
      const outstandingCents = inv.totalCents - inv.amountPaidCents
      const daysOverdue = this.calculateDaysOverdue(inv.dueDate)
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        parentId: inv.parentId,
        parentName: `${inv.parent.firstName} ${inv.parent.lastName}`,
        childId: inv.childId,
        childName: inv.child.firstName,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        amountPaidCents: inv.amountPaidCents,
        outstandingCents,
        daysOverdue,
        agingBucket: this.categorizeByAgingBucket(daysOverdue),
      }
    })

    // 8. Calculate summary
    const totalOutstandingCents = outstandingInvoices.reduce(
      (sum, inv) => sum.plus(inv.totalCents - inv.amountPaidCents),
      new Decimal(0)
    ).toNumber()

    return {
      summary: {
        totalOutstandingCents,
        totalInvoices: outstandingInvoices.length,
        aging,
      },
      topDebtors,
      invoices: arrearsInvoices,
      generatedAt: new Date(),
    }

  calculateAging(invoices: InvoiceWithRelations[]): AgingBuckets:
    const buckets = {
      currentCents: new Decimal(0),
      days30Cents: new Decimal(0),
      days60Cents: new Decimal(0),
      days90PlusCents: new Decimal(0),
    }

    for const invoice of invoices:
      const outstanding = new Decimal(invoice.totalCents - invoice.amountPaidCents)
      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate)

      if daysOverdue <= 7:
        buckets.currentCents = buckets.currentCents.plus(outstanding)
      else if daysOverdue <= 30:
        buckets.days30Cents = buckets.days30Cents.plus(outstanding)
      else if daysOverdue <= 60:
        buckets.days60Cents = buckets.days60Cents.plus(outstanding)
      else:
        buckets.days90PlusCents = buckets.days90PlusCents.plus(outstanding)

    return {
      currentCents: buckets.currentCents.toNumber(),
      days30Cents: buckets.days30Cents.toNumber(),
      days60Cents: buckets.days60Cents.toNumber(),
      days90PlusCents: buckets.days90PlusCents.toNumber(),
    }

  async getParentHistory(parentId: string, tenantId: string): Promise&lt;ParentPaymentHistory&gt;:
    // 1. Get parent
    const parent = await this.parentRepo.findById(parentId)
    if !parent || parent.tenantId !== tenantId:
      throw new NotFoundException('Parent', parentId)

    // 2. Get all invoices for parent
    const invoices = await this.prisma.invoice.findMany({
      where: { parentId, tenantId, isDeleted: false },
      orderBy: { issueDate: 'desc' },
    })

    // 3. Get all payments for these invoices
    const invoiceIds = invoices.map(i => i.id)
    const payments = await this.prisma.payment.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        isReversed: false,
      },
      orderBy: { paymentDate: 'asc' },
    })

    // 4. Build payment history entries
    const paymentHistory: PaymentHistoryEntry[] = invoices.map(inv => {
      const invoicePayments = payments.filter(p => p.invoiceId === inv.id)
      const totalPaid = invoicePayments.reduce((sum, p) => sum + p.amountCents, 0)
      const firstPayment = invoicePayments[0]

      let daysToPayment: number | null = null
      if firstPayment:
        const payDate = new Date(firstPayment.paymentDate)
        const issDate = new Date(inv.issueDate)
        daysToPayment = Math.floor((payDate.getTime() - issDate.getTime()) / (1000 * 60 * 60 * 24))

      const isPaid = totalPaid >= inv.totalCents
      const isPartial = totalPaid > 0 && totalPaid < inv.totalCents

      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.issueDate,
        dueDate: inv.dueDate,
        paidDate: isPaid && firstPayment ? firstPayment.paymentDate : null,
        totalCents: inv.totalCents,
        paidCents: totalPaid,
        daysToPayment,
        status: isPaid ? 'paid' : isPartial ? 'partial' : 'overdue',
      }
    })

    // 5. Calculate statistics
    const paidEntries = paymentHistory.filter(h => h.status === 'paid')
    const onTimeCount = paidEntries.filter(h =>
      h.paidDate && new Date(h.paidDate) <= new Date(h.dueDate)
    ).length
    const lateCount = paidEntries.filter(h =>
      h.paidDate && new Date(h.paidDate) > new Date(h.dueDate)
    ).length

    const avgDays = paidEntries.length > 0
      ? paidEntries.reduce((sum, h) => sum + (h.daysToPayment || 0), 0) / paidEntries.length
      : 0

    const totalInvoiced = invoices.reduce((sum, i) => sum + i.totalCents, 0)
    const totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0)

    return {
      parentId: parent.id,
      parentName: `${parent.firstName} ${parent.lastName}`,
      totalInvoicedCents: totalInvoiced,
      totalPaidCents: totalPaid,
      totalOutstandingCents: totalInvoiced - totalPaid,
      onTimePaymentCount: onTimeCount,
      latePaymentCount: lateCount,
      averageDaysToPayment: Math.round(avgDays),
      paymentHistory,
    }

  async getTopDebtors(tenantId: string, limit: number = 10): Promise&lt;DebtorSummary[]&gt;:
    // Use raw SQL for aggregation performance
    const result = await this.prisma.$queryRaw`
      SELECT
        p.id as parent_id,
        p.first_name || ' ' || p.last_name as parent_name,
        p.email as parent_email,
        p.phone as parent_phone,
        SUM(i.total_cents - i.amount_paid_cents) as total_outstanding_cents,
        MIN(i.due_date) as oldest_invoice_date,
        COUNT(i.id) as invoice_count,
        MAX(EXTRACT(DAY FROM (CURRENT_DATE - i.due_date))) as max_days_overdue
      FROM parents p
      INNER JOIN invoices i ON i.parent_id = p.id
      WHERE i.tenant_id = ${tenantId}
        AND i.is_deleted = false
        AND i.status IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
        AND (i.total_cents - i.amount_paid_cents) > 0
      GROUP BY p.id, p.first_name, p.last_name, p.email, p.phone
      ORDER BY total_outstanding_cents DESC
      LIMIT ${limit}
    `

    return (result as any[]).map(row => ({
      parentId: row.parent_id,
      parentName: row.parent_name,
      parentEmail: row.parent_email,
      parentPhone: row.parent_phone,
      totalOutstandingCents: Number(row.total_outstanding_cents),
      oldestInvoiceDate: row.oldest_invoice_date,
      invoiceCount: Number(row.invoice_count),
      maxDaysOverdue: Math.max(0, Number(row.max_days_overdue || 0)),
    }))

  async exportArrearsCSV(tenantId: string, filters?: ArrearsFiltersDto): Promise&lt;string&gt;:
    const report = await this.getArrearsReport(tenantId, filters)

    // CSV Header
    const headers = [
      'Invoice Number',
      'Parent Name',
      'Child Name',
      'Issue Date',
      'Due Date',
      'Total (ZAR)',
      'Paid (ZAR)',
      'Outstanding (ZAR)',
      'Days Overdue',
      'Aging Bucket',
    ].join(',')

    // CSV Rows - escape values properly
    const rows = report.invoices.map(inv => {
      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`
      return [
        escape(inv.invoiceNumber),
        escape(inv.parentName),
        escape(inv.childName),
        inv.issueDate.toISOString().split('T')[0],
        inv.dueDate.toISOString().split('T')[0],
        (inv.totalCents / 100).toFixed(2),
        (inv.amountPaidCents / 100).toFixed(2),
        (inv.outstandingCents / 100).toFixed(2),
        inv.daysOverdue.toString(),
        escape(inv.agingBucket),
      ].join(',')
    })

    return [headers, ...rows].join('\n')

  private calculateDaysOverdue(dueDate: Date): number:
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)

    const diffMs = today.getTime() - due.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    return Math.max(0, diffDays) // 0 for not-yet-due

  private categorizeByAgingBucket(daysOverdue: number): AgingBucketType:
    if daysOverdue <= 7: return 'current'
    if daysOverdue <= 30: return '30'
    if daysOverdue <= 60: return '60'
    return '90+'
</pseudo_code>

<files_to_create>
  <file path="src/database/dto/arrears.dto.ts">Arrears DTOs and interfaces</file>
  <file path="src/database/services/arrears.service.ts">ArrearsService implementation</file>
  <file path="tests/database/services/arrears.service.spec.ts">Integration tests with real database</file>
</files_to_create>

<files_to_modify>
  <file path="src/database/dto/index.ts">Add: export * from './arrears.dto';</file>
  <file path="src/database/services/index.ts">Add: export * from './arrears.service';</file>
  <file path="src/database/database.module.ts">Add ArrearsService to providers and exports arrays</file>
</files_to_modify>

<test_requirements>
## Test File: tests/database/services/arrears.service.spec.ts

### Setup Pattern (copy from payment-allocation.service.spec.ts)
- Import PrismaService, all repositories, and ArrearsService
- Create real test data in beforeEach using repositories
- Clean up in afterEach
- NO MOCKS - all tests use real Prisma database

### Test Cases Required
1. **getArrearsReport**
   - Returns correct summary for multiple invoices
   - Aging buckets correctly categorized
   - Only includes outstanding invoices (not PAID or VOID)
   - Filters by dateFrom/dateTo correctly
   - Filters by parentId correctly
   - Filters by minAmountCents correctly
   - Returns empty report when no outstanding invoices

2. **calculateAging**
   - Correctly buckets current (0-7 days)
   - Correctly buckets 30 days (8-30)
   - Correctly buckets 60 days (31-60)
   - Correctly buckets 90+ days (61+)
   - Handles mixed invoices across all buckets

3. **getParentHistory**
   - Returns correct payment history
   - Calculates on-time vs late payments correctly
   - Calculates average days to payment
   - Throws NotFoundException for invalid parent
   - Respects tenant isolation

4. **getTopDebtors**
   - Returns debtors sorted by outstanding amount
   - Respects limit parameter
   - Calculates max days overdue correctly
   - Returns empty array when no debtors

5. **exportArrearsCSV**
   - Generates valid CSV format
   - Escapes special characters properly
   - Includes all required columns
   - Applies filters correctly

6. **Edge Cases**
   - Invoice due today (0 days overdue)
   - Invoice not yet due (negative diff = 0 days overdue)
   - Parent with no invoices
   - All invoices fully paid (no outstanding)
</test_requirements>

<validation_criteria>
  <criterion>Service compiles without TypeScript errors</criterion>
  <criterion>getArrearsReport returns correct summary with aging</criterion>
  <criterion>Aging buckets calculated correctly: current (0-7), 30 (8-30), 60 (31-60), 90+ (61+)</criterion>
  <criterion>Days overdue is 0 for invoices not yet due</criterion>
  <criterion>Top debtors sorted by outstanding amount descending</criterion>
  <criterion>Parent history shows accurate payment patterns</criterion>
  <criterion>CSV export generates valid CSV with proper escaping</criterion>
  <criterion>Filters apply correctly (date range, parent, min amount)</criterion>
  <criterion>Only includes invoices with outstanding balance > 0</criterion>
  <criterion>Only includes invoices with status SENT, PARTIALLY_PAID, or OVERDUE</criterion>
  <criterion>All amounts in cents (integers)</criterion>
  <criterion>Tenant isolation enforced on all operations</criterion>
  <criterion>npm run lint passes</criterion>
  <criterion>npm run build passes</criterion>
  <criterion>npm test passes (all tests including new ones)</criterion>
</validation_criteria>

<test_commands>
  <command>npm run lint</command>
  <command>npm run build</command>
  <command>npm test</command>
  <command>npm test -- --testPathPattern="arrears"</command>
</test_commands>

<error_handling>
## Error Handling Requirements (Fail Fast - No Workarounds)

1. **NotFoundException**: Throw when parent not found in getParentHistory
2. **BusinessException**: Throw for invalid filter combinations
3. **DatabaseException**: Wrap Prisma errors with context
4. **All errors must be logged** with this.logger.error() before throwing
5. **NO silent failures** - if something goes wrong, throw with details
6. **NO fallback logic** - if query fails, error out completely

Example pattern:
```typescript
try {
  // operation
} catch (error) {
  this.logger.error(
    `Failed to get arrears report for tenant ${tenantId}`,
    error instanceof Error ? error.stack : String(error),
  );
  if (error instanceof NotFoundException) throw error;
  throw new DatabaseException(
    'getArrearsReport',
    'Failed to generate arrears report',
    error instanceof Error ? error : undefined,
  );
}
```
</error_handling>

</task_spec>
