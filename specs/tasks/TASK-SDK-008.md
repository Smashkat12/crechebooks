<task_spec id="TASK-SDK-008" version="2.0">

<metadata>
  <title>ConversationalAgent Implementation (Natural Language Financial Queries)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>708</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-SDK-CONVERSATIONAL</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has no natural language interface for financial queries. Creche owners must navigate through multiple UI screens to answer questions like "How much did we spend on food this month?", "Which parents owe us money?", or "What's our revenue trend?". The Claude Agent SDK enables a conversational agent that queries the database via MCP tools and returns human-friendly answers.

  This is a BRAND NEW agent -- nothing exists in the codebase today. The implementation will leverage **agentic-flow**'s conversational agent patterns as a base, customized with CrecheBooks domain knowledge, SA financial context, and compliance rules. **ruvector** provides semantic search over transaction descriptions -- queries like "show me payments from Woolworths" use vector similarity search (384d ONNX WASM embeddings) instead of exact SQL `LIKE` queries, dramatically improving natural language query accuracy. **Multi-model routing** (via agentic-flow) routes complex financial queries (e.g., trend analysis, multi-period comparisons) to sonnet and simple lookups (e.g., "how many children enrolled?") to haiku for cost efficiency.

  **Gap Analysis:**
  - No natural language query interface exists
  - No way to ask ad-hoc financial questions without navigating specific UI screens
  - No conversational context for follow-up questions
  - No financial insights or summaries on demand
  - No API endpoint for conversational interaction with the financial data
  - No query validation/safety layer for preventing data modification or cross-tenant access
  - No semantic search over transaction descriptions (only exact SQL matching)
  - No model routing based on query complexity (all queries use the same model)

  **Key Files to Understand:**
  - `apps/api/src/agents/orchestrator/orchestrator.module.ts` - Where new agent modules are imported
  - `apps/api/src/database/database.module.ts` - Where DatabaseModule imports agent modules (line 117-118)
  - `apps/api/src/database/prisma/prisma.service.ts` - Database access layer
  - `apps/api/src/agents/transaction-categorizer/interfaces/categorizer.interface.ts` - Example of agent interface patterns
  - `apps/api/src/agents/sars-agent/sars.agent.ts` - Example of agent using underlying services
  - `apps/api/src/mcp/xero-mcp/` - Existing MCP tool implementation pattern
  - `apps/api/src/database/services/financial-report.service.ts` - Existing financial reporting service
  - `apps/api/src/database/services/categorization.service.ts` - Transaction categorization data
  - `apps/api/src/database/services/arrears.service.ts` - Outstanding debt data
  - `apps/api/src/database/services/payment-matching.service.ts` - Payment status data

  **Files to Create:**
  - `apps/api/src/agents/conversational/conversational.agent.ts` - Main agent with SDK integration
  - `apps/api/src/agents/conversational/conversational.module.ts` - NestJS module
  - `apps/api/src/agents/conversational/conversational-prompt.ts` - System prompt with SA creche financial context
  - `apps/api/src/agents/conversational/query-validator.ts` - Validates and sanitizes queries for safety
  - `apps/api/src/agents/conversational/interfaces/conversational.interface.ts` - TypeScript interfaces
  - `apps/api/src/agents/conversational/index.ts` - Barrel export
  - `apps/api/src/api/conversational/conversational.controller.ts` - REST API endpoint
  - `apps/api/src/api/conversational/dto/ask-question.dto.ts` - Request DTO with class-validator
  - `tests/agents/conversational/conversational.agent.spec.ts` - Agent unit tests
  - `tests/agents/conversational/query-validator.spec.ts` - Validator unit tests

  **Files to Modify:**
  - `apps/api/src/database/database.module.ts` - ADD ConversationalModule to imports
  - `apps/api/src/agents/orchestrator/orchestrator.module.ts` - ADD ConversationalModule to imports (for orchestrator to potentially route to conversational agent)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add`, etc.

  ### 2. Monetary Values in CENTS -- Display as Rands
  Internal values are CENTS (integers). When displaying to the user via conversational responses, format as South African Rands.
  ```typescript
  // Internal storage: CENTS
  const amountCents = 1500000; // R15,000.00

  // Display to user: RANDS with proper formatting
  function formatCents(cents: number): string {
    const rands = cents / 100;
    return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // Output: "R 15,000.00"
  ```

  ### 3. Tenant Isolation on ALL Queries
  Every database query MUST include `tenantId`. The conversational agent must NEVER access data from other tenants.
  ```typescript
  // CORRECT - tenantId in every query
  const transactions = await this.prisma.transaction.findMany({
    where: {
      tenantId, // ALWAYS included
      isDeleted: false,
      // ... other filters
    },
  });

  // WRONG - NEVER query without tenantId
  const allTransactions = await this.prisma.transaction.findMany({
    where: { isDeleted: false }, // MISSING tenantId -- data leakage!
  });
  ```

  ### 4. NestJS Module Pattern
  Follow the established agent module pattern from existing agents.
  ```typescript
  // conversational.module.ts
  import { Module, forwardRef } from '@nestjs/common';
  import { ConversationalAgent } from './conversational.agent';
  import { QueryValidator } from './query-validator';
  import { DatabaseModule } from '../../database/database.module';

  @Module({
    imports: [forwardRef(() => DatabaseModule)],
    providers: [ConversationalAgent, QueryValidator],
    exports: [ConversationalAgent],
  })
  export class ConversationalModule {}
  ```

  ### 5. SDK Agent Definition (agentic-flow conversational agent base + multi-model routing)
  ```typescript
  import { ConversationalAgentBase, MultiModelRouter } from 'agentic-flow';

  // Use agentic-flow's conversational agent patterns as the base,
  // customized with CrecheBooks domain knowledge and SA financial context.
  const CONVERSATIONAL_AGENT_DEF = {
    base: ConversationalAgentBase, // Inherits agentic-flow's conversation management, context tracking
    description: 'Answers natural language questions about financial data for SA creches',
    prompt: CONVERSATIONAL_SYSTEM_PROMPT, // from conversational-prompt.ts
    tools: [
      'mcp__crechebooks__query_transactions',
      'mcp__crechebooks__get_invoices',
      'mcp__crechebooks__get_reports',
      'mcp__crechebooks__get_patterns',
      'mcp__crechebooks__semantic_search', // NEW: ruvector-powered semantic search over transaction descriptions
    ],
    // Multi-model routing: sonnet for complex financial queries, haiku for simple lookups
    modelRouter: new MultiModelRouter({
      default: 'sonnet', // Complex queries: trend analysis, multi-period comparisons, financial summaries
      rules: [
        { complexity: 'simple', model: 'haiku' }, // Simple lookups: "how many children?", "what's the balance?"
        { complexity: 'complex', model: 'sonnet' }, // Complex: "compare Q1 vs Q2 revenue by category"
      ],
    }),
  };
  ```

  ### 5b. ruvector Semantic Search MCP Tool
  ```typescript
  // NEW MCP tool powered by ruvector for semantic transaction search.
  // Instead of exact SQL LIKE queries, uses 384d vector embeddings to find
  // transactions by meaning: "show me payments from Woolworths" matches
  // "WOOLWORTHS FOOD SA", "WW ONLINE", etc.
  const SEMANTIC_SEARCH_TOOL = {
    name: 'mcp__crechebooks__semantic_search',
    description: 'Search transactions by meaning, not just exact text. Uses vector similarity to find matching transactions even with different wording.',
    parameters: {
      query: { type: 'string', description: 'Natural language description of what to search for' },
      tenantId: { type: 'string', description: 'Tenant ID for isolation' },
      limit: { type: 'number', description: 'Max results to return', default: 20 },
      dateRange: { type: 'object', description: 'Optional date range filter', optional: true },
    },
    handler: async (params) => {
      // Uses ruvector's HNSW index for fast approximate nearest neighbor search
      // Embeddings generated via ONNX WASM runtime (384 dimensions)
      return this.ruvectorService.semanticSearch(params.query, params.tenantId, {
        limit: params.limit,
        dateRange: params.dateRange,
      });
    },
  };
  ```

  ### 6. System Prompt Structure
  The system prompt must include comprehensive SA creche financial context.
  ```typescript
  export const CONVERSATIONAL_SYSTEM_PROMPT = `You are a friendly financial assistant for a South African creche (daycare).
  Help the creche owner understand their finances by querying the database.

  CAPABILITIES:
  - Revenue analysis (tuition fees, registration, extra-mural, after-care, etc.)
  - Expense tracking (salaries, rent, utilities, food/catering, supplies, transport, etc.)
  - Outstanding invoices and parent debts
  - Payment status and history
  - Monthly/quarterly financial summaries
  - Cash flow analysis
  - Tax obligation summaries (PAYE, UIF, SDL, VAT)

  RULES:
  - Always query the database for real data -- never guess or fabricate numbers
  - All monetary amounts are stored in CENTS internally -- display as Rands (divide by 100)
  - Format currency as R X,XXX.XX (South African Rand)
  - Tenant isolation: only access data for the authenticated tenant
  - Do NOT provide tax advice -- redirect tax questions to "Please use the SARS returns section for tax calculations"
  - Be conversational and friendly -- the user is a creche owner, not an accountant
  - If a question is ambiguous, ask for clarification
  - Support follow-up questions using conversation context
  - When summarizing, round to nearest Rand for readability but show exact cents in detailed views

  SA-SPECIFIC CONTEXT:
  - Tax year: March to February
  - VAT rate: 15% (education services exempt under Section 12(h))
  - EMP201: Monthly employer return (PAYE + UIF + SDL)
  - Common creche revenue: tuition fees, registration fees, extra-mural activities, after-care fees
  - Common creche expenses: staff salaries, rent, food/catering, educational supplies, cleaning, transport, utilities
  - Parents are billed monthly, typically in advance
  - Invoice numbering format: INV-XXXXXX
  `;
  ```

  ### 7. Query Validator
  ```typescript
  @Injectable()
  export class QueryValidator {
    private readonly BLOCKED_KEYWORDS = [
      'delete', 'drop', 'truncate', 'update', 'insert', 'alter',
      'password', 'token', 'secret', 'api_key', 'credential',
    ];

    validate(question: string, tenantId: string): QueryValidationResult {
      if (!question || question.trim().length === 0) {
        return { isValid: false, reason: 'Question cannot be empty' };
      }

      if (!tenantId) {
        return { isValid: false, reason: 'Tenant context is required' };
      }

      if (question.length > 1000) {
        return { isValid: false, reason: 'Question exceeds maximum length (1000 characters)' };
      }

      const lowerQuestion = question.toLowerCase();
      for (const keyword of this.BLOCKED_KEYWORDS) {
        if (lowerQuestion.includes(keyword)) {
          return { isValid: false, reason: `Query contains blocked keyword: ${keyword}` };
        }
      }

      return { isValid: true, sanitizedQuestion: question.trim() };
    }
  }
  ```

  ### 8. Controller Pattern with Auth Guard
  ```typescript
  import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
  import { AuthGuard } from '../../auth/guards/auth.guard';
  import { AskQuestionDto } from './dto/ask-question.dto';

  @Controller('api/conversational')
  export class ConversationalController {
    constructor(private readonly conversationalAgent: ConversationalAgent) {}

    @Post('ask')
    @UseGuards(AuthGuard)
    async ask(
      @Body() dto: AskQuestionDto,
      @Req() req: AuthenticatedRequest,
    ): Promise<ConversationalResponse> {
      return this.conversationalAgent.ask(dto.question, req.user.tenantId, dto.conversationId);
    }
  }
  ```

  ### 9. DTO with class-validator
  ```typescript
  import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

  export class AskQuestionDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    question: string;

    @IsString()
    @IsOptional()
    conversationId?: string; // For follow-up questions
  }
  ```

  ### 10. Read-Only Enforcement
  The conversational agent must NEVER modify data. All database access through MCP tools must be read-only.
  ```typescript
  // MCP tools exposed to the agent should ONLY be read operations
  // CORRECT: findMany, aggregate, count, findFirst
  // WRONG: create, update, delete, upsert -- NEVER expose write tools to this agent
  ```
</critical_patterns>

<context>
  ## Business Context

  This is a brand new agent that enables creche owners to ask natural language questions about their financial data. Target questions include:

  - "How much did we collect in tuition this month?"
  - "Which parents haven't paid yet?"
  - "What are our top 5 expenses?"
  - "Compare revenue this month vs last month"
  - "How much do we owe SARS?"
  - "Show me all bank charges this quarter"
  - "What's our profit margin this month?"
  - "How many children are enrolled?"
  - "Which invoices are overdue?"

  ### SA-Specific Financial Context
  - Currency: ZAR (South African Rand, symbol R)
  - Tax year: March to February
  - VAT: 15% rate, education services exempt under Section 12(h) of the VAT Act
  - EMP201: Monthly employer declaration (PAYE + UIF + SDL) due by 7th of following month
  - Common creche chart of accounts follows SA IFRS conventions (see `.claude/context/chart_of_accounts.json`)

  ### Data Sources Available
  The conversational agent can query via MCP tools:
  - **Transactions** -- bank transactions with categories, amounts, dates, payee names
  - **Invoices** -- parent invoices with line items, amounts, payment status
  - **Payments** -- payment allocations, receipts, outstanding balances
  - **SARS data** -- PAYE calculations, EMP201/VAT201 submissions (read-only summaries)
  - **Enrollments** -- child enrollment status, parent details
  - **Financial reports** -- existing FinancialReportService for summaries

  ### Existing Services That Provide Data
  - `FinancialReportService` at `apps/api/src/database/services/financial-report.service.ts`
  - `ArrearsService` at `apps/api/src/database/services/arrears.service.ts`
  - `PaymentMatchingService` at `apps/api/src/database/services/payment-matching.service.ts`
  - `CategorizationService` at `apps/api/src/database/services/categorization.service.ts`
  - `Emp201Service` / `Vat201Service` for tax obligation summaries
  - `PrismaService` for direct database queries with tenant isolation
</context>

<scope>
  <in_scope>
    - ConversationalAgent class using agentic-flow's conversational agent base patterns, customized with CrecheBooks domain knowledge
    - agentic-flow conversational agent base integration (conversation management, context tracking)
    - ruvector semantic search MCP tool (`mcp__crechebooks__semantic_search`) for vector-based transaction description search
    - Multi-model routing via agentic-flow: sonnet for complex financial queries, haiku for simple lookups
    - ConversationalModule as NestJS module with proper imports/exports
    - System prompt with comprehensive SA creche financial context (revenue categories, expense categories, SA tax specifics)
    - QueryValidator with safety checks (blocked keywords, length limits, tenant enforcement)
    - POST /api/conversational/ask endpoint with AuthGuard
    - AskQuestionDto with class-validator decorators
    - ConversationalResponse interface with answer text and metadata
    - Tenant isolation enforced at every layer (validator, agent, MCP tools, ruvector queries)
    - MCP tool integration for read-only data access (including ruvector semantic search)
    - Support for optional conversationId for follow-up question context
    - Currency formatting utility (cents to R X,XXX.XX)
    - Index/barrel export at agents/conversational/index.ts
    - Unit tests for ConversationalAgent (90%+ coverage)
    - Unit tests for QueryValidator (90%+ coverage)
    - Registration in database.module.ts imports
  </in_scope>
  <out_of_scope>
    - WebSocket/streaming responses (future enhancement)
    - Voice input / speech-to-text
    - Multi-language support (English only for now)
    - Data modification through conversational queries (strictly read-only)
    - Chart/graph generation (text-only responses)
    - Conversation history persistence to database (TASK-SDK-010 or future)
    - Rate limiting on the conversational endpoint (infrastructure concern)
    - Frontend UI for the chat interface (web team task)
    - MCP tool definitions (TASK-SDK-002 handles this)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run build

# 2. Lint check
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run lint

# 3. Run conversational agent tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="conversational"

# 4. Run all agent tests (ensure no regressions)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="agents"

# 5. Verify new files exist
ls -la apps/api/src/agents/conversational/conversational.agent.ts
ls -la apps/api/src/agents/conversational/conversational.module.ts
ls -la apps/api/src/agents/conversational/conversational-prompt.ts
ls -la apps/api/src/agents/conversational/query-validator.ts
ls -la apps/api/src/agents/conversational/interfaces/conversational.interface.ts
ls -la apps/api/src/agents/conversational/index.ts
ls -la apps/api/src/api/conversational/conversational.controller.ts
ls -la apps/api/src/api/conversational/dto/ask-question.dto.ts
ls -la tests/agents/conversational/conversational.agent.spec.ts
ls -la tests/agents/conversational/query-validator.spec.ts

# 6. Verify module is imported in database.module.ts
grep -n "ConversationalModule" apps/api/src/database/database.module.ts

# 7. Verify no write operations in conversational agent
grep -rn "create\|update\|delete\|upsert" apps/api/src/agents/conversational/ --include="*.ts" | grep -v "// " | grep -v "test" | grep -v ".spec."
# Should return NO results (all queries must be read-only)

# 8. Verify tenant isolation in every query
grep -rn "tenantId" apps/api/src/agents/conversational/ --include="*.ts"
# Should show tenantId used in every database interaction
```
</verification_commands>

