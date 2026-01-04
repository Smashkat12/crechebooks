<task_spec id="TASK-USER-001" version="1.0">

<metadata>
  <title>Multi-Tenant User Role Assignment</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>132</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-USER-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-003</task_ref>
    <task_ref status="COMPLETE">TASK-API-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use multi-tenancy and authorization design patterns.
This task involves:
1. User can belong to multiple tenants
2. Different role per tenant (owner in one, viewer in another)
3. Tenant switching in session
4. Role checks respect current tenant context
5. Invitation flow for multi-tenant users
</reasoning_mode>

<context>
GAP: REQ-USER-004 specifies "User can belong to multiple tenants with different roles."

Current state: Users are assigned to a SINGLE tenant with a single role. This doesn't support:
- Accountants managing multiple creches
- Owners with multiple locations
- Staff working at multiple sites

The User entity has tenantId (singular) but needs a UserTenantRole junction table.
</context>

<current_state>
## Codebase State
- User entity has single tenantId
- Role enum: OWNER, ADMIN, VIEWER, ACCOUNTANT
- AuthGuard checks role from user.role
- No tenant switching capability
- No multi-tenant membership

## Current User Entity
```typescript
@Entity()
export class User {
  @Column()
  tenantId: string;  // Single tenant!

  @Column({ type: 'enum', enum: Role })
  role: Role;  // Single role!
}
```
</current_state>

<input_context_files>
  <file purpose="user_entity">apps/api/src/database/entities/user.entity.ts</file>
  <file purpose="tenant_entity">apps/api/src/database/entities/tenant.entity.ts</file>
  <file purpose="auth_guard">apps/api/src/auth/guards/auth.guard.ts</file>
  <file purpose="role_guard">apps/api/src/auth/guards/role.guard.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - UserTenantRole entity (junction table)
    - Multi-tenant user membership
    - Role per tenant
    - Active tenant in session/token
    - Tenant switching API
    - Role guard updates
    - User invitation to tenant
  </in_scope>
  <out_of_scope>
    - UI for tenant switching (surface layer)
    - UI for invitations (surface layer)
    - Email notifications for invitations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/entities/user-tenant-role.entity.ts">
      @Entity('user_tenant_roles')
      export class UserTenantRole {
        @PrimaryColumn()
        userId: string;

        @PrimaryColumn()
        tenantId: string;

        @Column({ type: 'enum', enum: Role })
        role: Role;

        @Column({ default: true })
        isActive: boolean;

        @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
        joinedAt: Date;

        @ManyToOne(() => User)
        user: User;

        @ManyToOne(() => Tenant)
        tenant: Tenant;
      }
    </signature>
    <signature file="apps/api/src/database/services/user-tenant.service.ts">
      @Injectable()
      export class UserTenantService {
        async getUserTenants(userId: string): Promise<TenantWithRole[]>;
        async getTenantRole(userId: string, tenantId: string): Promise<Role | null>;
        async addUserToTenant(userId: string, tenantId: string, role: Role): Promise<void>;
        async removeUserFromTenant(userId: string, tenantId: string): Promise<void>;
        async updateUserRole(userId: string, tenantId: string, role: Role): Promise<void>;
        async inviteUserToTenant(email: string, tenantId: string, role: Role): Promise<Invitation>;
        async acceptInvitation(invitationId: string, userId: string): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/auth/auth.service.ts">
      // Add to existing service
      async switchTenant(userId: string, tenantId: string): Promise<AuthTokens>;
      async getCurrentTenantRole(userId: string, tenantId: string): Promise<Role>;
    </signature>
  </signatures>

  <constraints>
    - Backward compatible: existing users migrated to junction table
    - Default tenant stored in user preferences
    - Token includes current tenantId and role
    - Role guard uses current tenant context
    - Invitation expires in 7 days
    - Only OWNER/ADMIN can invite users
    - Audit log for all role changes
  </constraints>

  <verification>
    - User can belong to multiple tenants
    - Different role per tenant
    - Tenant switching works
    - Role guard checks current tenant
    - Existing users migrated
    - Invitations work
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/entities/user-tenant-role.entity.ts">Junction entity</file>
  <file path="apps/api/src/database/entities/invitation.entity.ts">Invitation entity</file>
  <file path="apps/api/src/database/services/user-tenant.service.ts">Multi-tenant service</file>
  <file path="apps/api/src/database/services/__tests__/user-tenant.service.spec.ts">Tests</file>
  <file path="apps/api/prisma/migrations/xxx_add_user_tenant_roles/migration.sql">Migration</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/entities/user.entity.ts">Add relation</file>
  <file path="apps/api/src/auth/guards/role.guard.ts">Use current tenant</file>
  <file path="apps/api/src/auth/auth.service.ts">Add tenant switching</file>
  <file path="apps/api/prisma/schema.prisma">Schema updates</file>
</files_to_modify>

<validation_criteria>
  <criterion>UserTenantRole entity created</criterion>
  <criterion>User can have multiple tenants</criterion>
  <criterion>Role stored per tenant</criterion>
  <criterion>Tenant switching works</criterion>
  <criterion>Role guard uses current tenant</criterion>
  <criterion>Existing users migrated</criterion>
  <criterion>Invitations work</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_user_tenant_roles</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="user-tenant" --verbose</command>
</test_commands>

</task_spec>
