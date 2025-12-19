# Active Context

## Last Updated
2025-12-20 by AI Agent (TASK-CORE-001 Completed)

## Current Focus
CrecheBooks AI Bookkeeping System - Foundation Layer Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Foundation Layer (Phase 1)
**Completed**: TASK-CORE-001 (Project Setup)
**Next**: TASK-CORE-002 (Tenant Entity and Migration)

## GitHub Repository
https://github.com/Smashkat12/crechebooks

---

## TASK-CORE-001 Summary (COMPLETED)

### What Was Built
- NestJS 11 project with TypeScript strict mode
- Prisma 7 ORM with PostgreSQL configuration
- ConfigModule with fail-fast environment validation
- Money utility class (Decimal.js with banker's rounding)
- Date utility (Africa/Johannesburg timezone)
- Base exception classes
- Health endpoint at GET /health
- 63 passing tests (62 unit + 1 e2e)

### Key Files Created
```
src/
├── app.module.ts              # Root module
├── main.ts                    # Bootstrap with fail-fast
├── config/                    # Environment configuration
├── health/                    # Health check endpoint
└── shared/
    ├── constants/             # VAT_RATE, TIMEZONE, etc.
    ├── exceptions/            # AppException, ValidationException, etc.
    ├── interfaces/            # IBaseEntity, IMoney, etc.
    └── utils/                 # Money, DateUtil classes
prisma/
└── schema.prisma              # Base schema (NO MODELS YET)
prisma.config.ts               # Prisma 7 datasource configuration
```

### Technical Configuration
- **Package Manager**: pnpm (NOT npm)
- **NestJS**: 11.x
- **Prisma**: 7.x (breaking change: uses prisma.config.ts)
- **Node.js**: 20.x required

---

## TASK-CORE-002 Requirements (NEXT)

### Purpose
Create the Tenant entity - the FIRST database model. All other entities will reference tenant_id for multi-tenancy.

### Key Deliverables
1. PrismaModule and PrismaService (database connection)
2. Tenant model in Prisma schema with enums
3. Database migration for tenants table
4. TypeScript interface ITenant
5. CreateTenantDto and UpdateTenantDto
6. TenantRepository with CRUD operations
7. Integration tests with REAL database

### Critical Requirements
- NO mock data in tests
- Fail fast with robust error logging
- NO workarounds or fallbacks
- All fields must match specs/technical/data-models.md

### Files to Create
- `src/database/prisma/prisma.service.ts`
- `src/database/prisma/prisma.module.ts`
- `src/database/entities/tenant.entity.ts`
- `src/database/dto/tenant.dto.ts`
- `src/database/repositories/tenant.repository.ts`
- `tests/database/repositories/tenant.repository.spec.ts`

---

## Recent Decisions
| Date | Decision | Impact |
|------|----------|--------|
| 2025-12-20 | Prisma 7 uses prisma.config.ts | URL NOT in schema.prisma |
| 2025-12-20 | pnpm as package manager | Use `pnpm run`, not `npm run` |
| 2025-12-20 | No mock data in tests | Tests require real DATABASE_URL |
| 2025-12-20 | Fail fast philosophy | Errors logged fully, then re-thrown |

---

## Key File Locations
- Constitution: `specs/constitution.md`
- Data Models: `specs/technical/data-models.md`
- Task Index: `specs/tasks/_index.md`
- Task Spec: `specs/tasks/TASK-CORE-002.md`
- Progress: `.ai/progress.md`
- Decisions: `.ai/decisionLog.md`

---

## Verification Commands
```bash
pnpm run build    # Must compile without errors
pnpm run lint     # Must pass with 0 warnings
pnpm run test     # All tests must pass
pnpm run test:e2e # E2E tests must pass
```

---

## Current Blockers
- [ ] PostgreSQL database must be running for TASK-CORE-002
- [ ] DATABASE_URL must be set in .env

---

## Session Notes
TASK-CORE-001 completed successfully. Project pushed to GitHub.
TASK-CORE-002.md updated with comprehensive context for AI agent execution.
Ready to proceed with Tenant entity implementation.
