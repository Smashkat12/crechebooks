<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-003</task_id>
    <title>Fix Invoice Number Race Condition</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>invoice-number</tag>
      <tag>race-condition</tag>
      <tag>database</tag>
      <tag>sequence</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Concurrent invoice creation can generate duplicate invoice numbers due to
      non-atomic number generation. Current implementation reads max number,
      increments, and saves - allowing race conditions between read and write.
    </problem_statement>

    <business_impact>
      - Duplicate invoice numbers violate accounting standards
      - Legal/compliance issues with invoice numbering requirements
      - Manual intervention required to resolve duplicates
      - Customer confusion with duplicate numbered invoices
      - Audit trail integrity compromised
    </business_impact>

    <root_cause>
      Invoice number generation uses SELECT MAX() + 1 pattern which is not
      atomic. Between reading the max and inserting the new invoice, another
      request can read the same max value.
    </root_cause>

    <affected_users>
      - Finance team creating multiple invoices simultaneously
      - Automated batch invoice processes
      - Any high-concurrency billing scenarios
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Invoice number generation service</item>
      <item>Database sequence implementation</item>
      <item>Atomic increment mechanism</item>
      <item>Retry logic for conflicts</item>
      <item>Number format preservation</item>
    </in_scope>

    <out_of_scope>
      <item>Invoice number format/pattern changes</item>
      <item>Historical invoice number correction</item>
      <item>Multi-region number synchronization</item>
    </out_of_scope>

    <affected_files>
      <file>apps/api/src/billing/invoice-number.service.ts</file>
      <file>apps/api/src/billing/billing.service.ts</file>
      <file>prisma/migrations/XXXXXX_add_invoice_sequence.sql</file>
    </affected_files>

    <dependencies>
      <dependency type="database">PostgreSQL sequence support</dependency>
      <dependency type="task">TASK-BILL-002 (transaction isolation)</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Replace SELECT MAX() + 1 pattern with PostgreSQL sequence for guaranteed
      atomic, gap-free invoice number generation. Include organization-scoped
      sequences and proper number formatting.
    </approach>

    <steps>
      <step order="1">
        <description>Analyze current invoice number generation</description>
        <details>
          - Document current number format (e.g., INV-2026-00001)
          - Identify per-organization vs global numbering
          - Map all callsites using invoice number generation
        </details>
      </step>

      <step order="2">
        <description>Create database migration for sequences</description>
        <details>
          - Add invoice_number_sequences table for per-org sequences
          - Create function for atomic number retrieval
          - Migrate existing max values to sequences
        </details>
        <code_snippet>
