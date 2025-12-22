<technical_spec id="TECH-ARCH" version="1.0">

<metadata>
  <title>CrecheBooks System Architecture</title>
  <status>approved</status>
  <last_updated>2025-12-22</last_updated>
  <implements>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
    <spec_ref>SPEC-RECON</spec_ref>
    <spec_ref>SPEC-WEB</spec_ref>
  </implements>
</metadata>

<monorepo_structure>

## Directory Structure

```
crechebooks/
├── apps/
│   ├── api/                          # NestJS Backend API
│   │   ├── src/
│   │   │   ├── modules/              # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   ├── transactions/
│   │   │   │   ├── billing/
│   │   │   │   ├── payments/
│   │   │   │   ├── sars/
│   │   │   │   └── reconciliation/
│   │   │   ├── mcp/                  # MCP Server implementations
│   │   │   │   ├── xero-mcp/
│   │   │   │   ├── postgres-mcp/
│   │   │   │   └── email-mcp/
│   │   │   └── common/               # Shared utilities
│   │   ├── prisma/                   # Database schema
│   │   └── test/                     # API tests
│   │
│   └── web/                          # Next.js Frontend
│       ├── src/
│       │   ├── app/                  # App Router pages
│       │   │   ├── (auth)/           # Auth pages (login, register)
│       │   │   ├── (dashboard)/      # Protected dashboard pages
│       │   │   │   ├── dashboard/
│       │   │   │   ├── transactions/
│       │   │   │   ├── invoices/
│       │   │   │   ├── payments/
│       │   │   │   ├── sars/
│       │   │   │   ├── reconciliation/
│       │   │   │   ├── parents/
│       │   │   │   ├── staff/
│       │   │   │   ├── reports/
│       │   │   │   └── settings/
│       │   │   └── api/              # API routes
│       │   ├── components/           # React components
│       │   │   ├── ui/               # shadcn/ui base components
│       │   │   ├── forms/            # Form components
│       │   │   ├── layout/           # Layout components
│       │   │   ├── data-table/       # Table components
│       │   │   ├── charts/           # Chart components
│       │   │   ├── transactions/     # Transaction components
│       │   │   ├── invoices/         # Invoice components
│       │   │   ├── payments/         # Payment components
│       │   │   ├── sars/             # SARS components
│       │   │   ├── reconciliation/   # Reconciliation components
│       │   │   ├── parents/          # Parent/child components
│       │   │   ├── staff/            # Staff/payroll components
│       │   │   └── reports/          # Report components
│       │   ├── hooks/                # Custom React hooks
│       │   ├── lib/                  # Utilities and API client
│       │   ├── stores/               # Zustand state stores
│       │   └── styles/               # Global styles
│       └── public/                   # Static assets
│
└── packages/
    ├── types/                        # Shared TypeScript types
    │   └── src/
    │       ├── common.ts
    │       ├── transactions.ts
    │       ├── billing.ts
    │       ├── payments.ts
    │       ├── sars.ts
    │       └── reconciliation.ts
    └── shared/                       # Shared utilities (future)
```

</monorepo_structure>

<architecture_diagram>
```mermaid
C4Context
    title CrecheBooks System Context

    Person(owner, "Creche Owner", "Primary user managing bookkeeping")
    Person(admin, "Administrator", "Staff handling daily operations")
    Person(accountant, "Accountant", "External bookkeeper")

    System(crechebooks, "CrecheBooks", "AI-powered bookkeeping for SA creches")

    System_Ext(xero, "Xero", "Cloud accounting software")
    System_Ext(bank, "Bank Feeds", "FNB/Yodlee bank data")
    System_Ext(email, "Email Service", "Invoice/reminder delivery")
    System_Ext(whatsapp, "WhatsApp Business", "SA-preferred messaging")
    System_Ext(sars, "SARS eFiling", "Tax submission portal")

    Rel(owner, crechebooks, "Uses")
    Rel(admin, crechebooks, "Uses")
    Rel(accountant, crechebooks, "Reviews")

    Rel(crechebooks, xero, "Syncs transactions, invoices")
    Rel(crechebooks, bank, "Imports transactions")
    Rel(crechebooks, email, "Sends invoices/reminders")
    Rel(crechebooks, whatsapp, "Sends invoices/reminders")
    Rel(crechebooks, sars, "Exports returns for upload")
```
</architecture_diagram>

