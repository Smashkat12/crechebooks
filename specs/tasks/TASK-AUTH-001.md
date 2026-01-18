<task_spec id="TASK-AUTH-001" version="2.0">

<metadata>
  <title>Add Role Enforcement to Tenant Controller</title>
  <status>ready</status>
  <layer>api</layer>
  <sequence>183</sequence>
  <implements>
    <requirement_ref>REQ-AUTH-RBAC-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **File to Modify:**
  - `apps/api/src/api/settings/tenant.controller.ts`

  **Current Problem:**
  The TenantController has a TODO comment indicating that role-based access control (RBAC) is not enforced on the `updateTenant` endpoint. Currently, any authenticated user can update their tenant's settings.

  **Existing Code (line 133-134):**
  ```typescript
  // For now, allow any authenticated user to update their tenant
  // In production, you might want to check for OWNER/ADMIN role
  ```

  **Required Fix:**
  Add `@Roles(UserRole.OWNER, UserRole.ADMIN)` decorator to restrict tenant updates to owners and admins only.

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Roles Decorator Pattern (from existing codebase)
  ```typescript
  import { Roles } from '../auth/decorators/roles.decorator';
  import { UserRole } from '@prisma/client';

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)  // ADD THIS
  @ApiOperation({ summary: 'Update tenant' })
  @ApiForbiddenResponse({
    description: 'User does not belong to this tenant or lacks permission',
  })
  async updateTenant(
    @CurrentUser() user: IUser,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<SerializedTenant> {
    // Verify user belongs to this tenant (tenant isolation check)
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    // Role check is now handled by @Roles decorator and RolesGuard
    this.logger.debug(`Updating tenant ${tenantId}: ${JSON.stringify(dto)}`);
    const tenant = await this.tenantRepository.update(tenantId, dto);
    return serializeTenant(tenant);
  }
  ```

  ### 3. Existing Roles Guard
  The project already has a RolesGuard configured globally that processes the @Roles decorator.
  Location: `apps/api/src/api/auth/guards/roles.guard.ts`

  ### 4. UserRole Enum
  ```typescript
  // From @prisma/client
  enum UserRole {
    OWNER = 'OWNER',
    ADMIN = 'ADMIN',
    ACCOUNTANT = 'ACCOUNTANT',
    VIEWER = 'VIEWER',
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task adds proper role-based access control to the TenantController's update endpoint. Currently, the endpoint allows any authenticated user to update tenant settings. This should be restricted to OWNER and ADMIN roles only.

**Security Concern:**
Without proper RBAC, a user with VIEWER role could potentially modify organization settings like:
- Organization name
- Tax numbers
- Banking details
- Contact information

**Solution:**
Use the existing @Roles decorator and RolesGuard infrastructure to enforce access control.
</context>

<scope>
  <in_scope>
    - Add @Roles decorator to updateTenant endpoint
    - Remove TODO comment about role checking
    - Update API documentation to reflect role requirements
    - Add/update tests for role enforcement
    - Verify RolesGuard is properly configured in module
  </in_scope>
  <out_of_scope>
    - Creating new roles or permissions
    - Modifying RolesGuard implementation
    - Adding role management endpoints
    - UI changes for role display
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Update controller file
# Edit apps/api/src/api/settings/tenant.controller.ts

# 2. Add/update tests
# Edit apps/api/tests/api/settings/tenant.controller.spec.ts

# 3. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing

# 4. Run specific tests
pnpm test -- tenant.controller --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Only OWNER and ADMIN roles can update tenant settings
    - ACCOUNTANT role cannot update tenant settings
    - VIEWER role cannot update tenant settings
    - Tenant isolation check must remain (user.tenantId === tenantId)
    - @Roles decorator must be imported from correct location
    - Must not break existing tests
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: OWNER can update tenant
    - Test: ADMIN can update tenant
    - Test: ACCOUNTANT cannot update tenant (403)
    - Test: VIEWER cannot update tenant (403)
    - Test: Tenant isolation still enforced
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Remove the tenant isolation check (user.tenantId !== tenantId)
  - Create custom role checking logic (use existing @Roles decorator)
  - Add role check inside the method body (use decorator)
  - Forget to import Roles decorator and UserRole enum
</anti_patterns>

</task_spec>
