# TASK-STMT-006: Statement UI Components

## Metadata
- **Task ID**: TASK-STMT-006
- **Phase**: 12 - Account Statements
- **Layer**: surface (web)
- **Priority**: P1-CRITICAL
- **Dependencies**: TASK-STMT-004
- **Estimated Effort**: 8 hours

## Objective
Create comprehensive UI components for statement management including statement list, generation wizard, parent account view, and payment allocation modal.

## Technical Requirements

### 1. Statements Page (`apps/web/src/app/(dashboard)/statements/page.tsx`)

```typescript
'use client';

export default function StatementsPage() {
  const [filters, setFilters] = useState({
    period: 'current-month',
    status: 'all',
    search: '',
  });

  const { data: statements, isLoading } = useStatements(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Statements"
        description="Generate and manage parent account statements"
        action={
          <Button onClick={() => setShowGenerateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Generate Statements
          </Button>
        }
      />

      <StatementsFilters filters={filters} onFiltersChange={setFilters} />

      <StatementsTable
        statements={statements}
        isLoading={isLoading}
        onView={(id) => router.push(`/statements/${id}`)}
        onDownload={(id) => downloadStatementPdf(id)}
        onSend={(id) => setStatementToSend(id)}
      />

      <GenerateStatementsDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
      />
    </div>
  );
}
```

### 2. Statement Generation Wizard (`apps/web/src/components/statements/generate-statements-dialog.tsx`)

```typescript
export function GenerateStatementsDialog({ open, onOpenChange }) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    periodStart: startOfMonth(new Date()),
    periodEnd: endOfMonth(new Date()),
    mode: 'all', // 'all' | 'selected' | 'withBalance'
    selectedParentIds: [],
    onlyWithActivity: false,
    onlyWithBalance: false,
  });

  const { mutate: generateStatements, isPending } = useBulkGenerateStatements();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Statements</DialogTitle>
          <DialogDescription>
            Generate monthly statements for parent accounts
          </DialogDescription>
        </DialogHeader>

        <Steps current={step} className="mb-6">
          <Step title="Period" />
          <Step title="Parents" />
          <Step title="Review" />
        </Steps>

        {step === 1 && (
          <PeriodSelectionStep config={config} onChange={setConfig} />
        )}

        {step === 2 && (
          <ParentSelectionStep config={config} onChange={setConfig} />
        )}

        {step === 3 && (
          <ReviewStep config={config} onGenerate={handleGenerate} />
        )}

        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? 'Generating...' : 'Generate Statements'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Payment Allocation Modal (`apps/web/src/components/payments/payment-allocation-modal.tsx`)

```typescript
/**
 * Modal shown when allocating a bank transaction to invoices
 * Triggered when transaction is categorized as "Fee Income"
 */
export function PaymentAllocationModal({
  transaction,
  open,
  onOpenChange,
  onSuccess,
}) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);

  const { data: parents } = useParentsWithBalance();
  const { data: outstandingInvoices } = useOutstandingInvoices(selectedParentId);
  const { data: suggestedAllocation } = useSuggestedAllocation(
    transaction.id,
    selectedParentId
  );

  const remainingAmount = useMemo(() => {
    const allocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
    return transaction.amountCents - allocated;
  }, [transaction.amountCents, allocations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate Payment</DialogTitle>
          <DialogDescription>
            Allocate payment of {formatCurrency(transaction.amountCents)} from{' '}
            {transaction.description} to parent account
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Summary */}
        <TransactionSummaryCard transaction={transaction} />

        {/* Parent Selection */}
        <div className="space-y-2">
          <Label>Select Parent Account</Label>
          <ParentSearchCombobox
            parents={parents}
            value={selectedParentId}
            onChange={setSelectedParentId}
          />
        </div>

        {/* Outstanding Invoices */}
        {selectedParentId && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Outstanding Invoices</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAllocations(suggestedAllocation || [])}
              >
                Use Suggested (FIFO)
              </Button>
            </div>

            <InvoiceAllocationTable
              invoices={outstandingInvoices}
              allocations={allocations}
              onAllocationsChange={setAllocations}
              maxAmount={transaction.amountCents}
            />
          </div>
        )}

        {/* Allocation Summary */}
        <AllocationSummary
          totalPayment={transaction.amountCents}
          totalAllocated={transaction.amountCents - remainingAmount}
          remaining={remainingAmount}
        />

        {remainingAmount > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Remaining R {formatCurrency(remainingAmount)} will be added as
              credit balance to the parent account.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAllocate}
            disabled={!selectedParentId || allocations.length === 0}
          >
            Allocate Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Parent Account View (`apps/web/src/components/parents/parent-account-card.tsx`)