<container_diagram>
```mermaid
C4Container
    title CrecheBooks Container Diagram

    Person(user, "User", "Creche owner/admin")

    Container_Boundary(cb, "CrecheBooks") {
        Container(web, "Web Application", "Next.js", "Responsive web UI")
        Container(api, "API Server", "NestJS", "REST API, business logic")
        Container(claude, "Claude Code Orchestrator", "Claude Code CLI", "AI agent coordination")
        Container(queue, "Job Queue", "Bull/Redis", "Background processing")
        ContainerDb(db, "Database", "PostgreSQL", "Primary data store")
        ContainerDb(cache, "Cache", "Redis", "Sessions, rate limits")
    }

    Container_Boundary(mcp, "MCP Servers") {
        Container(xero_mcp, "Xero MCP", "Node.js", "Xero API wrapper")
        Container(pg_mcp, "Postgres MCP", "Node.js", "Direct DB access for agents")
        Container(email_mcp, "Email MCP", "Node.js", "Email/WhatsApp delivery")
    }

    System_Ext(xero, "Xero API", "Accounting")
    System_Ext(smtp, "SMTP", "Email delivery")
    System_Ext(wa, "WhatsApp API", "Messaging")

    Rel(user, web, "Uses", "HTTPS")
    Rel(web, api, "Calls", "HTTPS/REST")
    Rel(api, claude, "Invokes", "Task tool")
    Rel(api, queue, "Enqueues", "Redis")
    Rel(api, db, "Reads/Writes", "Prisma")
    Rel(api, cache, "Caches", "Redis protocol")

    Rel(claude, xero_mcp, "Uses", "MCP")
    Rel(claude, pg_mcp, "Uses", "MCP")
    Rel(claude, email_mcp, "Uses", "MCP")

    Rel(xero_mcp, xero, "Calls", "OAuth2/REST")
    Rel(email_mcp, smtp, "Sends", "SMTP")
    Rel(email_mcp, wa, "Sends", "API")
```
</container_diagram>

<component_diagram>
```mermaid
C4Component
    title API Server Components

    Container_Boundary(api, "API Server") {
        Component(auth, "Auth Module", "NestJS Module", "OAuth2/JWT authentication")
        Component(trans, "Transaction Module", "NestJS Module", "Transaction import, categorization")
        Component(bill, "Billing Module", "NestJS Module", "Invoice generation, delivery")
        Component(pay, "Payment Module", "NestJS Module", "Payment matching, arrears")
        Component(sars, "SARS Module", "NestJS Module", "Tax calculations, returns")
        Component(recon, "Reconciliation Module", "NestJS Module", "Bank reconciliation, reports")
        Component(agent, "Agent Service", "NestJS Service", "Claude Code task invocation")
    }

    ContainerDb(db, "PostgreSQL", "Database")
    Container(claude, "Claude Code", "AI Orchestrator")

    Rel(trans, agent, "Uses")
    Rel(bill, agent, "Uses")
    Rel(pay, agent, "Uses")
    Rel(sars, agent, "Uses")
    Rel(recon, agent, "Uses")

    Rel(agent, claude, "Invokes tasks")

    Rel(trans, db, "CRUD")
    Rel(bill, db, "CRUD")
    Rel(pay, db, "CRUD")
    Rel(sars, db, "CRUD")
    Rel(recon, db, "CRUD")
```
</component_diagram>

