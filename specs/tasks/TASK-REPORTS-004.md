<task_spec id="TASK-REPORTS-004" version="2.0">

<metadata>
  <title>Reports Dashboard UI Components</title>
  <status>ready</status>
  <phase>reports-enhancement</phase>
  <layer>surface</layer>
  <sequence>804</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-REPORTS-DASHBOARD-UI</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-REPORTS-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-29</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The reports page at `/reports` is a non-functional skeleton. It displays a report
  selector, date picker, and export buttons, but shows only placeholder text:
  "Select a date range and generate the report to see data here"

  No data is fetched, no charts are displayed, and no AI insights are shown.
  The existing chart components (Recharts) are available but unused.

  **Gap Analysis:**
  - No data fetching hooks for report data
  - No dashboard layout with metrics and charts
  - No AI insights display components
  - No loading/error states
  - Reports page never calls API

  **Files to Create:**
  - `apps/web/src/components/reports/report-dashboard.tsx`
  - `apps/web/src/components/reports/ai-insights-banner.tsx`
  - `apps/web/src/components/reports/anomalies-card.tsx`
  - `apps/web/src/components/reports/recommendations-card.tsx`
  - `apps/web/src/components/reports/report-metric-card.tsx`
  - `apps/web/src/components/reports/report-charts.tsx`
  - `apps/web/src/hooks/use-report-data.ts`
  - `apps/web/src/hooks/use-ai-insights.ts`

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/reports/page.tsx` — REWRITE to use dashboard
  - `apps/web/src/hooks/useExportReport.ts` — ADD includeInsights option
  - `apps/web/src/components/reports/export-buttons.tsx` — ADD AI toggle
  - `apps/web/src/components/reports/index.ts` — EXPORT new components
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Reports Page Structure
  ```typescript
  'use client';

  export default function ReportsPage() {
    const [selectedReport, setSelectedReport] = useState<ReportType>(ReportType.INCOME_STATEMENT);
    const [dateRange, setDateRange] = useState<DateRange>({
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to: new Date(),
    });

    const { data: reportData, isLoading, error, refetch } = useReportData(selectedReport, dateRange);
    const { data: aiInsights, isLoading: insightsLoading } = useAIInsights(selectedReport, reportData);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-muted-foreground">AI-powered financial insights and analytics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <ExportButtons reportType={selectedReport} dateRange={dateRange} hasInsights={!!aiInsights} />
          </div>
        </div>

        {/* Report Selector and Date Range */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <ReportSelector value={selectedReport} onChange={setSelectedReport} />
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </CardContent>
        </Card>

        {/* Dashboard Content */}
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ReportSkeleton />
        ) : reportData ? (
          <ReportDashboard
            type={selectedReport}
            data={reportData}
            insights={aiInsights}
            insightsLoading={insightsLoading}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    );
  }
  ```

  ### 2. Report Dashboard Component
  ```typescript
  interface ReportDashboardProps {
    type: ReportType;
    data: ReportDataResponse;
    insights: AIInsights | null;
    insightsLoading: boolean;
  }

  export function ReportDashboard({ type, data, insights, insightsLoading }: ReportDashboardProps) {
    return (
      <div className="space-y-6">
        {/* AI Insights Banner */}
        {insightsLoading ? (
          <AIInsightsSkeleton />
        ) : insights ? (
          <AIInsightsBanner insights={insights} />
        ) : null}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReportMetricCard
            title="Total Income"
            value={formatCurrency(data.summary.totalIncome / 100)}
            trend={insights?.trends.find(t => t.metric === 'income')}
            icon={TrendingUp}
            valueColor="text-green-600"
          />
          <ReportMetricCard
            title="Total Expenses"
            value={formatCurrency(data.summary.totalExpenses / 100)}
            trend={insights?.trends.find(t => t.metric === 'expenses')}
            icon={TrendingDown}
            valueColor="text-red-600"
          />
          <ReportMetricCard
            title="Net Profit"
            value={formatCurrency(data.summary.netProfit / 100)}
            trend={insights?.trends.find(t => t.metric === 'profit')}
            icon={DollarSign}
            valueColor={data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartContainer title="Income vs Expenses Trend">
            <LineChart
              data={data.chartData.monthlyTrend}
              lines={[
                { dataKey: 'income', name: 'Income', color: '#10b981' },
                { dataKey: 'expenses', name: 'Expenses', color: '#ef4444' },
              ]}
              formatValue={(v) => formatCompactCurrency(v / 100)}
            />
          </ChartContainer>

          <ChartContainer title="Expense Breakdown">
            <PieChart
              data={data.chartData.expenseBreakdown}
              dataKey="amount"
              nameKey="category"
              formatValue={(v) => formatCurrency(v / 100)}
            />
          </ChartContainer>
        </div>

        {/* Anomalies and Recommendations */}
        {insights?.anomalies && insights.anomalies.length > 0 && (
          <AnomaliesCard anomalies={insights.anomalies} />
        )}

        {insights?.recommendations && insights.recommendations.length > 0 && (
          <RecommendationsCard recommendations={insights.recommendations} />
        )}

        {/* Detailed Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportDataTable data={data} type={type} />
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 3. AI Insights Banner
  ```typescript
  export function AIInsightsBanner({ insights }: { insights: AIInsights }) {
    const [expanded, setExpanded] = useState(false);

    return (
      <Alert className="border-primary bg-primary/5">
        <Bot className="h-5 w-5" />
        <AlertTitle className="flex items-center gap-2">
          AI-Generated Insights
          <Badge variant="secondary">{insights.confidenceScore}% confidence</Badge>
          <Badge variant="outline" className="ml-auto">
            {insights.source === 'SDK' ? 'Claude Powered' : 'Rule-based'}
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2">
          <p className={cn("text-sm leading-relaxed", !expanded && "line-clamp-3")}>
            {insights.executiveSummary}
          </p>
          {insights.executiveSummary.length > 200 && (
            <Button variant="link" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  ```

  ### 4. Data Fetching Hooks
  ```typescript
  // use-report-data.ts
  export function useReportData(type: ReportType | undefined, dateRange: DateRange | undefined) {
    return useQuery({
      queryKey: ['report-data', type, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
      queryFn: async () => {
        if (!type || !dateRange?.from || !dateRange?.to) return null;

        const { data } = await apiClient.get<{ success: boolean; data: ReportDataResponse }>(
          `/reports/${type}/data`,
          {
            params: {
              start: dateRange.from.toISOString().split('T')[0],
              end: dateRange.to.toISOString().split('T')[0],
            },
          }
        );
        return data.data;
      },
      enabled: !!type && !!dateRange?.from && !!dateRange?.to,
      staleTime: 5 * 60 * 1000,
    });
  }

  // use-ai-insights.ts
  export function useAIInsights(type: ReportType | undefined, reportData: ReportDataResponse | null | undefined) {
    return useQuery({
      queryKey: ['ai-insights', type, reportData?.generatedAt],
      queryFn: async () => {
        if (!type || !reportData) return null;

        const { data } = await apiClient.post<{ success: boolean; data: AIInsights }>(
          `/reports/${type}/insights`,
          { reportData }
        );
        return data.data;
      },
      enabled: !!type && !!reportData,
      staleTime: 10 * 60 * 1000,
      retry: 1, // AI generation can fail, don't retry too much
    });
  }
  ```

  ### 5. Enhanced Export Buttons
  ```typescript
  export function ExportButtons({ reportType, dateRange, hasInsights }: Props) {
    const [includeAI, setIncludeAI] = useState(true);
    const exportReport = useExportReport();

    const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
      exportReport.mutate({
        reportType,
        format,
        includeInsights: format === 'pdf' && includeAI,
        dateRange: {
          start: dateRange.from.toISOString().split('T')[0],
          end: dateRange.to.toISOString().split('T')[0],
        },
      });
    };

    return (
      <div className="flex items-center gap-2">
        {hasInsights && (
          <div className="flex items-center gap-2 mr-2">
            <Checkbox
              id="include-ai"
              checked={includeAI}
              onCheckedChange={(checked) => setIncludeAI(checked === true)}
            />
            <label htmlFor="include-ai" className="text-sm cursor-pointer">
              Include AI insights
            </label>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exportReport.isPending}>
              {exportReport.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              <FileText className="h-4 w-4 mr-2" />
              PDF Report {includeAI && hasInsights && '(with AI)'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('excel')}>
              <Sheet className="h-4 w-4 mr-2" />
              Excel Data
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Rewrite reports page with dashboard layout
    - Create ReportDashboard component
    - Create AI insights display components (banner, anomalies, recommendations)
    - Create metric card component with trend indicator
    - Integrate existing chart components (LineChart, PieChart, BarChart, AreaChart)
    - Create data fetching hooks (useReportData, useAIInsights)
    - Update export buttons with AI toggle
    - Update useExportReport hook
    - Loading skeletons and error states
    - Responsive layout for mobile/tablet/desktop
  </in_scope>

  <out_of_scope>
    - API implementation (TASK-REPORTS-002)
    - AI agent (TASK-REPORTS-001)
    - PDF generation (TASK-REPORTS-003)
    - Missing report type components (TASK-REPORTS-005)
    - E2E tests (separate task)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] Reports page rewritten with dashboard layout
  - [ ] `ReportDashboard` component displaying metrics and charts
  - [ ] `AIInsightsBanner` with executive summary
  - [ ] `AnomaliesCard` with warning styling
  - [ ] `RecommendationsCard` with priority sorting
  - [ ] `ReportMetricCard` with trend indicators
  - [ ] `useReportData` hook fetching from API
  - [ ] `useAIInsights` hook fetching insights
  - [ ] Export buttons with AI toggle checkbox
  - [ ] `useExportReport` updated with `includeInsights` param
  - [ ] Loading skeletons for all sections
  - [ ] Error state with retry button
  - [ ] Responsive layout (mobile, tablet, desktop)
  - [ ] All components exported from index.ts
  - [ ] TypeScript strict compliance (no `any`)
  - [ ] Build and lint pass
</definition_of_done>

<anti_patterns>
  - **NEVER fetch data without caching** — use staleTime in queries
  - **NEVER show raw cents** — always divide by 100 for display
  - **NEVER block on AI failures** — show report without insights
  - **NEVER use inline styles** — use Tailwind classes
  - **NEVER skip loading states** — always show skeletons
</anti_patterns>

</task_spec>
