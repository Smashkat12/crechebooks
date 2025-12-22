# Decision Log

## 2025-12-22: TASK-PAY-031 Payment Controller

### Decision: Prisma Enum Imports
- Used `import { MatchType, MatchedBy } from '@prisma/client'` directly in DTOs
- Prisma generates its own enum types that differ from entity definitions
- Avoids TS2322 type mismatch errors

### Decision: Prisma to Entity Enum Casting
- Used `filter.matchType = query.match_type as any` with eslint-disable comment
- Required because PaymentFilterDto expects entity enum types
- Repository layer handles Prisma compatibility internally

### Decision: Type-Only Import for Decorator Compatibility
- Used `import type { IUser }` in controller
- TypeScript `isolatedModules` + `emitDecoratorMetadata` requires type-only imports for decorator parameters
- Prevents "cannot be named" compilation errors

### Decision: Decimal/Cents Conversion Strategy
- API receives decimal amounts (e.g., 3450.00 for R3450)
- Service layer uses cents (integers) for precision
- Conversion: `Math.round(amount * 100)` for API → service
- Conversion: `amountCents / 100` for service → API

### Decision: Role-Based Access Control
- POST /payments: Restricted to OWNER, ADMIN (write operation)
- GET /payments: Extended to OWNER, ADMIN, VIEWER, ACCOUNTANT (read operation)
- Follows principle of least privilege

### Decision: PaymentModule Dependencies
- Imports PaymentRepository for listing
- Imports InvoiceRepository for enriching payment list with invoice details
- Imports PaymentAllocationService for allocation logic

---

## 2025-12-22: TASK-TRANS-031 Transaction Controller

### Decision: Type Import for Decorator Compatibility
- Used `import type { IUser }` instead of regular import
- TypeScript `isolatedModules` + `emitDecoratorMetadata` requires type-only imports for decorator parameters

### Decision: Prisma Decimal Conversion
- Used `Number(primary.confidenceScore)` for Prisma Decimal to number conversion
- Avoids Decimal type mismatch in DTO (TS2322)

### Decision: Enum Type Casting
- Used `primary.source as unknown as CategorizationSourceEnum` for Prisma enum compatibility
- Prisma generates separate enum types from entity definitions

### Decision: Reusable Pagination DTO
- Created PaginationMetaDto in src/shared/dto/ for reuse across all API endpoints
- Follows DRY principle for Surface Layer APIs

### Decision: Snake_case API Query Parameters
- Used snake_case for query params (date_from, is_reconciled) per REST conventions
- Internal DTO converts to camelCase (dateFrom, isReconciled) for repository

---

## 2025-12-21: TASK-TRANS-015 LLMWhisperer Integration

### Decision: Multi-line Parsing for LLMWhisperer Output
- LLMWhisperer outputs clean multi-line format (date, description, amount, balance, optional bank charges)
- Implemented state machine parsing to handle this format

### Decision: Bank Charges Handling
- FNB statements have optional "Accrued Bank Charges" after balance
- Updated regex pattern to `^[\d,]+\.\d{2}$` to capture varied amounts

### Decision: Hybrid Parser Confidence Threshold
- Local parser first with 70% confidence threshold
- LLMWhisperer fallback when <70% or <3 transactions extracted

### Decision: No Mock Tests for LLMWhisperer
- All tests use REAL FNB PDFs from /bank-statements/ folder
- Tests skip gracefully when API rate limited (HTTP 402)

---

## 2025-12-21: TASK-RECON-01* Implementation

### Decision: Test Cleanup Strategy
- Use afterEach with tenant-scoped deletes (not global deleteMany)

### Decision: Financial Report Data Sources
- Use paid invoices for school fees income + categorized transactions

### Decision: Chart of Accounts Structure
- Follow SA IFRS for SMEs (1xxx-8xxx ranges)
