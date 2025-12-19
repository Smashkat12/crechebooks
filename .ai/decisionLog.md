# Decision Log

## Purpose
Immutable record of architectural and design decisions. Prevents re-litigating settled debates.

---

## DEC-001: AI Orchestration Layer
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use Claude Code CLI as AI orchestration layer instead of direct Claude API

**Context**: Needed to choose implementation approach for AI agent capabilities

**Options Considered**:
- Direct Claude API calls: More control, per-token billing
- Claude Code CLI: Subscription model, built-in tools, session management

**Rationale**:
- Claude Code provides 60-80% cost savings through subscription pricing
- Built-in tools (Read, Write, Bash, Task) eliminate custom implementation
- Native MCP support for Xero integration
- AskUserQuestion tool provides human-in-the-loop capability
- Automatic context management and summarization

**Consequences**:
- Dependency on Claude Code subscription availability
- Must design agents as Task tool subagents
- Need to structure context files for agent consumption

---

## DEC-002: Backend Framework
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use NestJS with TypeScript

**Context**: Needed to select backend framework for API server

**Options Considered**:
- Express.js: Lightweight, flexible
- NestJS: Opinionated, TypeScript-first, enterprise features
- Fastify: Performance-focused

**Rationale**:
- TypeScript provides type safety critical for financial calculations
- NestJS module system aligns with domain-driven design
- Built-in dependency injection simplifies testing
- Strong ecosystem for validation, authentication, queues
- Similar patterns to Angular (common in enterprise)

**Consequences**:
- Steeper learning curve for Express developers
- More boilerplate code
- Strong conventions enforce consistency

---

## DEC-003: Database and ORM
**Date**: 2025-12-19
**Status**: Final
**Decision**: PostgreSQL with Prisma ORM

**Context**: Needed relational database with good TypeScript support

**Options Considered**:
- PostgreSQL + TypeORM: Mature, decorator-based
- PostgreSQL + Prisma: Type-safe, schema-first
- MongoDB + Mongoose: Document-based

**Rationale**:
- PostgreSQL: Proven for financial systems, ACID compliance, row-level security
- Prisma: Best-in-class TypeScript integration, auto-generated types, excellent migrations
- Schema-first approach catches errors at compile time
- Prisma Studio useful for debugging

**Consequences**:
- Prisma has some limitations with complex queries
- Must use Prisma client patterns (not raw SQL)
- Migration workflow tied to Prisma

---

## DEC-004: Financial Calculation Precision
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use Decimal.js with banker's rounding, store amounts as integer cents

**Context**: JavaScript Number type cannot accurately represent currency

**Options Considered**:
- JavaScript Number: Native, imprecise
- Decimal.js: Arbitrary precision, configurable rounding
- currency.js: Purpose-built for currency
- Store as string: Requires parsing everywhere

**Rationale**:
- Decimal.js provides arbitrary precision for any calculation
- Banker's rounding (ROUND_HALF_EVEN) is financial standard
- Storing as cents (integer) eliminates floating-point database issues
- Consistent with Xero and banking systems

**Consequences**:
- Must convert to/from cents at boundaries
- All developers must use Money utility class
- Cannot use native arithmetic operators

**Implementation**:
```typescript
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });
// 2.5 rounds to 2, 3.5 rounds to 4 (towards even)
```

---

## DEC-005: Multi-Tenant Architecture
**Date**: 2025-12-19
**Status**: Final
**Decision**: Single database with row-level security and tenant_id column

**Context**: Need to support multiple creches in single deployment

**Options Considered**:
- Database per tenant: Complete isolation, complex management
- Schema per tenant: Good isolation, migration complexity
- Row-level security: Shared database, query-based isolation

**Rationale**:
- Row-level security is sufficient for tenant count (1000 target)
- Simpler deployment and maintenance
- PostgreSQL RLS is robust and well-tested
- Easier to query across tenants for analytics (if needed later)
- All existing Prisma knowledge applies

