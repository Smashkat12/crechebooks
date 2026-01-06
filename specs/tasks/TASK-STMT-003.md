# TASK-STMT-003: Statement Generation Service

## Metadata
- **Task ID**: TASK-STMT-003
- **Phase**: 12 - Account Statements
- **Layer**: logic
- **Priority**: P1-CRITICAL
- **Dependencies**: TASK-STMT-001, TASK-STMT-002
- **Estimated Effort**: 6 hours

## Objective
Create the Statement Generation Service that compiles all account activity for a parent into a comprehensive statement with opening balance, all transactions, and closing balance.

## Business Context
Parents receive monthly statements showing:
- **Opening Balance**: Amount owed at start of period (or credit)
- **Charges**: All invoices issued during the period
- **Payments**: All payments received
- **Credits**: Credit notes, adjustments, credit balance applied
- **Closing Balance**: Net amount due (or credit balance)

This follows the standard accounting statement format used globally.

## Technical Requirements

### 1. Statement Generation Service (`apps/api/src/database/services/statement-generation.service.ts`)

```typescript
export interface GenerateStatementInput {
  tenantId: string;
  parentId: string;
  periodStart: Date;
  periodEnd: Date;
  userId: string;
  includeZeroBalanceChildren?: boolean;
}

export interface BulkGenerateStatementInput {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  userId: string;
  parentIds?: string[];           // If empty, generate for all active parents
  onlyWithActivity?: boolean;     // Skip parents with no transactions
  onlyWithBalance?: boolean;      // Skip parents with zero balance
}

@Injectable()
export class StatementGenerationService {
  constructor(
    private readonly statementRepo: StatementRepository,
    private readonly parentAccountService: ParentAccountService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly creditNoteRepo: CreditNoteRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Generate statement for a single parent
   */
  async generateStatement(
    input: GenerateStatementInput
  ): Promise<IStatement> {
    // 1. Calculate opening balance from previous statement or historical data
    const openingBalance = await this.calculateOpeningBalance(
      input.tenantId,
      input.parentId,
      input.periodStart
    );

    // 2. Get all invoices in period
    const invoices = await this.invoiceRepo.findByParentInPeriod(
      input.tenantId,
      input.parentId,
      input.periodStart,
      input.periodEnd
    );

    // 3. Get all payments in period
    const payments = await this.paymentRepo.findByParentInPeriod(
      input.tenantId,
      input.parentId,
      input.periodStart,
      input.periodEnd
    );

    // 4. Get credit notes in period
    const creditNotes = await this.creditNoteRepo.findByParentInPeriod(
      input.tenantId,
      input.parentId,
      input.periodStart,
      input.periodEnd
    );

    // 5. Build statement lines with running balance
    const lines = this.buildStatementLines(
      openingBalance,
      invoices,
      payments,
      creditNotes
    );

    // 6. Calculate totals
    const totals = this.calculateTotals(lines);

    // 7. Create statement
    const statement = await this.statementRepo.create({
      tenantId: input.tenantId,
      parentId: input.parentId,
      statementNumber: await this.generateStatementNumber(input.tenantId),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingBalanceCents: openingBalance,
      totalChargesCents: totals.charges,
      totalPaymentsCents: totals.payments,
      totalCreditsCents: totals.credits,
      closingBalanceCents: totals.closingBalance,
      status: 'DRAFT',
    });

    // 8. Add statement lines
    await this.statementRepo.addLines(statement.id, lines);

    // 9. Audit log
    await this.auditLogService.logCreate({
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'Statement',
      entityId: statement.id,
      afterValue: { statementNumber: statement.statementNumber },
    });

    return statement;
  }

  /**
   * Bulk generate statements for multiple parents
   */
  async bulkGenerateStatements(
    input: BulkGenerateStatementInput
  ): Promise<{ generated: number; skipped: number; errors: string[] }>;

  /**
   * Calculate opening balance from previous statement or historical transactions
   */
  private async calculateOpeningBalance(
    tenantId: string,
    parentId: string,
    periodStart: Date
  ): Promise<number>;

  /**
   * Build chronological statement lines with running balance
   */
  private buildStatementLines(
    openingBalance: number,
    invoices: Invoice[],
    payments: Payment[],
    creditNotes: CreditNote[]
  ): StatementLineInput[];

  /**
   * Generate unique statement number STMT-YYYY-NNNNN
   */
  private async generateStatementNumber(tenantId: string): Promise<string>;
}
```