```sql
-- prisma/migrations/XXXXXX_add_invoice_sequence.sql

-- Table to track per-organization invoice sequences
CREATE TABLE invoice_number_sequences (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  current_value BIGINT NOT NULL DEFAULT 0,
  prefix VARCHAR(10) DEFAULT 'INV',
  year_format BOOLEAN DEFAULT true,
  padding INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Function for atomic next value retrieval
CREATE OR REPLACE FUNCTION next_invoice_number(org_id UUID)
RETURNS BIGINT AS $$
DECLARE
  next_val BIGINT;
BEGIN
  UPDATE invoice_number_sequences
  SET current_value = current_value + 1,
      updated_at = NOW()
  WHERE organization_id = org_id
  RETURNING current_value INTO next_val;

  -- If no row exists, create one
  IF next_val IS NULL THEN
    INSERT INTO invoice_number_sequences (organization_id, current_value)
    VALUES (org_id, 1)
    ON CONFLICT (organization_id) DO UPDATE
    SET current_value = invoice_number_sequences.current_value + 1
    RETURNING current_value INTO next_val;
  END IF;

  RETURN next_val;
END;
$$ LANGUAGE plpgsql;

-- Initialize sequences from existing invoices
INSERT INTO invoice_number_sequences (organization_id, current_value)
SELECT
  organization_id,
  COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS BIGINT)), 0)
FROM invoices
GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
SET current_value = GREATEST(
  invoice_number_sequences.current_value,
  EXCLUDED.current_value
);
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Implement atomic invoice number service</description>
        <details>
          - Create new service using database function
          - Handle sequence initialization for new organizations
          - Maintain number format compatibility
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/invoice-number.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface InvoiceNumberConfig {
  prefix: string;
  yearFormat: boolean;
  padding: number;
}

@Injectable()
export class InvoiceNumberService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate next invoice number atomically using database sequence
   * Returns formatted number like "INV-2026-00001"
   */
  async generateNextNumber(
    organizationId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || this.prisma;

    // Get next sequence value atomically
    const result = await client.$queryRaw<[{ next_invoice_number: bigint }]>`
      SELECT next_invoice_number(${organizationId}::uuid)
    `;

    const sequenceValue = Number(result[0].next_invoice_number);

    // Get organization's number format config
    const config = await this.getNumberConfig(organizationId, client);

    return this.formatInvoiceNumber(sequenceValue, config);
  }

  private async getNumberConfig(
    organizationId: string,
    client: PrismaService | Prisma.TransactionClient
  ): Promise<InvoiceNumberConfig> {
    const sequence = await client.invoiceNumberSequence.findUnique({
      where: { organizationId },
    });

    return {
      prefix: sequence?.prefix ?? 'INV',
      yearFormat: sequence?.yearFormat ?? true,
      padding: sequence?.padding ?? 5,
    };
  }

  private formatInvoiceNumber(
    value: number,
    config: InvoiceNumberConfig
  ): string {
    const paddedValue = String(value).padStart(config.padding, '0');

    if (config.yearFormat) {
      const year = new Date().getFullYear();
      return `${config.prefix}-${year}-${paddedValue}`;
    }

    return `${config.prefix}-${paddedValue}`;
  }

  /**
   * Reserve a batch of invoice numbers atomically
   * For batch invoice generation
   */
  async reserveNumbers(
    organizationId: string,
    count: number,
    tx?: Prisma.TransactionClient
  ): Promise<string[]> {
    const client = tx || this.prisma;
    const config = await this.getNumberConfig(organizationId, client);

    // Atomic batch increment
    const result = await client.$queryRaw<[{ current_value: bigint }]>`
      UPDATE invoice_number_sequences
      SET current_value = current_value + ${count},
          updated_at = NOW()
      WHERE organization_id = ${organizationId}::uuid
      RETURNING current_value
    `;

    const endValue = Number(result[0].current_value);
    const startValue = endValue - count + 1;

    // Generate all numbers in the reserved range
    const numbers: string[] = [];
    for (let i = startValue; i <= endValue; i++) {
      numbers.push(this.formatInvoiceNumber(i, config));
    }

    return numbers;
  }

  /**
   * Get current sequence value without incrementing
   * For preview/reporting purposes
   */
  async getCurrentValue(organizationId: string): Promise<number> {
    const sequence = await this.prisma.invoiceNumberSequence.findUnique({
      where: { organizationId },
    });

    return sequence?.currentValue ?? 0;
  }
}
```
        </code_snippet>
      </step>

      <step order="4">
        <description>Update billing service to use new number generator</description>
        <details>
          - Replace all MAX() + 1 calls with service
          - Ensure numbers generated within transactions
          - Update batch invoice to use reserveNumbers
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/billing.service.ts
@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private invoiceNumberService: InvoiceNumberService,
  ) {}

  async createInvoice(data: CreateInvoiceDto): Promise<Invoice> {
    return this.prisma.$transaction(async (tx) => {
      // Generate number within transaction
      const invoiceNumber = await this.invoiceNumberService.generateNextNumber(
        data.organizationId,
        tx
      );

      return tx.invoice.create({
        data: {
          ...data,
          invoiceNumber,
        },
      });
    });
  }

  async generateBatchInvoices(
    organizationId: string,
    items: BillingItem[]
  ): Promise<Invoice[]> {
    return this.prisma.$transaction(async (tx) => {
      const customerGroups = this.groupByCustomer(items);
      const invoiceCount = Object.keys(customerGroups).length;

      // Reserve all numbers upfront
      const numbers = await this.invoiceNumberService.reserveNumbers(
        organizationId,
        invoiceCount,
        tx
      );

      const invoices: Invoice[] = [];
      let numberIndex = 0;

      for (const [customerId, customerItems] of Object.entries(customerGroups)) {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: numbers[numberIndex++],
            organizationId,
            customerId,
            // ... rest of invoice data
          },
        });
        invoices.push(invoice);
      }

      return invoices;
    });
  }
}
```
        </code_snippet>
      </step>

      <step order="5">
        <description>Add duplicate detection and recovery</description>
        <details>
          - Add unique constraint on invoice_number per organization
          - Implement conflict detection in catch block
          - Add monitoring for sequence anomalies
        </details>
      </step>
    </steps>

    <technical_notes>
      - PostgreSQL sequences are atomic and handle concurrent access
      - UPDATE ... RETURNING is atomic in single statement
      - Sequence values are not rolled back on transaction failure (gaps possible)
      - Consider yearly sequence reset requirements
      - Unique constraint provides defense-in-depth
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Concurrent invoice creation generates unique numbers</description>
        <preconditions>10 simultaneous invoice creation requests</preconditions>
        <expected_result>10 unique, sequential invoice numbers generated</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>Batch reservation is atomic</description>
        <preconditions>Reserve 100 numbers while another process reserves 50</preconditions>
        <expected_result>All 150 numbers unique with no gaps in each batch</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>New organization gets initialized sequence</description>
        <preconditions>First invoice for new organization</preconditions>
        <expected_result>Invoice number starts at 1 with correct format</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Transaction rollback doesn't cause duplicates</description>
        <preconditions>Invoice creation fails after number generation</preconditions>
        <expected_result>Next invoice gets next number (gap acceptable)</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Year format handled correctly at year boundary</description>
        <preconditions>Invoice created Jan 1 after Dec 31 invoice</preconditions>
        <expected_result>New year in number, sequence continues</expected_result>
      </test_case>
    </test_cases>

    <concurrency_testing>
      <scenario>100 concurrent requests for same organization</scenario>
      <scenario>Batch + single invoice concurrent creation</scenario>
      <scenario>Multiple organizations concurrent invoice creation</scenario>
    </concurrency_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Database sequence mechanism implemented</criterion>
      <criterion>Atomic invoice number generation verified</criterion>
      <criterion>Batch number reservation working correctly</criterion>
      <criterion>Unique constraint added to invoice_number</criterion>
      <criterion>All concurrent tests pass</criterion>
      <criterion>Migration tested on production-like data</criterion>
      <criterion>Number format compatibility maintained</criterion>
      <criterion>Performance within acceptable limits</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">Database migration created and tested</item>
      <item checked="false">InvoiceNumberService implemented</item>
      <item checked="false">BillingService updated to use new service</item>
      <item checked="false">Unit tests for all scenarios</item>
      <item checked="false">Concurrency/load tests passing</item>
      <item checked="false">Existing invoice numbers migrated to sequences</item>
      <item checked="false">Rollback migration prepared</item>
      <item checked="false">Documentation updated</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="documentation">PostgreSQL Sequences</reference>
    <reference type="pattern">Atomic Counter Pattern</reference>
    <reference type="compliance">Invoice Numbering Requirements</reference>
  </references>
</task_specification>