<web_component_diagram>
```mermaid
C4Component
    title Web Application Components (apps/web)

    Container_Boundary(web, "Next.js Web Application") {
        Component(pages, "App Router Pages", "React Server Components", "Dashboard, transactions, invoices, etc.")
        Component(layout, "Layout Components", "React", "Dashboard layout, navigation, header")
        Component(ui, "UI Components", "shadcn/ui", "Button, Card, Dialog, Form, Table")
        Component(domain, "Domain Components", "React", "Transaction list, invoice forms, payment matcher")
        Component(hooks, "Custom Hooks", "React Hooks", "useTransactions, useInvoices, useAuth")
        Component(stores, "State Stores", "Zustand", "UI state, filters, selections")
        Component(api_client, "API Client", "axios + React Query", "Type-safe API calls with caching")
        Component(providers, "Providers", "React Context", "Auth, theme, query client")
    }

    Container(api, "API Server", "NestJS", "Backend API")
    Container(auth, "NextAuth.js", "Auth.js v5", "Authentication")
    System_Ext(xero_redirect, "Xero OAuth", "OAuth2 flow")

    Rel(pages, layout, "Uses")
    Rel(pages, domain, "Uses")
    Rel(domain, ui, "Uses")
    Rel(domain, hooks, "Uses")
    Rel(hooks, api_client, "Uses")
    Rel(hooks, stores, "Updates")
    Rel(api_client, api, "HTTPS/REST")
    Rel(providers, auth, "Session")
    Rel(auth, xero_redirect, "OAuth2")
```

### Web Application Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 15 | App Router, Server Components, API Routes |
| UI Library | shadcn/ui | Accessible, customizable components |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| State Management | Zustand | Client-side UI state |
| Server State | TanStack Query | Caching, refetching, mutations |
| Forms | React Hook Form + Zod | Validation, type-safe forms |
| Tables | TanStack Table | Sorting, filtering, pagination |
| Charts | Recharts | Financial visualizations |
| Authentication | NextAuth.js v5 | OAuth, sessions |
| API Client | axios | HTTP client with interceptors |

### Key Frontend Patterns

```typescript
// apps/web/src/lib/api/client.ts - Type-safe API client
import axios from 'axios';
import type { ITransaction, IPaginatedResponse } from '@crechebooks/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

export const transactionsApi = {
  list: (params: TransactionFilters) =>
    api.get<IPaginatedResponse<ITransaction>>('/transactions', { params }),
  categorize: (id: string, accountCode: string) =>
    api.patch<ITransaction>(`/transactions/${id}/categorize`, { accountCode }),
};
```

```typescript
// apps/web/src/hooks/use-transactions.ts - React Query hook
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi } from '@/lib/api/client';

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsApi.list(filters),
    staleTime: 30_000, // 30 seconds
  });
}

export function useCategorizeTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountCode }: { id: string; accountCode: string }) =>
      transactionsApi.categorize(id, accountCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
```

</web_component_diagram>

<claude_code_architecture>

## Claude Code Multi-Agent Design

### Orchestrator Pattern

```mermaid
sequenceDiagram
    participant API as NestJS API
    participant ORCH as Orchestrator (Main Session)
    participant CAT as Categorizer Agent
    participant XERO as Xero MCP
    participant DB as Database

    API->>ORCH: Process new transactions
    ORCH->>DB: Load context (patterns, CoA)
    ORCH->>CAT: Task: Categorize batch
    CAT->>XERO: Get Chart of Accounts
    XERO-->>CAT: Account list
    CAT->>CAT: Analyze transactions
    CAT-->>ORCH: Categorization results
    ORCH->>XERO: Update transactions
    ORCH->>DB: Store audit trail
    ORCH-->>API: Processing complete
```

### Agent Definitions

```yaml
Orchestrator:
  type: main_session
  role: Workflow coordination and task distribution
  tools:
    - Task (spawn subagents)
    - Read (context files)
    - AskUserQuestion (escalations)
  context_files:
    - .claude/context/tenant_config.json
    - .claude/logs/decisions.jsonl

Transaction_Categorizer:
  type: task_subagent
  subagent_type: general-purpose
  role: Categorize bank transactions
  tools:
    - Read (patterns, CoA)
    - mcp__xero__get_accounts
    - mcp__xero__update_transaction
  constraints:
    - Cannot modify data directly
    - Must log all decisions
    - Escalate if confidence < 80%

Billing_Agent:
  type: task_subagent
  subagent_type: general-purpose
  role: Generate monthly invoices
  tools:
    - Read (enrollment, fees)
    - mcp__xero__create_invoice
    - mcp__xero__get_contacts
  constraints:
    - Create as DRAFT only
    - Require owner approval before send

Payment_Matcher:
  type: task_subagent
  subagent_type: general-purpose
  role: Match payments to invoices
  tools:
    - Read (invoices, payments)
    - mcp__xero__apply_payment
  constraints:
    - Auto-apply exact matches only
    - Escalate ambiguous matches

SARS_Agent:
  type: task_subagent
  subagent_type: general-purpose
  role: Calculate tax submissions
  tools:
    - Read (transactions, payroll, tax tables)
    - mcp__postgres__query
  constraints:
    - ALWAYS require human review
    - Cannot submit directly
    - Flag any uncertainties
```

