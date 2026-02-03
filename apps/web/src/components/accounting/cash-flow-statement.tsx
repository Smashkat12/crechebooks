'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Statement Display
 * Displays the full cash flow statement with collapsible sections for each activity type
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CashFlowSection, LineItem } from '@/components/accounting/cash-flow-section';
import type {
  CashFlowStatement,
  OperatingActivities,
  InvestingActivities,
  FinancingActivities,
} from '@/hooks/use-cash-flow';

interface CashFlowStatementDisplayProps {
  statement: CashFlowStatement;
  showComparative?: boolean;
}

interface OperatingSectionProps {
  data: OperatingActivities;
  comparative?: OperatingActivities;
  showComparative: boolean;
}

function OperatingSection({ data, comparative, showComparative }: OperatingSectionProps) {
  return (
    <CashFlowSection
      title="Operating Activities"
      netAmount={data.netCashFromOperatingCents}
      comparativeNetAmount={comparative?.netCashFromOperatingCents}
      showComparative={showComparative}
    >
      <LineItem
        label="Net Income"
        current={data.netIncomeCents}
        comparative={comparative?.netIncomeCents}
        showComparative={showComparative}
      />
      <div className="py-2 text-sm font-medium text-muted-foreground">Adjustments:</div>
      <LineItem
        label="Depreciation & Amortization"
        current={data.adjustments.depreciation}
        comparative={comparative?.adjustments.depreciation}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Change in Accounts Receivable"
        current={data.adjustments.receivablesChange}
        comparative={comparative?.adjustments.receivablesChange}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Change in Accounts Payable"
        current={data.adjustments.payablesChange}
        comparative={comparative?.adjustments.payablesChange}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Change in Prepaid Expenses"
        current={data.adjustments.prepaidExpensesChange}
        comparative={comparative?.adjustments.prepaidExpensesChange}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Change in Accrued Expenses"
        current={data.adjustments.accruedExpensesChange}
        comparative={comparative?.adjustments.accruedExpensesChange}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Other Adjustments"
        current={data.adjustments.otherAdjustments}
        comparative={comparative?.adjustments.otherAdjustments}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Total Adjustments"
        current={data.totalAdjustmentsCents}
        comparative={comparative?.totalAdjustmentsCents}
        showComparative={showComparative}
        bold
      />
      <LineItem
        label="Net Cash from Operating Activities"
        current={data.netCashFromOperatingCents}
        comparative={comparative?.netCashFromOperatingCents}
        showComparative={showComparative}
        bold
      />
    </CashFlowSection>
  );
}

interface InvestingSectionProps {
  data: InvestingActivities;
  comparative?: InvestingActivities;
  showComparative: boolean;
}

function InvestingSection({ data, comparative, showComparative }: InvestingSectionProps) {
  return (
    <CashFlowSection
      title="Investing Activities"
      netAmount={data.netCashFromInvestingCents}
      comparativeNetAmount={comparative?.netCashFromInvestingCents}
      showComparative={showComparative}
    >
      <LineItem
        label="Asset Purchases"
        current={-data.assetPurchasesCents}
        comparative={comparative ? -comparative.assetPurchasesCents : undefined}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Asset Sales"
        current={data.assetSalesCents}
        comparative={comparative?.assetSalesCents}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Equipment Purchases"
        current={-data.equipmentPurchasesCents}
        comparative={comparative ? -comparative.equipmentPurchasesCents : undefined}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Investment Purchases"
        current={-data.investmentPurchasesCents}
        comparative={comparative ? -comparative.investmentPurchasesCents : undefined}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Investment Sales"
        current={data.investmentSalesCents}
        comparative={comparative?.investmentSalesCents}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Net Cash from Investing Activities"
        current={data.netCashFromInvestingCents}
        comparative={comparative?.netCashFromInvestingCents}
        showComparative={showComparative}
        bold
      />
    </CashFlowSection>
  );
}

interface FinancingSectionProps {
  data: FinancingActivities;
  comparative?: FinancingActivities;
  showComparative: boolean;
}

function FinancingSection({ data, comparative, showComparative }: FinancingSectionProps) {
  return (
    <CashFlowSection
      title="Financing Activities"
      netAmount={data.netCashFromFinancingCents}
      comparativeNetAmount={comparative?.netCashFromFinancingCents}
      showComparative={showComparative}
    >
      <LineItem
        label="Loan Proceeds"
        current={data.loanProceedsCents}
        comparative={comparative?.loanProceedsCents}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Loan Repayments"
        current={-data.loanRepaymentsCents}
        comparative={comparative ? -comparative.loanRepaymentsCents : undefined}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Owner Contributions"
        current={data.ownerContributionsCents}
        comparative={comparative?.ownerContributionsCents}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Owner Drawings"
        current={-data.ownerDrawingsCents}
        comparative={comparative ? -comparative.ownerDrawingsCents : undefined}
        showComparative={showComparative}
        indent
      />
      <LineItem
        label="Net Cash from Financing Activities"
        current={data.netCashFromFinancingCents}
        comparative={comparative?.netCashFromFinancingCents}
        showComparative={showComparative}
        bold
      />
    </CashFlowSection>
  );
}

export function CashFlowStatementDisplay({ statement, showComparative = false }: CashFlowStatementDisplayProps) {
  const comparative = showComparative ? statement.comparative : undefined;

  return (
    <Card className="print:shadow-none print:border-0">
      <CardHeader className="print:pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="print:text-xl">
            Cash Flow Statement
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {statement.period.startDate} to {statement.period.endDate}
            </span>
          </CardTitle>
          <Badge
            variant={statement.summary.cashReconciles ? 'default' : 'destructive'}
            className="print:hidden"
          >
            {statement.summary.cashReconciles ? 'Reconciled' : 'Not Reconciled'}
          </Badge>
        </div>
        {showComparative && comparative && (
          <div className="flex justify-end gap-4 text-sm text-muted-foreground mt-2">
            <span className="w-32 text-right">Current</span>
            <span className="w-32 text-right">Prior Period</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 print:space-y-2">
        <OperatingSection
          data={statement.operatingActivities}
          comparative={comparative?.operatingActivities}
          showComparative={showComparative}
        />
        <InvestingSection
          data={statement.investingActivities}
          comparative={comparative?.investingActivities}
          showComparative={showComparative}
        />
        <FinancingSection
          data={statement.financingActivities}
          comparative={comparative?.financingActivities}
          showComparative={showComparative}
        />

        {/* Summary */}
        <div className="border-t-2 pt-4 space-y-2 print:pt-2">
          <LineItem
            label="Net Change in Cash"
            current={statement.summary.netCashChangeCents}
            comparative={comparative?.summary.netCashChangeCents}
            showComparative={showComparative}
            bold
          />
          <LineItem
            label="Opening Cash Balance"
            current={statement.summary.openingCashBalanceCents}
            comparative={comparative?.summary.openingCashBalanceCents}
            showComparative={showComparative}
          />
          <LineItem
            label="Closing Cash Balance"
            current={statement.summary.closingCashBalanceCents}
            comparative={comparative?.summary.closingCashBalanceCents}
            showComparative={showComparative}
            bold
          />
        </div>

        {/* Print-only reconciliation status */}
        <div className="hidden print:block text-sm text-muted-foreground mt-4">
          Status: {statement.summary.cashReconciles ? 'Reconciled' : 'Not Reconciled'}
        </div>
      </CardContent>
    </Card>
  );
}
