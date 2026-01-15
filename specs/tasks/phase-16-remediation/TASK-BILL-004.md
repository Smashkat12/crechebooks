<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-004</task_id>
    <title>Fix Credit Balance VAT Recalculation</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>credits</tag>
      <tag>vat</tag>
      <tag>calculation</tag>
      <tag>invoicing</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      When credit notes or credit balances are applied to invoices, the VAT is
      not recalculated correctly. Credits are applied to the gross amount but
      the VAT breakdown still reflects the original pre-credit amounts, causing
      incorrect VAT reporting.
    </problem_statement>

    <business_impact>
      - Incorrect VAT amounts on invoices with credits applied
      - VAT return discrepancies
      - Compliance risk with tax authorities
      - Customer disputes over VAT charges
      - Accounting reconciliation failures
    </business_impact>

    <root_cause>
      Credit application logic reduces the total amount but does not recalculate
      the VAT component proportionally. The VAT breakdown is captured at invoice
      creation and not updated when credits are applied.
    </root_cause>

    <affected_users>
      - Customers with credit balances
      - Finance team generating invoices with credit application
      - Accountants preparing VAT returns
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Credit application service VAT handling</item>
      <item>Invoice VAT recalculation on credit application</item>
      <item>Credit note VAT treatment</item>
      <item>VAT breakdown update logic</item>
      <item>Partial credit application scenarios</item>
    </in_scope>

    <out_of_scope>
      <item>Credit creation workflow</item>
      <item>Credit balance management</item>
      <item>Historical invoice correction</item>
      <item>Multi-currency credit handling</item>
    </out_of_scope>

    <affected_files>
      <file>apps/api/src/billing/credit.service.ts</file>
      <file>apps/api/src/billing/invoice-calculation.service.ts</file>
      <file>apps/api/src/billing/vat.service.ts</file>
      <file>apps/api/src/billing/models/credit-application.model.ts</file>
    </affected_files>

    <dependencies>
      <dependency type="task">TASK-BILL-001 (VAT calculation sync)</dependency>
      <dependency type="knowledge">VAT regulations for credit notes</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement proportional VAT recalculation when credits are applied to
      invoices. Credits should reduce both the net amount and VAT proportionally,
      maintaining correct VAT rates on the adjusted total.
    </approach>

    <steps>
      <step order="1">
        <description>Analyze current credit application flow</description>
        <details>
          - Map credit application scenarios
          - Document current VAT handling (or lack thereof)
          - Identify all credit types (credit notes, account credits, discounts)
          - Review VAT regulations for credit application
        </details>
      </step>

      <step order="2">
        <description>Design VAT recalculation strategy</description>
        <details>
          - Determine proportional allocation method
          - Handle mixed VAT rate invoices
          - Define rounding rules for VAT adjustment
          - Consider credit note VAT reversal rules
        </details>
        <code_snippet>