<definition_of_done>
  - [ ] `ConversationalAgent` class created as `@Injectable()` at `apps/api/src/agents/conversational/conversational.agent.ts`
  - [ ] `ConversationalAgent` uses agentic-flow's conversational agent base patterns (`ConversationalAgentBase`) customized with CrecheBooks domain knowledge
  - [ ] Multi-model routing configured via agentic-flow: sonnet for complex financial queries (trend analysis, multi-period comparisons), haiku for simple lookups (counts, balances)
  - [ ] ruvector semantic search MCP tool (`mcp__crechebooks__semantic_search`) registered and functional for vector-based transaction description search
  - [ ] `ConversationalModule` created at `apps/api/src/agents/conversational/conversational.module.ts` with proper imports/exports
  - [ ] System prompt exported from `apps/api/src/agents/conversational/conversational-prompt.ts` with:
    - Complete list of queryable capabilities (revenue, expenses, invoices, payments, tax, enrollment)
    - SA-specific financial context (ZAR formatting, tax year, VAT exemption, EMP201)
    - Explicit rules about read-only access and no tax advice
    - Instructions for friendly, non-accountant-friendly language
  - [ ] `QueryValidator` class at `apps/api/src/agents/conversational/query-validator.ts` with:
    - Empty question rejection
    - Missing tenantId rejection
    - Maximum length enforcement (1000 chars)
    - Blocked keyword detection (delete, drop, truncate, update, insert, alter, password, token, secret, api_key, credential)
    - Returns `QueryValidationResult` with `isValid`, `reason`, and `sanitizedQuestion`
  - [ ] `POST /api/conversational/ask` endpoint at `apps/api/src/api/conversational/conversational.controller.ts`
  - [ ] `AuthGuard` applied to the endpoint (authenticated users only)
  - [ ] `AskQuestionDto` at `apps/api/src/api/conversational/dto/ask-question.dto.ts` with `@IsString()`, `@IsNotEmpty()`, `@MaxLength(1000)`, optional `conversationId`
  - [ ] `ConversationalResponse` interface with `answer` (string), `conversationId` (string), `metadata` (query execution stats)
  - [ ] Interfaces at `apps/api/src/agents/conversational/interfaces/conversational.interface.ts`
  - [ ] Barrel export at `apps/api/src/agents/conversational/index.ts`
  - [ ] Tenant isolation enforced in validator, agent, and all MCP tool calls
  - [ ] Agent uses only read-only database operations (no create, update, delete)
  - [ ] Currency formatted as `R X,XXX.XX` in all user-facing responses
  - [ ] Tax questions redirect to SARS agent (not answered directly)
  - [ ] `ConversationalModule` imported in `apps/api/src/database/database.module.ts`
  - [ ] Unit tests for `ConversationalAgent` at `tests/agents/conversational/conversational.agent.spec.ts` (90%+ coverage)
  - [ ] Unit tests for `QueryValidator` at `tests/agents/conversational/query-validator.spec.ts` (90%+ coverage)
  - [ ] Tests cover: valid queries, blocked keywords, empty questions, missing tenantId, max length, tenant isolation, read-only enforcement
  - [ ] `pnpm run build` passes with no errors
  - [ ] `pnpm run lint` passes with no warnings
  - [ ] All existing agent tests continue to pass (no regressions)
</definition_of_done>

<anti_patterns>
  - **NEVER** allow cross-tenant data access -- every query must include tenantId
  - **NEVER** allow data modification through conversational queries -- this agent is strictly read-only
  - **NEVER** provide tax advice -- redirect tax calculation questions to the SARS agent section of the app
  - **NEVER** expose raw SQL, internal database IDs, or Prisma model details to the user
  - **NEVER** store conversation history in plain text without encryption (PII risk -- parent names, financial data)
  - **NEVER** use `npm` -- always use `pnpm`
  - **NEVER** use floats for monetary values internally -- all amounts are in cents (integers)
  - **NEVER** fabricate financial data -- if a query cannot be answered, say so rather than guessing
  - **NEVER** expose MCP tool names or internal agent architecture to the user
  - **NEVER** allow SQL injection through question text -- validate and sanitize all input
  - **NEVER** save test files or working files to the project root folder
  - **NEVER** bypass the AuthGuard on the conversational endpoint
  - **NEVER** return raw database query results -- always format for human readability
</anti_patterns>

</task_spec>
