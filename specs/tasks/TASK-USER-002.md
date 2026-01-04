<task_spec id="TASK-USER-002" version="1.0">

<metadata>
  <title>User Management Admin Page</title>
  <status>pending</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>133</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-USER-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-WEB-040</task_ref>
    <task_ref status="COMPLETE">TASK-API-001</task_ref>
    <task_ref status="pending">TASK-USER-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use admin interface and user management UI patterns.
This task involves:
1. User list with role display
2. Invite new users to tenant
3. Change user roles
4. Remove users from tenant
5. View pending invitations
6. Resend/cancel invitations
</reasoning_mode>

<context>
GAP: No admin page exists for managing users within a tenant. Owners and admins need to:
- See who has access to their creche
- Invite new staff/accountants
- Change user roles
- Remove access when staff leave

This depends on TASK-USER-001 for multi-tenant user support.
</context>

<current_state>
## Codebase State
- Settings page exists (TASK-WEB-040) but no user management section
- Auth guards in place
- User entities exist
- No user management UI
- No invitation UI

## After TASK-USER-001
- UserTenantRole entity
- UserTenantService with invite/manage methods
- Multi-tenant membership support
</current_state>

<input_context_files>
  <file purpose="settings_page">apps/web/src/app/(dashboard)/settings/page.tsx</file>
  <file purpose="user_entity">apps/api/src/database/entities/user.entity.ts</file>
  <file purpose="role_enum">apps/api/src/auth/enums/role.enum.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Users section in settings or dedicated /users page
    - User list with name, email, role, status
    - Invite user modal
    - Change role dropdown
    - Remove user confirmation
    - Pending invitations list
    - Resend/cancel invitation
    - Role-based visibility (only OWNER/ADMIN see this)
  </in_scope>
  <out_of_scope>
    - User profile editing (separate)
    - Tenant switching UI (separate)
    - Email template customization
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/settings/users/page.tsx">
      export default function UsersSettingsPage(): JSX.Element;
      // Server component for user management
    </signature>
    <signature file="apps/web/src/components/settings/UserList.tsx">
      export interface UserListProps {
        users: TenantUser[];
        currentUserId: string;
        onRoleChange: (userId: string, role: Role) => Promise<void>;
        onRemove: (userId: string) => Promise<void>;
      }

      export function UserList({
        users,
        currentUserId,
        onRoleChange,
        onRemove,
      }: UserListProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/settings/InviteUserModal.tsx">
      export interface InviteUserModalProps {
        isOpen: boolean;
        onClose: () => void;
        onInvite: (email: string, role: Role) => Promise<void>;
      }

      export function InviteUserModal({
        isOpen,
        onClose,
        onInvite,
      }: InviteUserModalProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/settings/PendingInvitations.tsx">
      export interface PendingInvitationsProps {
        invitations: Invitation[];
        onResend: (invitationId: string) => Promise<void>;
        onCancel: (invitationId: string) => Promise<void>;
      }

      export function PendingInvitations({
        invitations,
        onResend,
        onCancel,
      }: PendingInvitationsProps): JSX.Element;
    </signature>
  </signatures>

  <constraints>
    - Only OWNER and ADMIN can access this page
    - Cannot change own role (prevent lockout)
    - Cannot remove self
    - Owner cannot be removed (must transfer ownership first)
    - Email validation for invitations
    - Role descriptions shown in dropdown
    - Confirmation for destructive actions
    - Loading states for all operations
  </constraints>

  <verification>
    - Page accessible to OWNER/ADMIN only
    - User list displays correctly
    - Role change works
    - User removal works (with confirmation)
    - Invitation modal works
    - Pending invitations displayed
    - Resend/cancel invitations work
    - Cannot modify self
    - Owner protection works
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/settings/users/page.tsx">Main page</file>
  <file path="apps/web/src/components/settings/UserList.tsx">User table</file>
  <file path="apps/web/src/components/settings/UserRow.tsx">Individual row</file>
  <file path="apps/web/src/components/settings/InviteUserModal.tsx">Invitation modal</file>
  <file path="apps/web/src/components/settings/PendingInvitations.tsx">Invitations list</file>
  <file path="apps/web/src/components/settings/RoleSelect.tsx">Role dropdown</file>
  <file path="apps/web/src/hooks/useTenantUsers.ts">Data hook</file>
  <file path="apps/web/src/lib/api/users.ts">API client</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/settings/page.tsx">Add users link</file>
</files_to_modify>

<validation_criteria>
  <criterion>Users page accessible at /settings/users</criterion>
  <criterion>Only OWNER/ADMIN can access</criterion>
  <criterion>User list displays all tenant users</criterion>
  <criterion>Role change works</criterion>
  <criterion>User removal works with confirmation</criterion>
  <criterion>Invite user modal works</criterion>
  <criterion>Pending invitations displayed</criterion>
  <criterion>Self-modification prevented</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="user|settings" --verbose</command>
</test_commands>

</task_spec>