```typescript
// VAT Recalculation Strategy
//
// When credit is applied to invoice:
// 1. Calculate credit as % of gross total
// 2. Apply same % reduction to each line item
// 3. Recalculate VAT for each line at original rate
// 4. Sum adjusted VAT amounts
//
// Example:
// Original Invoice:
//   Line 1: Net 100, VAT 20% = 20, Gross = 120
//   Line 2: Net 50,  VAT 0%  = 0,  Gross = 50
//   Total:  Net 150, VAT 20, Gross = 170
//
// Apply 34 credit (20% of gross):
//   Line 1: Net 80,  VAT 20% = 16, Gross = 96
//   Line 2: Net 40,  VAT 0%  = 0,  Gross = 40
//   Total:  Net 120, VAT 16, Gross = 136
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Implement VAT-aware credit application</description>
        <details>
          - Create credit allocation calculator
          - Implement per-line VAT recalculation
          - Handle rounding to avoid penny differences
          - Store original and adjusted VAT amounts
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/credit.service.ts
import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

interface LineItemVATAdjustment {
  lineItemId: string;
  originalNet: Decimal;
  originalVat: Decimal;
  adjustedNet: Decimal;
  adjustedVat: Decimal;
  vatRate: Decimal;
}

interface CreditApplicationResult {
  originalTotal: Decimal;
  creditApplied: Decimal;
  adjustedTotal: Decimal;
  originalVat: Decimal;
  adjustedVat: Decimal;
  lineAdjustments: LineItemVATAdjustment[];
}

@Injectable()
export class CreditService {
  constructor(
    private prisma: PrismaService,
    private vatService: VATService,
  ) {}

  async applyCredit(
    invoiceId: string,
    creditAmount: Decimal,
    tx?: Prisma.TransactionClient
  ): Promise<CreditApplicationResult> {
    const client = tx || this.prisma;

    const invoice = await client.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lineItems: true },
    });

    // Calculate proportional reduction
    const grossTotal = new Decimal(invoice.total);
    const creditRatio = creditAmount.dividedBy(grossTotal);

    // Apply proportional reduction to each line item
    const lineAdjustments: LineItemVATAdjustment[] = [];
    let totalAdjustedNet = new Decimal(0);
    let totalAdjustedVat = new Decimal(0);

    for (const line of invoice.lineItems) {
      const originalNet = new Decimal(line.netAmount);
      const vatRate = new Decimal(line.vatRate);

      // Calculate adjusted net (proportional reduction)
      const lineReduction = originalNet.times(creditRatio);
      const adjustedNet = originalNet.minus(lineReduction);

      // Recalculate VAT at original rate
      const adjustedVat = this.vatService.calculateVAT({
        amount: adjustedNet,
        rate: vatRate,
        isExempt: line.isVatExempt,
      });

      lineAdjustments.push({
        lineItemId: line.id,
        originalNet,
        originalVat: new Decimal(line.vatAmount),
        adjustedNet,
        adjustedVat,
        vatRate,
      });

      totalAdjustedNet = totalAdjustedNet.plus(adjustedNet);
      totalAdjustedVat = totalAdjustedVat.plus(adjustedVat);
    }

    // Handle rounding - adjust last line to match credit exactly
    const calculatedTotal = totalAdjustedNet.plus(totalAdjustedVat);
    const expectedTotal = grossTotal.minus(creditAmount);
    const roundingDiff = expectedTotal.minus(calculatedTotal);

    if (!roundingDiff.isZero() && lineAdjustments.length > 0) {
      const lastLine = lineAdjustments[lineAdjustments.length - 1];
      lastLine.adjustedNet = lastLine.adjustedNet.plus(roundingDiff);
      totalAdjustedNet = totalAdjustedNet.plus(roundingDiff);
    }

    // Update invoice and line items
    await this.updateInvoiceWithCredit(
      client,
      invoiceId,
      creditAmount,
      totalAdjustedNet,
      totalAdjustedVat,
      lineAdjustments
    );

    return {
      originalTotal: grossTotal,
      creditApplied: creditAmount,
      adjustedTotal: totalAdjustedNet.plus(totalAdjustedVat),
      originalVat: new Decimal(invoice.vatAmount),
      adjustedVat: totalAdjustedVat,
      lineAdjustments,
    };
  }

  private async updateInvoiceWithCredit(
    client: PrismaClient | Prisma.TransactionClient,
    invoiceId: string,
    creditAmount: Decimal,
    adjustedNet: Decimal,
    adjustedVat: Decimal,
    lineAdjustments: LineItemVATAdjustment[]
  ): Promise<void> {
    // Update invoice totals
    await client.invoice.update({
      where: { id: invoiceId },
      data: {
        creditApplied: creditAmount,
        netAmount: adjustedNet,
        vatAmount: adjustedVat,
        total: adjustedNet.plus(adjustedVat),
        vatBreakdown: this.buildVatBreakdown(lineAdjustments),
      },
    });

    // Update individual line items
    for (const adjustment of lineAdjustments) {
      await client.invoiceLineItem.update({
        where: { id: adjustment.lineItemId },
        data: {
          adjustedNetAmount: adjustment.adjustedNet,
          adjustedVatAmount: adjustment.adjustedVat,
        },
      });
    }

    // Record credit application
    await client.creditApplication.create({
      data: {
        invoiceId,
        amount: creditAmount,
        vatAdjustment: adjustedVat,
        appliedAt: new Date(),
        breakdown: JSON.stringify(lineAdjustments),
      },
    });
  }

  private buildVatBreakdown(
    adjustments: LineItemVATAdjustment[]
  ): Record<string, { net: string; vat: string }> {
    const breakdown: Record<string, { net: string; vat: string }> = {};

    for (const adj of adjustments) {
      const rateKey = adj.vatRate.toString();
      if (!breakdown[rateKey]) {
        breakdown[rateKey] = { net: '0', vat: '0' };
      }
      breakdown[rateKey].net = new Decimal(breakdown[rateKey].net)
        .plus(adj.adjustedNet)
        .toString();
      breakdown[rateKey].vat = new Decimal(breakdown[rateKey].vat)
        .plus(adj.adjustedVat)
        .toString();
    }

    return breakdown;
  }
}
```
        </code_snippet>
      </step>

      <step order="4">
        <description>Handle credit note specific VAT rules</description>
        <details>
          - Implement credit note as negative VAT transaction
          - Ensure credit notes reference original invoice VAT
          - Handle partial credit notes
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/credit.service.ts