### 2. Statement Line Building Logic

```typescript
private buildStatementLines(
  openingBalance: number,
  invoices: Invoice[],
  payments: Payment[],
  creditNotes: CreditNote[]
): StatementLineInput[] {
  const lines: StatementLineInput[] = [];
  let runningBalance = new Decimal(openingBalance);
  let sortOrder = 0;

  // Opening balance line
  lines.push({
    date: this.periodStart,
    description: 'Opening Balance',
    lineType: StatementLineType.OPENING_BALANCE,
    debitCents: openingBalance > 0 ? openingBalance : 0,
    creditCents: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    balanceCents: runningBalance.toNumber(),
    sortOrder: sortOrder++,
  });

  // Combine all transactions and sort by date
  const allTransactions = [
    ...invoices.map(i => ({
      date: i.issueDate,
      type: 'INVOICE' as const,
      document: i,
    })),
    ...payments.map(p => ({
      date: p.paymentDate,
      type: 'PAYMENT' as const,
      document: p,
    })),
    ...creditNotes.map(c => ({
      date: c.issueDate,
      type: 'CREDIT_NOTE' as const,
      document: c,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Process each transaction
  for (const txn of allTransactions) {
    if (txn.type === 'INVOICE') {
      const invoice = txn.document as Invoice;
      runningBalance = runningBalance.plus(invoice.totalCents);
      lines.push({
        date: invoice.issueDate,
        description: `Invoice ${invoice.invoiceNumber}`,
        lineType: StatementLineType.INVOICE,
        referenceType: 'INVOICE',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        debitCents: invoice.totalCents,
        creditCents: 0,
        balanceCents: runningBalance.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        sortOrder: sortOrder++,
      });
    } else if (txn.type === 'PAYMENT') {
      const payment = txn.document as Payment;
      runningBalance = runningBalance.minus(payment.amountCents);
      lines.push({
        date: payment.paymentDate,
        description: `Payment received - Thank you`,
        lineType: StatementLineType.PAYMENT,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        referenceNumber: payment.referenceNumber,
        debitCents: 0,
        creditCents: payment.amountCents,
        balanceCents: runningBalance.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        sortOrder: sortOrder++,
      });
    } else if (txn.type === 'CREDIT_NOTE') {
      const creditNote = txn.document as CreditNote;
      runningBalance = runningBalance.minus(creditNote.totalCents);
      lines.push({
        date: creditNote.issueDate,
        description: `Credit Note ${creditNote.creditNoteNumber}`,
        lineType: StatementLineType.CREDIT_NOTE,
        referenceType: 'CREDIT_NOTE',
        referenceId: creditNote.id,
        referenceNumber: creditNote.creditNoteNumber,
        debitCents: 0,
        creditCents: creditNote.totalCents,
        balanceCents: runningBalance.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        sortOrder: sortOrder++,
      });
    }
  }

  return lines;
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/database/services/statement-generation.service.ts` | CREATE | Statement generation service |
| `apps/api/src/database/services/statement-generation.service.spec.ts` | CREATE | Service tests |
| `apps/api/src/database/database.module.ts` | MODIFY | Register new services |

## Acceptance Criteria

- [ ] Generate statement for single parent
- [ ] Bulk generate statements for all parents
- [ ] Calculate opening balance from previous statement
- [ ] Calculate opening balance from historical data (first statement)
- [ ] Statement lines in chronological order
- [ ] Running balance calculated correctly
- [ ] Totals match sum of line items
- [ ] Statement number unique per tenant
- [ ] Skip parents with no activity (optional)
- [ ] Audit trail for statement generation
- [ ] Uses Decimal.js with banker's rounding

## Test Cases

1. Generate first statement for new parent (no history)
2. Generate statement with opening balance from previous
3. Multiple invoices and payments in period
4. Credit notes included correctly
5. Empty period (no activity)
6. Parent with credit balance (negative opening balance)
7. Bulk generation for 100+ parents
8. Concurrent statement generation
9. Statement number sequence
10. Decimal precision across all calculations
