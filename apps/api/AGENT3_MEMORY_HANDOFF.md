# AGENT 3 (API DEVELOPER) - MEMORY HANDOFF

## Mission Completed
Successfully implemented controller endpoints for ad-hoc charges on invoices.

## Files Created
1. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/dto/adhoc-charge-request.dto.ts`
   - API request DTO with snake_case fields (frontend convention)
   - Validation decorators for all fields
   - Swagger/OpenAPI documentation

2. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/dto/adhoc-charge-response.dto.ts`
   - API response DTOs with snake_case fields
   - Three response types: Add, List, Remove
   - Swagger/OpenAPI documentation

## Files Modified
1. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/dto/index.ts`
   - Added exports for new DTOs

2. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/invoice.controller.ts`
   - Added 3 new endpoints
   - Injected AdhocChargeService
   - Added imports for new decorators and DTOs

3. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/billing.module.ts`
   - Registered AdhocChargeService provider
   - Registered VatService provider (dependency)

4. `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/database/services/adhoc-charge.service.ts`
   - Fixed ForbiddenException calls (bug fix from Agent 2)
   - Removed invalid second parameter

## Endpoints Created

### 1. POST /invoices/:id/charges
- **Route**: `POST /invoices/:id/charges`
- **Auth**: Requires JWT, OWNER or ADMIN role
- **Request Body** (snake_case):
  ```typescript
  {
    description: string;
    amount_cents: number;
    quantity?: number;
    account_code?: string;
  }
  ```
- **Response** (snake_case):
  ```typescript
  {
    success: true,
    data: {
      line_id: string;
      invoice_id: string;
      description: string;
      amount_cents: number;
      quantity: number;
      vat_cents: number;
      total_cents: number;
      invoice_subtotal_cents: number;
      invoice_vat_cents: number;
      invoice_total_cents: number;
    }
  }
  ```
- **Status Codes**: 201 (success), 400 (invalid input/not DRAFT), 403 (forbidden), 404 (not found)

### 2. GET /invoices/:id/charges
- **Route**: `GET /invoices/:id/charges`
- **Auth**: Requires JWT (any authenticated user)
- **Response** (snake_case):
  ```typescript
  {
    success: true,
    data: {
      invoice_id: string;
      charges: Array<{
        line_id: string;
        description: string;
        quantity: number;
        unit_price_cents: number;
        subtotal_cents: number;
        vat_cents: number;
        total_cents: number;
        account_code: string | null;
      }>;
      total_charges: number;
      total_amount_cents: number;
    }
  }
  ```
- **Status Codes**: 200 (success), 403 (forbidden), 404 (not found)

### 3. DELETE /invoices/:id/charges/:lineId
- **Route**: `DELETE /invoices/:id/charges/:lineId`
- **Auth**: Requires JWT, OWNER or ADMIN role
- **Response**:
  ```typescript
  {
    success: true,
    message: 'Ad-hoc charge removed successfully'
  }
  ```
- **Status Codes**: 200 (success), 400 (invalid input/not DRAFT/not ad-hoc), 403 (forbidden), 404 (not found)

## Implementation Details

### Authentication & Authorization
- **tenantId extraction**: `req.user.tenantId` from JWT authentication
- **User object**: Available via `@CurrentUser()` decorator
- **Role checking**: `@Roles(UserRole.OWNER, UserRole.ADMIN)` with `@UseGuards(JwtAuthGuard, RolesGuard)`

### Case Convention Translation
- **API Layer**: snake_case (frontend convention)
- **Service Layer**: camelCase (TypeScript convention)
- **Translation**: Done in controller methods

Example mapping in `addAdhocCharge`:
```typescript
// Request: snake_case → camelCase
const result = await this.adhocChargeService.addCharge(
  user.tenantId,
  invoiceId,
  {
    description: dto.description,
    amountCents: dto.amount_cents,  // snake → camel
    quantity: dto.quantity,
    accountCode: dto.account_code,  // snake → camel
  },
);

// Response: camelCase → snake_case
return {
  success: true,
  data: {
    line_id: result.lineId,  // camel → snake
    invoice_id: result.invoiceId,  // camel → snake
    // ... etc
  },
};
```

### Error Handling
- **NotFoundException**: Invoice or line not found (404)
- **ForbiddenException**: Tenant mismatch (403)
- **ValidationException**: DRAFT status check, input validation (400)
- **Automatic NestJS exception filter**: Converts custom exceptions to HTTP responses

### Swagger/OpenAPI Documentation
- All endpoints have `@ApiOperation` descriptions
- All DTOs have `@ApiProperty` decorators
- Response types defined with `@ApiResponse`
- Error responses documented with specific HTTP codes

## Module Configuration
The BillingModule now includes:
- **AdhocChargeService**: Core business logic for ad-hoc charges
- **VatService**: VAT calculation (dependency of AdhocChargeService)

Both services are properly registered in the providers array.

## Testing Notes
The build completed successfully with no TypeScript errors.

## Bug Fixes
Fixed 3 TypeScript compilation errors in the service layer:
- `ForbiddenException` was called with 2 parameters (message + details object)
- Exception only accepts 1 parameter (message)
- Removed invalid second parameter in all 3 occurrences

## Next Steps for Integration Testing
1. Test POST /invoices/:id/charges with valid data
2. Verify VAT calculation for VAT_REGISTERED tenants
3. Test DRAFT status validation (should reject SENT/PAID invoices)
4. Test tenant isolation (should reject cross-tenant access)
5. Test GET /invoices/:id/charges listing
6. Test DELETE /invoices/:id/charges/:lineId removal
7. Verify invoice total recalculation after add/remove

## API Documentation
Swagger UI will automatically include these endpoints at `/api-docs` with:
- Request/response schemas
- Authentication requirements
- Error codes and descriptions
- Example payloads

---

**MEMORY_HANDOFF:**
- endpoints_created: [POST /invoices/:id/charges, GET /invoices/:id/charges, DELETE /invoices/:id/charges/:lineId]
- dto_files: [
    /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/dto/adhoc-charge-request.dto.ts,
    /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/billing/dto/adhoc-charge-response.dto.ts
  ]
- module_updated: true
- authentication: tenantId extracted from req.user (JWT @CurrentUser() decorator)
- authorization: OWNER/ADMIN for POST and DELETE, any authenticated user for GET
- build_status: SUCCESS (no compilation errors)
- bug_fixes: Fixed 3 ForbiddenException signature errors in service layer
