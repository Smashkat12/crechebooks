# TenantGuard Implementation - SUPER_ADMIN vs Tenant User Separation

## Overview

This document describes the architectural solution for separating SUPER_ADMIN (platform administrators) from tenant users in the CrecheBooks API.

## Architecture Principle

- **SUPER_ADMIN users** have `null` tenantId and can ONLY access `/api/admin/*` endpoints
- **Regular users** (OWNER, ADMIN, ACCOUNTANT, VIEWER) MUST have a tenantId to access tenant endpoints
- Tenant controllers are now protected by TenantGuard which ensures tenantId exists

## Files Created

### 1. TenantGuard (`src/api/auth/guards/tenant.guard.ts`)

A global guard that:
- Checks if the user has a tenantId
- Blocks SUPER_ADMIN from accessing tenant endpoints
- Allows access if tenantId exists
- Skips check for public routes and admin endpoints

**Guard Order** (in `app.module.ts`):
1. ThrottlerGuard (rate limiting)
2. JwtAuthGuard (authentication)
3. **TenantGuard** (tenant context) ← NEW
4. RolesGuard (authorization)

### 2. Tenant Assertion Utilities (`src/api/auth/utils/tenant-assertions.ts`)

Helper functions for type-safe tenant assertions:

```typescript
// Assert that user has tenantId (throws if not)
assertTenantUser(user: IUser): asserts user is IUser & { tenantId: string }

// Type guard (returns boolean)
isTenantUser(user: IUser): user is IUser & { tenantId: string }

// Extract tenantId with validation
getTenantId(user: IUser): string

// Type alias for tenant users
type TenantUser = IUser & { tenantId: string }
```

## How to Fix Controllers

### Pattern 1: Using getTenantId (Recommended)

**Before:**
```typescript
@Get()
async getData(@CurrentUser() user: IUser) {
  if (!user.tenantId) {
    throw new Error('This operation requires a tenant. SUPER_ADMIN users cannot access tenant-specific data.');
  }
  // ERROR: tenantId is not defined!
  const result = await this.service.getData(tenantId);
}
```

**After:**
```typescript
import { getTenantId } from '../auth/utils/tenant-assertions';

@Get()
async getData(@CurrentUser() user: IUser) {
  // Extract and validate tenantId - TenantGuard ensures it exists
  const tenantId = getTenantId(user);

  const result = await this.service.getData(tenantId);
  return result;
}
```

### Pattern 2: Using assertTenantUser

```typescript
import { assertTenantUser } from '../auth/utils/tenant-assertions';

@Get()
async getData(@CurrentUser() user: IUser) {
  assertTenantUser(user);
  // user.tenantId is now typed as string (not string | null)
  return this.service.getData(user.tenantId);
}
```

### Pattern 3: Using TenantUser Type

```typescript
import { TenantUser } from '../auth/utils/tenant-assertions';

@Get()
async getData(@CurrentUser() user: TenantUser) {
  // user.tenantId is typed as string
  return this.service.getData(user.tenantId);
}
```

## Remaining Work

The following files still need manual fixes to add `const tenantId = getTenantId(user);` at the start of methods that use `tenantId`:

- ✅ `src/api/arrears/arrears.controller.ts` - Already has getTenantId imported
- ✅ `src/api/billing/child.controller.ts` - Partially fixed
- ⚠️ `src/api/billing/enrollment.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/integrations/simplepay.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/parents/parent.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/payment/payment.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/reconciliation/reconciliation.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/settings/fee-structure.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/staff/leave.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/staff/offboarding.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/staff/onboarding.controller.ts` - Needs tenantId declarations
- ⚠️ `src/api/staff/staff.controller.ts` - Needs tenantId declarations
- ⚠️ `src/websocket/dashboard.gateway.ts` - Needs tenantId declarations

## How to Identify Methods Needing Fixes

Run TypeScript check:
```bash
npx tsc --noEmit 2>&1 | grep "Cannot find name 'tenantId'"
```

Each error line number shows where `tenantId` is used. Add the declaration at the start of that method:

```typescript
const tenantId = getTenantId(user);
```

## Example Fix

**File:** `src/api/billing/enrollment.controller.ts:263`

**Error:** `Cannot find name 'tenantId'`

**Find the method:**
```typescript
async someMethod(@CurrentUser() user: IUser) {
  // tenantId used here but not declared!
  const enrollment = await this.repo.findById(id, tenantId);
}
```

**Fix:**
```typescript
async someMethod(@CurrentUser() user: IUser) {
  const tenantId = getTenantId(user);  // ← ADD THIS

  const enrollment = await this.repo.findById(id, tenantId);
}
```

## Testing

After fixes are complete:

1. **Type check:**
   ```bash
   npx tsc --noEmit
   ```
   Should show 0 tenantId errors.

2. **Build:**
   ```bash
   npm run build
   ```
   Should succeed.

3. **Runtime test:**
   - Test SUPER_ADMIN accessing tenant endpoint → Should get 403
   - Test regular user accessing tenant endpoint → Should work
   - Test admin accessing /api/admin/* → Should work

## Benefits

1. **Type Safety:** TypeScript knows tenantId is non-null after getTenantId()
2. **Fail-Fast:** Errors caught early in guard, not deep in business logic
3. **Consistency:** Single pattern across all tenant controllers
4. **Security:** Prevents SUPER_ADMIN from accidentally accessing tenant data
5. **Maintainability:** Clear separation of concerns

## Architecture Decision

This approach was chosen over:
- Making tenantId required in IUser (would break SUPER_ADMIN)
- Adding tenantId to JWT payload (would require token refresh on tenant switch)
- Using separate User types (would require extensive refactoring)

The guard + assertion pattern provides a good balance of:
- Type safety
- Security
- Minimal refactoring
- Clear intent

## Related Files

- `src/api/auth/guards/tenant.guard.ts` - Guard implementation
- `src/api/auth/utils/tenant-assertions.ts` - Helper functions
- `src/app.module.ts` - Guard registration
- `src/database/entities/user.entity.ts` - User interface with nullable tenantId