### MCP Server Configuration

```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["./apps/api/src/mcp/xero-mcp/server.js"],
      "env": {
        "XERO_CLIENT_ID": "${XERO_CLIENT_ID}",
        "XERO_CLIENT_SECRET": "${XERO_CLIENT_SECRET}",
        "XERO_TENANT_ID": "${XERO_TENANT_ID}"
      },
      "tools": [
        "get_accounts",
        "get_transactions",
        "update_transaction",
        "create_invoice",
        "get_invoices",
        "apply_payment",
        "get_contacts",
        "create_contact"
      ]
    },
    "postgres": {
      "command": "node",
      "args": ["./apps/api/src/mcp/postgres-mcp/server.js"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      },
      "tools": [
        "query",
        "get_tenant_context"
      ]
    },
    "email": {
      "command": "node",
      "args": ["./apps/api/src/mcp/email-mcp/server.js"],
      "env": {
        "SMTP_HOST": "${SMTP_HOST}",
        "SMTP_USER": "${SMTP_USER}",
        "SMTP_PASS": "${SMTP_PASS}",
        "WHATSAPP_TOKEN": "${WHATSAPP_TOKEN}"
      },
      "tools": [
        "send_email",
        "send_whatsapp",
        "check_delivery_status"
      ]
    }
  }
}
```

</claude_code_architecture>

<security_architecture>

## Authentication & Authorization

```mermaid
sequenceDiagram
    participant User
    participant Web as Web App
    participant Auth as Auth0
    participant API as CrecheBooks API
    participant DB as Database

    User->>Web: Access app
    Web->>Auth: Redirect to login
    Auth->>User: Show login form
    User->>Auth: Enter credentials
    Auth->>Auth: Validate + MFA
    Auth->>Web: Return tokens (id, access, refresh)
    Web->>API: Request with access token
    API->>API: Validate JWT signature
    API->>API: Extract tenant from token
    API->>DB: Query with tenant filter
    DB-->>API: Tenant-scoped data
    API-->>Web: Response
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| Owner | Full access; manage users; approve invoices; submit SARS |
| Admin | Manage transactions; generate invoices; view reports |
| Viewer | Read-only access to dashboards and reports |
| Accountant | Full financial access; no user management |

### Multi-Tenant Isolation

```sql
-- Row-Level Security Policy
CREATE POLICY tenant_isolation ON transactions
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- All tables have tenant_id column
-- API sets tenant context from JWT claims
SET app.tenant_id = '${tenant_id_from_jwt}';
```

</security_architecture>

<deployment_architecture>

## Infrastructure

```mermaid
graph TB
    subgraph "Cloud Provider (AWS/GCP/Azure)"
        subgraph "Application Tier"
            LB[Load Balancer]
            API1[API Instance 1]
            API2[API Instance 2]
            WEB1[Web Instance 1]
            WEB2[Web Instance 2]
        end

        subgraph "Worker Tier"
            WORKER1[Queue Worker 1]
            WORKER2[Queue Worker 2]
            CLAUDE[Claude Code Runner]
        end

        subgraph "Data Tier"
            RDS[(PostgreSQL RDS)]
            REDIS[(Redis ElastiCache)]
            S3[S3 Bucket - Files]
        end
    end

    subgraph "External"
        CDN[CloudFront CDN]
        DNS[Route 53]
    end

    DNS --> CDN
    CDN --> LB
    LB --> API1
    LB --> API2
    LB --> WEB1
    LB --> WEB2

    API1 --> RDS
    API2 --> RDS
    API1 --> REDIS
    API2 --> REDIS

    WORKER1 --> REDIS
    WORKER2 --> REDIS
    WORKER1 --> RDS
    WORKER2 --> RDS

    CLAUDE --> API1
