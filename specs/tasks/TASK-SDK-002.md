<task_spec id="TASK-SDK-002" version="2.0">

<metadata>
  <title>CrecheBooks In-Process MCP Server (Data Access Tools)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>foundation</layer>
  <sequence>702</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-SDK-MCP-BRIDGE</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="existing">TASK-MCP-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  SDK agents need access to CrecheBooks internal data (payee patterns, categorization
  history, invoices, transactions, financial reports) via MCP tools. Currently, no MCP
  server exposes CrecheBooks internal data. The only existing MCP server is the Xero MCP
  server (`apps/api/src/mcp/xero-mcp/`) which connects to the external Xero API. SDK
  agents cannot query internal databases without custom MCP tools.

  Without this MCP server, the SDK agents created in TASK-SDK-003 through TASK-SDK-007
  will have no way to access the data they need for informed categorization, matching,
  and compliance decisions.

  **Gap Analysis:**
  - No in-process MCP server for CrecheBooks internal data
  - SDK agents have no way to access the `PayeePattern` table (payee pattern repository)
  - SDK agents have no way to query `CategorizationHistory` (categorization history)
  - SDK agents have no way to query `Invoice` table (outstanding invoices)
  - SDK agents have no way to query `BankTransaction` table (transaction data)
  - SDK agents have no way to generate financial summaries (income/expense reports)
  - No semantic search capability for finding similar transactions by description/context
  - The architecture specifies using agentic-flow's `fastmcp` library for in-process
    MCP server creation (zero-subprocess overhead)
  - The Xero MCP server exists as a pattern reference but uses stdio (external process),
    while this server must be in-process

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - SDK: `agentic-flow` (installed by TASK-SDK-001, includes `@anthropic-ai/claude-agent-sdk` transitively)
  - MCP: `fastmcp` from agentic-flow for in-process MCP server creation
  - MCP SDK: `@modelcontextprotocol/sdk` v0.6.0 (already installed)
  - Vector: `ruvector` (installed by TASK-SDK-001, for optional semantic search tool)
  - Existing MCP reference: `apps/api/src/mcp/xero-mcp/`
  - All monetary values: integers (cents)

  **Prisma Schema Context:**
  The agent needs to understand the database schema. Key models include:
  - `PayeePattern` — stores learned payee-to-account-code mappings
  - `BankTransaction` — individual bank statement line items
  - `Invoice` — parent invoices with child line items
  - `InvoiceLineItem` — individual invoice lines with account codes
  - `AccountCode` — chart of accounts
  - `Tenant` — multi-tenant isolation

  **Files to Create:**
  - `apps/api/src/mcp/crechebooks-mcp/server.ts`
  - `apps/api/src/mcp/crechebooks-mcp/index.ts`
  - `apps/api/src/mcp/crechebooks-mcp/crechebooks-mcp.module.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/get-patterns.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/get-history.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/get-invoices.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/query-transactions.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/get-reports.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/search-similar-transactions.ts`
  - `apps/api/src/mcp/crechebooks-mcp/tools/index.ts`
  - `apps/api/src/mcp/crechebooks-mcp/types/index.ts`
  - `tests/mcp/crechebooks-mcp/get-patterns.spec.ts`
  - `tests/mcp/crechebooks-mcp/get-history.spec.ts`
  - `tests/mcp/crechebooks-mcp/get-invoices.spec.ts`
  - `tests/mcp/crechebooks-mcp/query-transactions.spec.ts`
  - `tests/mcp/crechebooks-mcp/get-reports.spec.ts`
  - `tests/mcp/crechebooks-mcp/search-similar-transactions.spec.ts`
  - `tests/mcp/crechebooks-mcp/server.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/sdk/sdk-agent.module.ts` — IMPORT `CrecheBooksMcpModule`
  - `apps/api/src/database/database.module.ts` — EXPORT `PrismaService` if not already exported
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build
  pnpm test
  pnpm run lint
  ```

  ### 2. In-Process MCP Server Creation
  Use `fastmcp` from agentic-flow for in-process MCP server creation (NOT a subprocess
  MCP server, NOT the legacy `createSdkMcpServer`):
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/server.ts
  import { FastMCP } from 'agentic-flow/fastmcp';
  import { getPatterns } from './tools/get-patterns';
  import { getHistory } from './tools/get-history';
  import { getInvoices } from './tools/get-invoices';
  import { queryTransactions } from './tools/query-transactions';
  import { getReports } from './tools/get-reports';
  import { searchSimilarTransactions } from './tools/search-similar-transactions';
  import type { PrismaService } from '../../database/prisma.service';
  import type { RuvectorService } from '../../agents/sdk/ruvector.service';

  export function createCrecheBooksMcpServer(
    prismaService: PrismaService,
    ruvectorService?: RuvectorService,
  ) {
    const mcp = new FastMCP({ name: 'crechebooks' });

    // Core 5 data access tools (Prisma-backed)
    mcp.addTool(getPatterns(prismaService));
    mcp.addTool(getHistory(prismaService));
    mcp.addTool(getInvoices(prismaService));
    mcp.addTool(queryTransactions(prismaService));
    mcp.addTool(getReports(prismaService));

    // Optional 6th tool: semantic search via ruvector embeddings
    if (ruvectorService?.isAvailable()) {
      mcp.addTool(searchSimilarTransactions(prismaService, ruvectorService));
    }

    return mcp;
  }
  ```

  ### 3. Tool Implementation Pattern
  Each tool is a function that receives `PrismaService` and returns an MCP tool definition.
  Every tool MUST enforce tenant isolation by requiring and filtering on `tenantId`:
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/get-patterns.ts
  import { PrismaService } from '../../../database/prisma.service';

  export function getPatterns(prisma: PrismaService) {
    return {
      name: 'get_patterns',
      description:
        'Query the payee pattern repository for a specific tenant. Returns matching ' +
        'patterns with account codes, confidence scores, match counts, and VAT types. ' +
        'Use this to find known categorization patterns before applying LLM inference.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED for data isolation.',
          },
          payeeName: {
            type: 'string',
            description: 'Payee name to match against (case-insensitive contains match).',
          },
          description: {
            type: 'string',
            description: 'Transaction description to match against patterns.',
          },
          minConfidence: {
            type: 'number',
            description: 'Minimum confidence score (0-100). Defaults to 0.',
          },
          limit: {
            type: 'number',
            description: 'Max results to return. Defaults to 20.',
          },
        },
        required: ['tenantId'],
      },
      handler: async (args: GetPatternsInput): Promise<GetPatternsOutput> => {
        const limit = args.limit ?? 20;
        const minConfidence = args.minConfidence ?? 0;

        const patterns = await prisma.payeePattern.findMany({
          where: {
            tenantId: args.tenantId,           // MANDATORY tenant isolation
            isActive: true,
            confidence: { gte: minConfidence },
            ...(args.payeeName
              ? { payeeName: { contains: args.payeeName, mode: 'insensitive' } }
              : {}),
            ...(args.description
              ? { description: { contains: args.description, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { matchCount: 'desc' },
          take: limit,
          select: {
            id: true,
            payeeName: true,
            description: true,
            accountCode: true,
            accountName: true,
            vatType: true,
            confidence: true,
            matchCount: true,
            lastMatchedAt: true,
          },
        });

        return {
          tenantId: args.tenantId,
          patternCount: patterns.length,
          patterns,
        };
      },
    };
  }
  ```

  ### 4. Tenant Isolation (CRITICAL SECURITY PATTERN)
  Every single tool handler MUST:
  1. Accept `tenantId` as a required parameter
  2. Include `tenantId` in every Prisma `where` clause
  3. Never return data from other tenants
  4. Never accept queries without `tenantId`

  ```typescript
  // CORRECT — tenant isolation enforced
  where: {
    tenantId: args.tenantId,  // ALWAYS first in where clause
    ...otherFilters,
  }

  // WRONG — cross-tenant data leak
  // where: { ...otherFilters }  // NEVER omit tenantId
  ```

  ### 5. get_history Tool
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/get-history.ts
  export function getHistory(prisma: PrismaService) {
    return {
      name: 'get_history',
      description:
        'Query categorization history for a tenant. Returns past categorization decisions ' +
        'with account codes, confidence scores, and sources (PATTERN, LLM, MANUAL). ' +
        'Use this to understand how similar transactions were categorized previously.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED.',
          },
          payeeName: {
            type: 'string',
            description: 'Filter by payee name (case-insensitive contains).',
          },
          accountCode: {
            type: 'string',
            description: 'Filter by account code.',
          },
          since: {
            type: 'string',
            description: 'ISO date string. Only return history since this date.',
          },
          limit: {
            type: 'number',
            description: 'Max results. Defaults to 50.',
          },
        },
        required: ['tenantId'],
      },
      handler: async (args: GetHistoryInput): Promise<GetHistoryOutput> => {
        const limit = args.limit ?? 50;

        const history = await prisma.categorizationDecision.findMany({
          where: {
            tenantId: args.tenantId,
            ...(args.payeeName
              ? { payeeName: { contains: args.payeeName, mode: 'insensitive' } }
              : {}),
            ...(args.accountCode ? { accountCode: args.accountCode } : {}),
            ...(args.since ? { createdAt: { gte: new Date(args.since) } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            payeeName: true,
            description: true,
            accountCode: true,
            accountName: true,
            vatType: true,
            confidence: true,
            source: true,
            amountCents: true,
            isCredit: true,
            createdAt: true,
          },
        });

        // Aggregate by account code for summary
        const aggregated = history.reduce(
          (acc, item) => {
            const key = item.accountCode;
            if (!acc[key]) {
              acc[key] = { accountCode: key, accountName: item.accountName, count: 0 };
            }
            acc[key].count++;
            return acc;
          },
          {} as Record<string, { accountCode: string; accountName: string; count: number }>,
        );

        return {
          tenantId: args.tenantId,
          totalRecords: history.length,
          history,
          summary: Object.values(aggregated).sort((a, b) => b.count - a.count),
        };
      },
    };
  }
  ```

  ### 6. get_invoices Tool
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/get-invoices.ts
  export function getInvoices(prisma: PrismaService) {
    return {
      name: 'get_invoices',
      description:
        'Query outstanding invoices for a tenant. Returns invoices with line items, ' +
        'amounts (in cents), due dates, and payment status. Use this for payment matching.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED.',
          },
          status: {
            type: 'string',
            enum: ['OUTSTANDING', 'PAID', 'OVERDUE', 'PARTIAL', 'ALL'],
            description: 'Invoice status filter. Defaults to OUTSTANDING.',
          },
          contactName: {
            type: 'string',
            description: 'Filter by contact/payee name (case-insensitive contains).',
          },
          minAmountCents: {
            type: 'number',
            description: 'Minimum total amount in cents.',
          },
          maxAmountCents: {
            type: 'number',
            description: 'Maximum total amount in cents.',
          },
          dueBefore: {
            type: 'string',
            description: 'ISO date. Only invoices due before this date.',
          },
          limit: {
            type: 'number',
            description: 'Max results. Defaults to 30.',
          },
        },
        required: ['tenantId'],
      },
      handler: async (args: GetInvoicesInput): Promise<GetInvoicesOutput> => {
        const limit = args.limit ?? 30;
        const status = args.status ?? 'OUTSTANDING';

        const whereClause: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (status !== 'ALL') {
          whereClause.status = status;
        }
        if (args.contactName) {
          whereClause.contactName = { contains: args.contactName, mode: 'insensitive' };
        }
        if (args.minAmountCents !== undefined || args.maxAmountCents !== undefined) {
          whereClause.totalAmountCents = {
            ...(args.minAmountCents !== undefined ? { gte: args.minAmountCents } : {}),
            ...(args.maxAmountCents !== undefined ? { lte: args.maxAmountCents } : {}),
          };
        }
        if (args.dueBefore) {
          whereClause.dueDate = { lte: new Date(args.dueBefore) };
        }

        const invoices = await prisma.invoice.findMany({
          where: whereClause,
          include: {
            lineItems: {
              select: {
                id: true,
                description: true,
                accountCode: true,
                accountName: true,
                amountCents: true,
                vatType: true,
                quantity: true,
              },
            },
          },
          orderBy: { dueDate: 'asc' },
          take: limit,
        });

        const totalOutstandingCents = invoices.reduce(
          (sum, inv) => sum + (inv.amountDueCents ?? inv.totalAmountCents),
          0,
        );

        return {
          tenantId: args.tenantId,
          invoiceCount: invoices.length,
          totalOutstandingCents,
          invoices: invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            contactName: inv.contactName,
            status: inv.status,
            totalAmountCents: inv.totalAmountCents,
            amountDueCents: inv.amountDueCents,
            dueDate: inv.dueDate?.toISOString() ?? null,
            issuedDate: inv.issuedDate?.toISOString() ?? null,
            lineItems: inv.lineItems,
          })),
        };
      },
    };
  }
  ```

  ### 7. query_transactions Tool
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/query-transactions.ts
  export function queryTransactions(prisma: PrismaService) {
    return {
      name: 'query_transactions',
      description:
        'Query bank transactions for a tenant. Returns transactions with amounts (in cents), ' +
        'dates, payee names, categorization status, and matched invoices. Supports filtering ' +
        'by date range, amount range, status, and payee name.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED.',
          },
          startDate: {
            type: 'string',
            description: 'ISO date. Transactions from this date.',
          },
          endDate: {
            type: 'string',
            description: 'ISO date. Transactions until this date.',
          },
          minAmountCents: {
            type: 'number',
            description: 'Minimum amount in cents (absolute value).',
          },
          maxAmountCents: {
            type: 'number',
            description: 'Maximum amount in cents (absolute value).',
          },
          payeeName: {
            type: 'string',
            description: 'Filter by payee name (case-insensitive contains).',
          },
          status: {
            type: 'string',
            enum: ['UNCATEGORIZED', 'CATEGORIZED', 'MATCHED', 'RECONCILED', 'ALL'],
            description: 'Transaction status. Defaults to ALL.',
          },
          isCredit: {
            type: 'boolean',
            description: 'Filter by credit (true) or debit (false).',
          },
          limit: {
            type: 'number',
            description: 'Max results. Defaults to 50.',
          },
        },
        required: ['tenantId'],
      },
      handler: async (args: QueryTransactionsInput): Promise<QueryTransactionsOutput> => {
        const limit = args.limit ?? 50;

        const whereClause: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (args.startDate || args.endDate) {
          whereClause.transactionDate = {
            ...(args.startDate ? { gte: new Date(args.startDate) } : {}),
            ...(args.endDate ? { lte: new Date(args.endDate) } : {}),
          };
        }
        if (args.minAmountCents !== undefined || args.maxAmountCents !== undefined) {
          whereClause.amountCents = {
            ...(args.minAmountCents !== undefined ? { gte: args.minAmountCents } : {}),
            ...(args.maxAmountCents !== undefined ? { lte: args.maxAmountCents } : {}),
          };
        }
        if (args.payeeName) {
          whereClause.payeeName = { contains: args.payeeName, mode: 'insensitive' };
        }
        if (args.status && args.status !== 'ALL') {
          whereClause.status = args.status;
        }
        if (args.isCredit !== undefined) {
          whereClause.isCredit = args.isCredit;
        }

        const transactions = await prisma.bankTransaction.findMany({
          where: whereClause,
          orderBy: { transactionDate: 'desc' },
          take: limit,
          select: {
            id: true,
            transactionDate: true,
            payeeName: true,
            description: true,
            amountCents: true,
            isCredit: true,
            status: true,
            accountCode: true,
            accountName: true,
            vatType: true,
            confidence: true,
            matchedInvoiceId: true,
          },
        });

        return {
          tenantId: args.tenantId,
          transactionCount: transactions.length,
          transactions: transactions.map((tx) => ({
            ...tx,
            transactionDate: tx.transactionDate?.toISOString() ?? null,
          })),
        };
      },
    };
  }
  ```

  ### 8. get_reports Tool
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/get-reports.ts
  export function getReports(prisma: PrismaService) {
    return {
      name: 'get_reports',
      description:
        'Generate financial summary reports for a tenant. Returns income and expense ' +
        'totals by account code category, monthly totals, and VAT summaries. All amounts ' +
        'are in cents (integers). Use this for financial overview and compliance checks.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED.',
          },
          reportType: {
            type: 'string',
            enum: ['INCOME_EXPENSE', 'VAT_SUMMARY', 'MONTHLY_TOTALS', 'ACCOUNT_BREAKDOWN'],
            description: 'Type of report. Defaults to INCOME_EXPENSE.',
          },
          startDate: {
            type: 'string',
            description: 'ISO date. Report period start.',
          },
          endDate: {
            type: 'string',
            description: 'ISO date. Report period end.',
          },
        },
        required: ['tenantId'],
      },
      handler: async (args: GetReportsInput): Promise<GetReportsOutput> => {
        const reportType = args.reportType ?? 'INCOME_EXPENSE';

        const dateFilter = {
          ...(args.startDate ? { gte: new Date(args.startDate) } : {}),
          ...(args.endDate ? { lte: new Date(args.endDate) } : {}),
        };

        const hasDateFilter = args.startDate || args.endDate;

        // Base query for categorized transactions
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            tenantId: args.tenantId,
            status: 'CATEGORIZED',
            ...(hasDateFilter ? { transactionDate: dateFilter } : {}),
          },
          select: {
            amountCents: true,
            isCredit: true,
            accountCode: true,
            accountName: true,
            vatType: true,
            transactionDate: true,
          },
        });

        // Build report based on type
        switch (reportType) {
          case 'INCOME_EXPENSE': {
            const income = transactions.filter((t) => t.isCredit);
            const expenses = transactions.filter((t) => !t.isCredit);

            return {
              tenantId: args.tenantId,
              reportType,
              period: {
                startDate: args.startDate ?? 'all-time',
                endDate: args.endDate ?? 'current',
              },
              totalIncomeCents: income.reduce((s, t) => s + t.amountCents, 0),
              totalExpenseCents: expenses.reduce((s, t) => s + t.amountCents, 0),
              netCents:
                income.reduce((s, t) => s + t.amountCents, 0) -
                expenses.reduce((s, t) => s + t.amountCents, 0),
              incomeByAccount: this.groupByAccount(income),
              expenseByAccount: this.groupByAccount(expenses),
            };
          }
          case 'VAT_SUMMARY': {
            return {
              tenantId: args.tenantId,
              reportType,
              period: {
                startDate: args.startDate ?? 'all-time',
                endDate: args.endDate ?? 'current',
              },
              vatBreakdown: this.groupByVat(transactions),
            };
          }
          // ... other report types
        }
      },
    };
  }
  ```

  ### 9. TypeScript Types for All Tools
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/types/index.ts

  // ── get_patterns ──────────────────────────────────────────────────────
  export interface GetPatternsInput {
    tenantId: string;
    payeeName?: string;
    description?: string;
    minConfidence?: number;
    limit?: number;
  }

  export interface PatternRecord {
    id: string;
    payeeName: string;
    description: string | null;
    accountCode: string;
    accountName: string;
    vatType: string;
    confidence: number;
    matchCount: number;
    lastMatchedAt: string | null;
  }

  export interface GetPatternsOutput {
    tenantId: string;
    patternCount: number;
    patterns: PatternRecord[];
  }

  // ── get_history ───────────────────────────────────────────────────────
  export interface GetHistoryInput {
    tenantId: string;
    payeeName?: string;
    accountCode?: string;
    since?: string;
    limit?: number;
  }

  export interface HistoryRecord {
    id: string;
    payeeName: string;
    description: string | null;
    accountCode: string;
    accountName: string;
    vatType: string;
    confidence: number;
    source: string;
    amountCents: number;
    isCredit: boolean;
    createdAt: string;
  }

  export interface HistorySummaryItem {
    accountCode: string;
    accountName: string;
    count: number;
  }

  export interface GetHistoryOutput {
    tenantId: string;
    totalRecords: number;
    history: HistoryRecord[];
    summary: HistorySummaryItem[];
  }

  // ── get_invoices ──────────────────────────────────────────────────────
  export interface GetInvoicesInput {
    tenantId: string;
    status?: 'OUTSTANDING' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'ALL';
    contactName?: string;
    minAmountCents?: number;
    maxAmountCents?: number;
    dueBefore?: string;
    limit?: number;
  }

  export interface InvoiceLineItemRecord {
    id: string;
    description: string;
    accountCode: string;
    accountName: string;
    amountCents: number;
    vatType: string;
    quantity: number;
  }

  export interface InvoiceRecord {
    id: string;
    invoiceNumber: string;
    contactName: string;
    status: string;
    totalAmountCents: number;
    amountDueCents: number | null;
    dueDate: string | null;
    issuedDate: string | null;
    lineItems: InvoiceLineItemRecord[];
  }

  export interface GetInvoicesOutput {
    tenantId: string;
    invoiceCount: number;
    totalOutstandingCents: number;
    invoices: InvoiceRecord[];
  }

  // ── query_transactions ────────────────────────────────────────────────
  export interface QueryTransactionsInput {
    tenantId: string;
    startDate?: string;
    endDate?: string;
    minAmountCents?: number;
    maxAmountCents?: number;
    payeeName?: string;
    status?: 'UNCATEGORIZED' | 'CATEGORIZED' | 'MATCHED' | 'RECONCILED' | 'ALL';
    isCredit?: boolean;
    limit?: number;
  }

  export interface TransactionRecord {
    id: string;
    transactionDate: string | null;
    payeeName: string;
    description: string | null;
    amountCents: number;
    isCredit: boolean;
    status: string;
    accountCode: string | null;
    accountName: string | null;
    vatType: string | null;
    confidence: number | null;
    matchedInvoiceId: string | null;
  }

  export interface QueryTransactionsOutput {
    tenantId: string;
    transactionCount: number;
    transactions: TransactionRecord[];
  }

  // ── get_reports ───────────────────────────────────────────────────────
  export interface GetReportsInput {
    tenantId: string;
    reportType?: 'INCOME_EXPENSE' | 'VAT_SUMMARY' | 'MONTHLY_TOTALS' | 'ACCOUNT_BREAKDOWN';
    startDate?: string;
    endDate?: string;
  }

  export interface AccountGroupItem {
    accountCode: string;
    accountName: string;
    totalCents: number;
    transactionCount: number;
  }

  export interface VatGroupItem {
    vatType: string;
    totalCents: number;
    transactionCount: number;
  }

  export interface MonthlyTotalItem {
    month: string; // YYYY-MM
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }

  export interface GetReportsOutput {
    tenantId: string;
    reportType: string;
    period: {
      startDate: string;
      endDate: string;
    };
    totalIncomeCents?: number;
    totalExpenseCents?: number;
    netCents?: number;
    incomeByAccount?: AccountGroupItem[];
    expenseByAccount?: AccountGroupItem[];
    vatBreakdown?: VatGroupItem[];
    monthlyTotals?: MonthlyTotalItem[];
  }
  ```

  ### 10. NestJS Module for MCP Server
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/crechebooks-mcp.module.ts
  import { Module } from '@nestjs/common';
  import { DatabaseModule } from '../../database/database.module';
  import { SdkAgentModule } from '../../agents/sdk/sdk-agent.module';
  import { CrecheBooksMcpService } from './server';

  @Module({
    imports: [DatabaseModule, SdkAgentModule],  // SdkAgentModule provides RuvectorService
    providers: [CrecheBooksMcpService],
    exports: [CrecheBooksMcpService],
  })
  export class CrecheBooksMcpModule {}
  ```

  ### 10b. search_similar_transactions Tool (Optional, ruvector-powered)
  ```typescript
  // apps/api/src/mcp/crechebooks-mcp/tools/search-similar-transactions.ts
  import type { PrismaService } from '../../../database/prisma.service';
  import type { RuvectorService } from '../../../agents/sdk/ruvector.service';

  export function searchSimilarTransactions(
    prisma: PrismaService,
    ruvector: RuvectorService,
  ) {
    return {
      name: 'search_similar_transactions',
      description:
        'Find transactions semantically similar to a given description using vector ' +
        'embeddings (ruvector, all-MiniLM-L6-v2, 384d). Returns transactions ranked by ' +
        'cosine similarity. Use this when exact text matching fails and you need fuzzy, ' +
        'meaning-based transaction lookup.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenantId: {
            type: 'string',
            description: 'Tenant ID (UUID). REQUIRED for data isolation.',
          },
          queryText: {
            type: 'string',
            description: 'Natural language description to search for similar transactions.',
          },
          minSimilarity: {
            type: 'number',
            description: 'Minimum cosine similarity score (0.0-1.0). Defaults to 0.5.',
          },
          limit: {
            type: 'number',
            description: 'Max results to return. Defaults to 10.',
          },
        },
        required: ['tenantId', 'queryText'],
      },
      handler: async (args: SearchSimilarInput): Promise<SearchSimilarOutput> => {
        const limit = args.limit ?? 10;
        const minSimilarity = args.minSimilarity ?? 0.5;

        // 1. Generate embedding for query text (sanitized — no raw PII sent)
        const sanitizedQuery = sanitizeForEmbedding(args.queryText);
        const embedding = await ruvector.generateEmbedding(sanitizedQuery);

        // 2. Search ruvector for similar transaction embeddings
        const similar = await ruvector.searchSimilar(
          embedding,
          `transactions:${args.tenantId}`,  // Tenant-scoped collection
          limit,
        );

        // 3. Filter by minimum similarity and fetch full transaction data
        const matchingIds = similar
          .filter((s) => s.score >= minSimilarity)
          .map((s) => s.id);

        const transactions = await prisma.bankTransaction.findMany({
          where: {
            tenantId: args.tenantId,  // MANDATORY tenant isolation
            id: { in: matchingIds },
          },
          select: {
            id: true,
            transactionDate: true,
            payeeName: true,
            description: true,
            amountCents: true,
            isCredit: true,
            status: true,
            accountCode: true,
            accountName: true,
          },
        });

        return {
          tenantId: args.tenantId,
          queryText: args.queryText,
          resultCount: transactions.length,
          results: transactions.map((tx) => ({
            ...tx,
            transactionDate: tx.transactionDate?.toISOString() ?? null,
            similarityScore: similar.find((s) => s.id === tx.id)?.score ?? 0,
          })),
        };
      },
    };
  }

  /** Strip PII markers before sending text to embedding model */
  function sanitizeForEmbedding(text: string): string {
    // Remove potential ID numbers, phone numbers, email addresses
    return text
      .replace(/\b\d{10,13}\b/g, '[ID]')
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[EMAIL]')
      .replace(/\b0\d{9}\b/g, '[PHONE]');
  }
  ```

  ### 11. Testing Pattern
  Tests MUST use a mock PrismaService — never connect to a real database:
  ```typescript
  describe('get_patterns tool', () => {
    let prisma: DeepMockProxy<PrismaService>;
    let tool: ReturnType<typeof getPatterns>;

    beforeEach(() => {
      prisma = mockDeep<PrismaService>();
      tool = getPatterns(prisma);
    });

    it('should require tenantId', () => {
      expect(tool.inputSchema.required).toContain('tenantId');
    });

    it('should return patterns filtered by tenantId', async () => {
      prisma.payeePattern.findMany.mockResolvedValue([
        {
          id: 'pat-1',
          payeeName: 'Woolworths',
          description: 'Groceries',
          accountCode: '5300',
          accountName: 'Food & Catering',
          vatType: 'STANDARD',
          confidence: 95,
          matchCount: 42,
          lastMatchedAt: new Date(),
          tenantId: 'tenant-abc',
          isActive: true,
        },
      ]);

      const result = await tool.handler({ tenantId: 'tenant-abc' });

      expect(result.tenantId).toBe('tenant-abc');
      expect(result.patternCount).toBe(1);
      expect(result.patterns[0].accountCode).toBe('5300');
      expect(prisma.payeePattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-abc' }),
        }),
      );
    });

    it('should filter by payeeName case-insensitively', async () => {
      prisma.payeePattern.findMany.mockResolvedValue([]);

      await tool.handler({ tenantId: 'tenant-abc', payeeName: 'wool' });

      expect(prisma.payeePattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-abc',
            payeeName: { contains: 'wool', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should never return data without tenantId', async () => {
      // Verify the tool schema requires tenantId
      expect(tool.inputSchema.required).toContain('tenantId');
    });

    it('should respect limit parameter', async () => {
      prisma.payeePattern.findMany.mockResolvedValue([]);

      await tool.handler({ tenantId: 'tenant-abc', limit: 5 });

      expect(prisma.payeePattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('should default limit to 20', async () => {
      prisma.payeePattern.findMany.mockResolvedValue([]);

      await tool.handler({ tenantId: 'tenant-abc' });

      expect(prisma.payeePattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });
  ```

  ### 12. Monetary Values in Cents
  ALL monetary values MUST be integers (cents). Never use floating-point:
  ```typescript
  // CORRECT
  amountCents: 150000  // R1,500.00

  // WRONG
  // amount: 1500.00    // NEVER use floating-point for money
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  The in-process MCP server provides SDK agents with structured access to internal
  financial data, enabling informed LLM inference for:

  - **Transaction categorization**: Looking up known payee patterns and historical
    categorization decisions to inform LLM-assisted categorization of novel transactions
  - **Payment matching**: Querying outstanding invoices and transaction data to find
    matches between bank payments and invoices
  - **SARS compliance**: Accessing financial reports and transaction data for tax
    compliance validation
  - **Conversational queries**: Enabling natural language financial queries from
    creche owners/administrators

  ## SA Compliance Notes
  - All monetary values in cents (integers) — R1,500.00 = 150000
  - VAT types: STANDARD (15%), ZERO_RATED, EXEMPT (education under Section 12(h)), NO_VAT
  - Tenant isolation is legally critical — each creche's data must be completely isolated
  - POPI (Protection of Personal Information) Act compliance requires strict data access controls

  ## Architectural Decisions
  - **In-process** MCP server (not subprocess) — zero overhead, shared memory
  - Uses `fastmcp` from agentic-flow for MCP server creation
  - Receives `PrismaService` via dependency injection — no direct DB connection strings
  - All tools are **read-only** — no mutations via MCP tools (safety measure)
  - Tool names prefixed with `crechebooks` namespace: `mcp__crechebooks__get_patterns`
  - Each tool returns structured data with `tenantId` echo for verification

  ## Existing MCP Reference
  The Xero MCP server at `apps/api/src/mcp/xero-mcp/` shows the project's MCP patterns,
  but it uses stdio transport (external process). This new server uses in-process transport.
  Review the Xero MCP server for naming conventions, error handling, and code style, but
  do NOT copy its transport mechanism.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create in-process MCP server using `fastmcp` from agentic-flow
    - Implement 5 core read-only MCP tools (Prisma-backed):
      1. `get_patterns` — query PayeePattern table with tenant isolation
      2. `get_history` — query categorization history with aggregation
      3. `get_invoices` — query outstanding invoices with parent/child line items
      4. `query_transactions` — query bank transactions with date/amount/status filters
      5. `get_reports` — generate financial summaries (income/expense, VAT, monthly)
    - Implement 1 optional read-only MCP tool (ruvector-backed):
      6. `search_similar_transactions` — semantic search via ruvector vector embeddings
         (only registered when `RuvectorService.isAvailable()` returns true)
    - Each tool enforces mandatory tenant isolation (`tenantId` required + filtered)
    - All monetary values returned as integers (cents)
    - Full TypeScript types for all tool inputs and outputs
    - NestJS module (`CrecheBooksMcpModule`) with proper DI (imports `SdkAgentModule` for `RuvectorService`)
    - Barrel export (`index.ts`)
    - Integration with `SdkAgentModule` from TASK-SDK-001
    - Unit/integration tests for each tool (mock PrismaService and RuvectorService)
    - Server-level tests (tool registration, error handling, optional tool conditional registration)
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing 1536 tests still pass
  </in_scope>

  <out_of_scope>
    - Xero MCP server changes (separate concern, already exists)
    - Write/mutation MCP tools (read-only for safety in this task)
    - Authentication within MCP tools (handled by parent agent context/NestJS guards)
    - External stdio MCP transport (this is in-process only)
    - SDK agent implementations (TASK-SDK-003 through TASK-SDK-008)
    - Rate limiting or caching layer (future optimization)
    - Prisma schema changes (use existing schema)
    - Real database integration tests (use mock PrismaService)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify MCP server directory structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/mcp/crechebooks-mcp/
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/mcp/crechebooks-mcp/tools/
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/mcp/crechebooks-mcp/types/

# 2. Verify all 5 tools exist
ls /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/mcp/crechebooks-mcp/tools/

# 3. Build succeeds
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm run build

# 4. Run MCP-specific tests
pnpm test -- --testPathPattern="crechebooks-mcp" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify tenant isolation — every tool handler must filter by tenantId
grep -rn "tenantId" apps/api/src/mcp/crechebooks-mcp/tools/ | grep "where"

# 8. Verify no floating-point monetary values
grep -rn "amount:" apps/api/src/mcp/crechebooks-mcp/ | grep -v "Cents" | grep -v "cents" && echo "WARN: possible float amounts" || echo "PASS: all amounts use cents"

# 9. Verify no 'any' types
grep -rn ": any" apps/api/src/mcp/crechebooks-mcp/ && echo "FAIL: found 'any'" || echo "PASS: no 'any'"

# 10. Verify SdkAgentModule imports CrecheBooksMcpModule
grep "CrecheBooksMcpModule" apps/api/src/agents/sdk/sdk-agent.module.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] CrecheBooks in-process MCP server created using `fastmcp` from agentic-flow
  - [ ] `CrecheBooksMcpModule` NestJS module created with `DatabaseModule` and `SdkAgentModule` imports
  - [ ] `get_patterns` tool queries `PayeePattern` table with tenant isolation, payee name filter, confidence filter, and limit
  - [ ] `get_history` tool queries categorization history with tenant isolation, aggregation summary by account code, payee and date filters
  - [ ] `get_invoices` tool queries invoices with tenant isolation, status filter, contact name filter, amount range, due date filter, and includes line items
  - [ ] `query_transactions` tool queries bank transactions with tenant isolation, date range, amount range, status filter, payee filter, credit/debit filter
  - [ ] `get_reports` tool generates financial summaries: INCOME_EXPENSE (income/expense by account), VAT_SUMMARY (by VAT type), MONTHLY_TOTALS, ACCOUNT_BREAKDOWN
  - [ ] ALL tools enforce mandatory tenant isolation (`tenantId` required in schema + used in every where clause)
  - [ ] ALL monetary values are integers (cents) — no floating-point
  - [ ] Optional `search_similar_transactions` tool using ruvector vector embeddings for semantic search
  - [ ] `search_similar_transactions` only registered when `RuvectorService.isAvailable()` returns true
  - [ ] `search_similar_transactions` sanitizes input text before embedding (strips PII: IDs, emails, phone numbers)
  - [ ] `search_similar_transactions` uses tenant-scoped ruvector collections (`transactions:{tenantId}`)
  - [ ] ALL tools are read-only — no create/update/delete operations
  - [ ] Full TypeScript types for all tool inputs and outputs in `types/index.ts`
  - [ ] Barrel export `index.ts` exports module, server factory, and types
  - [ ] Tools barrel `tools/index.ts` exports all 6 tool factory functions (5 core + 1 optional)
  - [ ] `SdkAgentModule` updated to import `CrecheBooksMcpModule`
  - [ ] `DatabaseModule` exports `PrismaService` (verify or add)
  - [ ] Unit tests for `get_patterns`: tenant filter, payee filter, confidence filter, limit default, limit override
  - [ ] Unit tests for `get_history`: tenant filter, date filter, aggregation, payee filter
  - [ ] Unit tests for `get_invoices`: tenant filter, status filter, amount range, line items included
  - [ ] Unit tests for `query_transactions`: tenant filter, date range, status filter, credit/debit filter
  - [ ] Unit tests for `get_reports`: income/expense calculation, VAT grouping, period filtering
  - [ ] Unit tests for `search_similar_transactions`: tenant filter, PII sanitization, similarity threshold, ruvector mock
  - [ ] Server-level tests: all 5 core tools registered (+ optional 6th when ruvector available), error handling for missing tenantId
  - [ ] Test coverage >= 90% for all MCP files
  - [ ] Zero `any` types
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing 1536 tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER expose data across tenants** — every query MUST filter by `tenantId`. This is a legal/POPI requirement, not just a best practice.
  - **NEVER return floating-point monetary values** — always use integer cents (R1,500.00 = 150000)
  - **NEVER use `any` type** — use proper TypeScript interfaces from `types/index.ts`
  - **NEVER create a separate subprocess MCP server** — use in-process `fastmcp` from agentic-flow for zero overhead
  - **NEVER expose write/mutation operations through MCP tools** — read-only for safety
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER connect directly to the database** — always use `PrismaService` via NestJS DI
  - **NEVER return raw Prisma objects** — map to typed output interfaces (serialization safety)
  - **NEVER omit `tenantId` from any tool's required parameters** — it is always required
  - **NEVER use `findFirst` without tenantId** — always include tenant filter
  - **NEVER expose internal IDs that could enable cross-tenant enumeration** — return only necessary fields
  - **NEVER make real database calls in tests** — always mock PrismaService
  - **NEVER send raw PII to ruvector for embedding** — sanitize text before generating embeddings (strip ID numbers, email addresses, phone numbers). Same PII protection rules as LLM inference apply to vector embeddings.
</anti_patterns>

</task_spec>
