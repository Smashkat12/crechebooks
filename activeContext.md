# Active Context

## Last Updated
2025-12-19 by AI Agent (Specification Generation)

## Current Focus
CrecheBooks AI Bookkeeping System - Specification Phase Complete, Ready for Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Specification Complete
**Status**: Ready for Task Execution
**Next**: TASK-CORE-001 (Project Setup and Base Configuration)

## Recent Decisions
- [2025-12-19] Selected NestJS + TypeScript as primary backend framework
- [2025-12-19] Chose Prisma as ORM for PostgreSQL
- [2025-12-19] Designed multi-agent architecture using Claude Code Task tool
- [2025-12-19] Decided on subscription-based Claude Code over direct API for cost savings
- [2025-12-19] Selected MCP servers for Xero, PostgreSQL, and Email integrations
- [2025-12-19] Implemented banker's rounding (half-even) for all financial calculations
- [2025-12-19] Chose row-level security for multi-tenant isolation

## Specifications Completed
1. **Constitution** - Immutable project rules and standards
2. **PRD Analysis** - Decomposition of requirements
3. **Functional Specs** - 5 domain specifications:
   - Transaction Categorization (SPEC-TRANS)
   - Fee Billing (SPEC-BILL)
   - Payment Matching (SPEC-PAY)
   - SARS Compliance (SPEC-SARS)
   - Reconciliation (SPEC-RECON)
4. **Technical Specs** - Architecture, Data Models, API Contracts
5. **Task Specs** - 62 atomic tasks with dependency graph
6. **Traceability Matrix** - 100% requirement coverage verified

## Current Blockers
- [ ] None - specifications complete

## Open Questions for Stakeholders
1. Which banks beyond FNB need support in MVP?
2. Has the business been approved for WhatsApp Business API access?
3. Which payroll systems need priority integration?
4. What percentage of target creches are VAT registered?

## Next Steps
1. Begin TASK-CORE-001: Project Setup and Base Configuration
2. Execute tasks in strict dependency order per specs/tasks/_index.md
3. Complete Phase 1 (Foundation Layer) before Phase 2 (Logic Layer)

## Key File Locations
- Constitution: `/specs/constitution.md`
- Functional Specs: `/specs/functional/`
- Technical Specs: `/specs/technical/`
- Task Specs: `/specs/tasks/`
- Task Index: `/specs/tasks/_index.md`
- Traceability: `/specs/tasks/_traceability.md`

## Session Notes
Initial specification generation complete. All 5 functional domains covered with:
- User stories with acceptance criteria
- Requirements with traceability
- Edge cases and error states
- Test plans

Technical specifications include:
- Full system architecture with Claude Code agents
- Complete data model (17 entities)
- API contracts for all endpoints
- Component contracts for all services

Task specifications follow inside-out, bottom-up approach:
- Foundation layer: 15 tasks (entities, migrations)
- Logic layer: 21 tasks (services, business logic)
- Agent layer: 5 tasks (Claude Code agents)
- Surface layer: 16 tasks (API controllers)
- Integration layer: 5 tasks (E2E tests)

Total: 62 tasks in strict dependency order.
