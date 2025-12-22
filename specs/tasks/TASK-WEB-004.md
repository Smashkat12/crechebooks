<task_spec id="TASK-WEB-004" version="1.0">

<metadata>
  <title>Authentication Setup (NextAuth.js)</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>4</sequence>
  <implements>
    <requirement_ref>REQ-WEB-01</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
    <task_ref>TASK-WEB-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Implement authentication using NextAuth.js v5 with OAuth2/OIDC provider integration. This establishes session management, protected routes, and role-based access control for the CrecheBooks application.
</context>

<input_context_files>
  <file purpose="security_requirements">specs/constitution.md#security_requirements</file>
  <file purpose="user_types">packages/types/src/common.ts</file>
  <file purpose="api_auth">specs/technical/api-contracts.md#auth</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed</check>
  <check>TASK-WEB-003 completed</check>
  <check>next-auth installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Configure NextAuth.js with JWT strategy
    - Create auth configuration with credential provider (dev) and OAuth (prod)
    - Implement login/logout pages
    - Create route protection middleware
    - Create auth context and hooks
    - Handle role-based access
  </in_scope>
  <out_of_scope>
    - User registration (handled by API)
    - Password reset flow
    - Multi-factor authentication
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/lib/auth/config.ts">
      export const authConfig: NextAuthConfig
    </signature>
    <signature file="apps/web/src/lib/auth/index.ts">
      export const { auth, signIn, signOut, handlers } = NextAuth(authConfig)
    </signature>
    <signature file="apps/web/src/hooks/use-auth.ts">
      export function useAuth(): { user: User | null; isLoading: boolean; ... }
    </signature>
    <signature file="apps/web/middleware.ts">
      export { auth as middleware } from '@/lib/auth'
    </signature>
  </signatures>

  <constraints>
    - Must use NextAuth.js v5 patterns
    - Session must include user role and tenant ID
    - Protected routes must redirect to login
    - Must handle token refresh
  </constraints>

  <verification>
    - Login flow works correctly
    - Protected routes redirect unauthenticated users
    - Session persists across page reloads
    - Logout clears session
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/lib/auth/config.ts">NextAuth configuration</file>
  <file path="apps/web/src/lib/auth/index.ts">Auth exports</file>
  <file path="apps/web/src/hooks/use-auth.ts">Auth hook</file>
  <file path="apps/web/middleware.ts">Route protection middleware</file>
  <file path="apps/web/src/app/(auth)/login/page.tsx">Login page</file>
  <file path="apps/web/src/app/(auth)/layout.tsx">Auth layout</file>
  <file path="apps/web/src/app/api/auth/[...nextauth]/route.ts">NextAuth route handler</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/.env.example">Add auth environment variables</file>
</files_to_modify>

<validation_criteria>
  <criterion>Login form submits credentials</criterion>
  <criterion>Successful login redirects to dashboard</criterion>
  <criterion>Invalid credentials show error</criterion>
  <criterion>Protected routes require authentication</criterion>
  <criterion>Logout clears session and redirects to login</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
  <command>cd apps/web && pnpm dev</command>
</test_commands>

</task_spec>