async createCreditNote(
  invoiceId: string,
  creditAmount: Decimal,
  reason: string
): Promise<CreditNote> {
  return this.prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lineItems: true },
    });

    // Calculate VAT portion of credit
    const grossTotal = new Decimal(invoice.total);
    const creditRatio = creditAmount.dividedBy(grossTotal);

    const vatPortion = new Decimal(invoice.vatAmount).times(creditRatio);
    const netPortion = creditAmount.minus(vatPortion);

    // Create credit note with VAT breakdown
    const creditNote = await tx.creditNote.create({
      data: {
        invoiceId,
        creditNoteNumber: await this.generateCreditNoteNumber(tx),
        grossAmount: creditAmount,
        netAmount: netPortion,
        vatAmount: vatPortion,
        reason,
        vatBreakdown: this.calculateCreditNoteVatBreakdown(
          invoice.lineItems,
          creditRatio
        ),
        status: 'ISSUED',
      },
    });

    // Apply credit to invoice
    await this.applyCredit(invoiceId, creditAmount, tx);

    return creditNote;
  });
}
```
        </code_snippet>
      </step>

      <step order="5">
        <description>Add validation and edge case handling</description>
        <details>
          - Prevent credit exceeding invoice total
          - Handle fully VAT-exempt invoices
          - Validate credit against remaining balance
          - Add audit logging for VAT adjustments
        </details>
      </step>
    </steps>

    <technical_notes>
      - Use Decimal for all financial calculations to avoid floating point errors
      - VAT must be recalculated at original rates, not current rates
      - Credit notes are negative VAT transactions for VAT returns
      - Rounding should favor invoice accuracy over line item accuracy
      - Audit trail must capture before/after VAT amounts
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Single VAT rate credit application</description>
        <preconditions>Invoice with 100 net, 20 VAT (20%), apply 24 credit</preconditions>
        <expected_result>Adjusted: 80 net, 16 VAT, 96 total</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>Mixed VAT rate credit application</description>
        <preconditions>Invoice with 20% and 0% VAT items, apply proportional credit</preconditions>
        <expected_result>VAT only reduced on 20% items proportionally</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>VAT exempt invoice credit</description>
        <preconditions>Fully VAT-exempt invoice, apply credit</preconditions>
        <expected_result>No VAT recalculation needed, net reduced</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Credit note VAT breakdown</description>
        <preconditions>Create credit note for partial invoice amount</preconditions>
        <expected_result>Credit note shows correct VAT reversal</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Multiple credit applications</description>
        <preconditions>Apply two credits to same invoice</preconditions>
        <expected_result>VAT correctly calculated after each application</expected_result>
      </test_case>

      <test_case id="TC-006">
        <description>Rounding handling</description>
        <preconditions>Credit creates non-whole penny VAT amounts</preconditions>
        <expected_result>Amounts round correctly, totals balance</expected_result>
      </test_case>
    </test_cases>

    <manual_testing>
      <step>Apply credit to invoice and verify VAT breakdown</step>
      <step>Generate VAT report and verify credit impact</step>
      <step>Compare customer invoice PDF with system records</step>
      <step>Test edge cases: full credit, tiny credit, multiple credits</step>
    </manual_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Credit application recalculates VAT proportionally</criterion>
      <criterion>Line item VAT amounts updated correctly</criterion>
      <criterion>Credit notes include correct VAT reversal</criterion>
      <criterion>VAT breakdown JSON updated on invoice</criterion>
      <criterion>Rounding handled without penny differences</criterion>
      <criterion>Audit trail captures VAT adjustments</criterion>
      <criterion>All test cases passing</criterion>
      <criterion>VAT report reflects credited invoices correctly</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">Credit service updated with VAT recalculation</item>
      <item checked="false">Line item adjustment logic implemented</item>
      <item checked="false">Credit note VAT handling implemented</item>
      <item checked="false">Rounding logic verified</item>
      <item checked="false">Unit tests for all scenarios</item>
      <item checked="false">Integration test with VAT reporting</item>
      <item checked="false">Finance team sign-off on VAT accuracy</item>
      <item checked="false">Documentation updated</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="compliance">VAT Credit Note Regulations</reference>
    <reference type="documentation">HMRC VAT Notice 700</reference>
    <reference type="issue">Support Tickets - VAT Discrepancies</reference>
  </references>
</task_specification>