```typescript
/**
 * Shows parent account summary on parent detail page
 */
export function ParentAccountCard({ parentId }) {
  const { data: account, isLoading } = useParentAccount(parentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Account Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(account.totalOutstandingCents)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Credit Balance</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(account.creditBalanceCents)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Net Balance</p>
            <p className={cn(
              "text-2xl font-bold",
              account.netBalanceCents > 0 ? "text-red-600" : "text-green-600"
            )}>
              {formatCurrency(Math.abs(account.netBalanceCents))}
              {account.netBalanceCents < 0 && " CR"}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Recent Activity</p>
          <AccountActivityList transactions={account.recentTransactions} />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/parents/${parentId}/statements`}>
              View Statements
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={generateStatement}>
            Generate Statement
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5. React Query Hooks (`apps/web/src/hooks/use-statements.ts`)

```typescript
export function useStatements(filters: StatementFilters) {
  return useQuery({
    queryKey: ['statements', filters],
    queryFn: () => api.statements.list(filters),
  });
}

export function useStatement(id: string) {
  return useQuery({
    queryKey: ['statements', id],
    queryFn: () => api.statements.get(id),
    enabled: !!id,
  });
}

export function useGenerateStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.statements.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      toast.success('Statement generated successfully');
    },
  });
}

export function useBulkGenerateStatements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.statements.bulkGenerate,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      toast.success(`Generated ${result.generated} statements`);
    },
  });
}

export function useParentAccount(parentId: string) {
  return useQuery({
    queryKey: ['parents', parentId, 'account'],
    queryFn: () => api.statements.getParentAccount(parentId),
    enabled: !!parentId,
  });
}

export function useAllocatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.payments.allocate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Payment allocated successfully');
    },
  });
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/app/(dashboard)/statements/page.tsx` | CREATE | Statements list page |
| `apps/web/src/app/(dashboard)/statements/[id]/page.tsx` | CREATE | Statement detail page |
| `apps/web/src/components/statements/generate-statements-dialog.tsx` | CREATE | Generation wizard |
| `apps/web/src/components/statements/statements-table.tsx` | CREATE | Statements data table |
| `apps/web/src/components/statements/statement-detail.tsx` | CREATE | Statement detail view |
| `apps/web/src/components/payments/payment-allocation-modal.tsx` | CREATE | Allocation modal |
| `apps/web/src/components/parents/parent-account-card.tsx` | CREATE | Account summary card |
| `apps/web/src/hooks/use-statements.ts` | CREATE | Statement hooks |
| `apps/web/src/lib/api/endpoints.ts` | MODIFY | Add statement endpoints |
| `apps/web/src/app/(dashboard)/layout.tsx` | MODIFY | Add Statements to nav |

## Acceptance Criteria

- [ ] Statements page lists all statements
- [ ] Filter by period, status, parent
- [ ] Generate statement wizard (3 steps)
- [ ] Bulk generation with progress
- [ ] Statement detail view with lines
- [ ] Download PDF from UI
- [ ] Send statement via email/WhatsApp
- [ ] Payment allocation modal works
- [ ] Parent account summary card
- [ ] Real-time balance updates
- [ ] Mobile responsive
- [ ] Loading states and error handling

## Test Cases

1. View statements list with filters
2. Generate single statement
3. Bulk generate statements
4. View statement detail
5. Download PDF
6. Send statement via email
7. Allocate payment to single invoice
8. Allocate payment to multiple invoices
9. View parent account balance
10. Mobile layout works