```

### Environment Configuration

```yaml
# Production
API_REPLICAS: 2
WORKER_REPLICAS: 2
DB_SIZE: db.r6g.large
REDIS_SIZE: cache.r6g.large

# Staging
API_REPLICAS: 1
WORKER_REPLICAS: 1
DB_SIZE: db.t3.medium
REDIS_SIZE: cache.t3.micro

# Development
API_REPLICAS: 1
WORKER_REPLICAS: 1
DB_SIZE: local
REDIS_SIZE: local
```

</deployment_architecture>

<integration_patterns>

## Xero Integration Flow

```mermaid
sequenceDiagram
    participant CB as CrecheBooks
    participant MCP as Xero MCP
    participant XERO as Xero API
    participant TOKEN as Token Store

    Note over CB,TOKEN: Initial OAuth Connection
    CB->>XERO: Redirect to authorize
    XERO->>CB: Authorization code
    CB->>XERO: Exchange for tokens
    XERO->>CB: Access + Refresh tokens
    CB->>TOKEN: Store encrypted tokens

    Note over CB,TOKEN: API Calls
    CB->>MCP: mcp__xero__get_accounts
    MCP->>TOKEN: Get access token
    TOKEN-->>MCP: Token (check expiry)
    alt Token expired
        MCP->>XERO: Refresh token
        XERO-->>MCP: New tokens
        MCP->>TOKEN: Update tokens
    end
    MCP->>XERO: GET /Accounts
    XERO-->>MCP: Account list
    MCP-->>CB: Formatted response
```

## Bank Feed Processing

```mermaid
sequenceDiagram
    participant FEED as Bank Feed/CSV
    participant QUEUE as Job Queue
    participant WORKER as Worker
    participant CAT as Categorizer Agent
    participant DB as Database
    participant XERO as Xero MCP

    FEED->>QUEUE: New transactions available
    QUEUE->>WORKER: Process import job
    WORKER->>DB: Parse and store raw transactions
    WORKER->>QUEUE: Enqueue categorization jobs

    loop For each transaction batch
        QUEUE->>WORKER: Categorization job
        WORKER->>CAT: Task: Categorize transactions
        CAT->>DB: Load patterns and CoA
        CAT->>CAT: AI categorization
        CAT-->>WORKER: Results with confidence
        alt High confidence (>=80%)
            WORKER->>XERO: Update category
            WORKER->>DB: Mark as categorized
        else Low confidence (<80%)
            WORKER->>DB: Mark for review
            WORKER->>QUEUE: Enqueue notification
        end
    end
```

</integration_patterns>

<implementation_notes>

<note category="performance">
**Transaction Processing**
- Batch transactions in groups of 50 for categorization
- Use database indexes on (tenant_id, date, status)
- Cache Chart of Accounts per tenant (5 min TTL)
- Queue heavy operations (invoice generation, SARS calculations)
</note>

<note category="security">
**Token Management**
- Xero tokens stored in secrets manager (AWS Secrets Manager / HashiCorp Vault)
- Never log access tokens
- Rotate refresh tokens on each use
- Implement token revocation on user disconnect
</note>

<note category="resilience">
**External API Handling**
- Implement circuit breaker for Xero API (5 failures = open, 30s recovery)
- Queue failed operations for retry (exponential backoff: 1m, 5m, 15m, 1h, 6h)
- Alert after 24h of failed syncs
- Graceful degradation: read from local cache when Xero unavailable
</note>

<note category="claude_code">
**Claude Code Best Practices**
- Keep context files under 100KB each
- Use JSON for structured data (patterns, configs)
- Log all agent decisions to decisions.jsonl
- Implement session persistence for multi-step workflows
- Set appropriate autonomy levels per operation
</note>

<note category="compliance">
**Audit Trail Requirements**
- All financial data changes logged immutably
- Include: timestamp, user_id, tenant_id, action, before_value, after_value
- Retain logs for 5+ years per SARS requirements
- Use append-only table or event sourcing pattern
</note>

</implementation_notes>

</technical_spec>
