<task_spec id="TASK-PORTAL-011" version="1.0">

<metadata>
  <title>Parent Portal Layout and Authentication</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>300</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-01</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
    <task_ref>TASK-WEB-004</task_ref>
    <task_ref>TASK-API-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create the parent portal layout, authentication flow, and foundation components. Parents will authenticate via magic link (passwordless) sent to their registered email. The portal provides a separate authenticated experience from the admin dashboard, allowing parents to self-service their billing information.
</context>

<input_context_files>
  <file purpose="auth_config">apps/web/src/app/api/auth/[...nextauth]/route.ts</file>
  <file purpose="parent_api">apps/api/src/api/parents/parent.controller.ts</file>
  <file purpose="layout_pattern">apps/web/src/components/layout/dashboard-layout.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed (Next.js setup)</check>
  <check>TASK-WEB-004 completed (NextAuth setup)</check>
  <check>TASK-API-001 completed (Auth guards)</check>
</prerequisites>

<scope>
  <in_scope>
    - Parent portal route group (/parent/*)
    - Magic link authentication flow
    - Parent-specific NextAuth provider
    - Portal layout with simplified navigation
    - Parent session management
    - Protected route middleware for parent portal
    - Login page with email input
    - Magic link email template
    - Session token validation against parent record
    - Responsive mobile-first design
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/layout.tsx">
      export default function ParentPortalLayout({ children }: { children: React.ReactNode })
    </signature>
    <signature file="apps/web/src/app/(parent-portal)/login/page.tsx">
      export default function ParentLoginPage()
    </signature>
    <signature file="apps/web/src/components/parent-portal/portal-header.tsx">
      export function PortalHeader()
    </signature>
    <signature file="apps/api/src/api/auth/parent-auth.controller.ts">
      export class ParentAuthController
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/layout.tsx">Parent portal layout wrapper</file>
  <file path="apps/web/src/app/(parent-portal)/login/page.tsx">Magic link login page</file>
  <file path="apps/web/src/app/(parent-portal)/verify/page.tsx">Magic link verification</file>
  <file path="apps/web/src/components/parent-portal/portal-header.tsx">Portal header navigation</file>
  <file path="apps/web/src/components/parent-portal/portal-sidebar.tsx">Portal sidebar menu</file>
  <file path="apps/web/src/components/parent-portal/index.ts">Component exports</file>
  <file path="apps/api/src/api/auth/parent-auth.controller.ts">Parent authentication API</file>
  <file path="apps/api/src/api/auth/dto/parent-login.dto.ts">Parent login DTOs</file>
  <file path="apps/api/src/api/auth/services/magic-link.service.ts">Magic link generation/validation</file>
  <file path="apps/api/src/templates/emails/parent-magic-link.hbs">Magic link email template</file>
</files_to_create>

<authentication_flow>
  <step order="1">Parent enters email on /parent/login</step>
  <step order="2">API validates email exists in Parent table</step>
  <step order="3">Magic link generated with JWT (15min expiry)</step>
  <step order="4">Email sent via existing Mailgun integration</step>
  <step order="5">Parent clicks link → /parent/verify?token=xxx</step>
  <step order="6">Token validated, parent session created</step>
  <step order="7">Parent redirected to /parent/dashboard</step>
</authentication_flow>

<validation_criteria>
  <criterion>Magic link email sends successfully</criterion>
  <criterion>Token expires after 15 minutes</criterion>
  <criterion>Invalid email shows appropriate error</criterion>
  <criterion>Session persists across page refreshes</criterion>
  <criterion>Logout clears session completely</criterion>
  <criterion>Mobile layout works correctly</criterion>
</validation_criteria>

</task_spec>