**Consequences**:
- Must never forget tenant_id in queries (repository pattern enforces)
- Performance depends on proper indexing
- Cannot easily give tenant their own backup

**Implementation**:
```sql
CREATE POLICY tenant_isolation ON transactions
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## DEC-006: Agent Autonomy Levels
**Date**: 2025-12-19
**Status**: Final
**Decision**: Variable autonomy per function (L2-L4)

**Context**: Need to balance automation with accuracy for financial operations

**Options Considered**:
- Full automation (L5): Fast but risky
- Full human approval (L1): Safe but slow
- Variable per function: Balanced

**Rationale**:
- Financial operations require different trust levels
- High-confidence categorization can be automated (L4)
- SARS submissions always need human review (L2)
- Payment matching depends on confidence score

**Autonomy Assignments**:
| Function | Level | Reasoning |
|----------|-------|-----------|
| Transaction categorization (high confidence) | L4 | Reversible, auditable |
| Transaction categorization (low confidence) | L2 | Needs human judgment |
| Invoice generation | L3 | Creates drafts for review |
| Payment matching (exact) | L4 | Clear matches, reversible |
| Payment matching (ambiguous) | L2 | Financial accuracy critical |
| SARS calculations | L2 | Regulatory risk |
| Bank reconciliation | L4 | Auto-reconcile clear items |

---

## DEC-007: South African Localization
**Date**: 2025-12-19
**Status**: Final
**Decision**: Build SA-specific features as first-class citizens

**Context**: System designed for South African market with specific requirements

**Key SA-Specific Decisions**:
- Currency: ZAR only (no multi-currency in Phase 1)
- Timezone: Africa/Johannesburg (SAST, UTC+2)
- VAT Rate: 15% (configurable for future changes)
- Tax Tables: SARS 2025 tables with annual update process
- Banking: FNB format priority, Yodlee for others
- Messaging: WhatsApp Business API integration (SA preferred channel)
- Compliance: POPIA data protection, 5-year retention

**Consequences**:
- Simpler initial implementation (no i18n complexity)
- Must update tax tables annually
- Limited initial market (SA only)

---

## DEC-008: Xero Integration Approach
**Date**: 2025-12-19
**Status**: Final
**Decision**: Xero as source of truth via MCP server

**Context**: Need to integrate with existing accounting system

**Options Considered**:
- CrecheBooks as master, Xero as sync target
- Xero as master, CrecheBooks as UI layer
- Bidirectional sync with conflict resolution

**Rationale**:
- Xero is established, trusted accounting system
- Creche owners may already use Xero
- Bidirectional sync with Xero as master for Chart of Accounts
- CrecheBooks adds AI layer without replacing Xero
- MCP server provides clean abstraction

**Implementation**:
- Chart of Accounts: Sync from Xero
- Transactions: Import to Xero after categorization
- Invoices: Create in Xero as DRAFT
- Payments: Apply in Xero
- Contacts: Bidirectional sync

---

## DEC-009: Task Decomposition Strategy
**Date**: 2025-12-19
**Status**: Final
**Decision**: Inside-Out, Bottom-Up layer slicing

**Context**: Need to generate atomic tasks that AI agents can execute sequentially

**Strategy**:
1. Foundation Layer (entities, types, migrations) - No dependencies
2. Logic Layer (services, business rules) - Depends on Foundation
3. Agent Layer (Claude Code agents) - Depends on Logic
4. Surface Layer (controllers, APIs) - Depends on Logic + Agents
5. Integration Layer (E2E tests) - Depends on all

**Rationale**:
- Task N cannot reference files from Task N+1
- Each task is single conceptual change
- Tests included with implementation (not separate tasks)
- Clear dependency graph enables parallel execution where possible

**Consequences**:
- 62 tasks total (more granular than "build feature")
- Strict execution order required
- Traceability matrix ensures 100% coverage

---

## Change Log

| Date | Decision | Author |
|------|----------|--------|
| 2025-12-19 | Initial decision log created | AI Agent |
| 2025-12-19 | DEC-001 through DEC-009 documented | AI Agent |
