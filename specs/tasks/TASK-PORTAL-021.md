<task_spec id="TASK-PORTAL-021" version="1.0">

<metadata>
  <title>Staff Portal Layout and Authentication</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>310</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-STAFF-01</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
    <task_ref>TASK-WEB-004</task_ref>
    <task_ref>TASK-STAFF-004</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create the staff portal layout and authentication flow. Staff members authenticate via magic link (passwordless) sent to their registered work email. The portal provides a separate authenticated experience for staff to access their payroll information, leave management, and tax documents from SimplePay.
</context>

<input_context_files>
  <file purpose="auth_config">apps/web/src/app/api/auth/[...nextauth]/route.ts</file>
  <file purpose="staff_api">apps/api/src/api/staff/staff.controller.ts</file>
  <file purpose="simplepay_service">apps/api/src/database/services/simplepay/simplepay.service.ts</file>
  <file purpose="layout_pattern">apps/web/src/components/layout/dashboard-layout.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed (Next.js setup)</check>
  <check>TASK-WEB-004 completed (NextAuth setup)</check>
  <check>TASK-STAFF-004 completed (SimplePay integration)</check>
</prerequisites>

<scope>
  <in_scope>
    - Staff portal route group (/staff/*)
    - Magic link authentication flow
    - Staff-specific NextAuth provider
    - Portal layout with navigation
    - Staff session management
    - Protected route middleware for staff portal
    - Login page with email input
    - Magic link email template
    - Session token validation against staff record
    - SimplePay employee ID linking
    - Responsive mobile-first design
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(staff-portal)/layout.tsx">
      export default function StaffPortalLayout({ children }: { children: React.ReactNode })
    </signature>
    <signature file="apps/web/src/app/(staff-portal)/login/page.tsx">
      export default function StaffLoginPage()
    </signature>
    <signature file="apps/web/src/components/staff-portal/staff-header.tsx">
      export function StaffHeader()
    </signature>
    <signature file="apps/api/src/api/auth/staff-auth.controller.ts">
      export class StaffAuthController
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(staff-portal)/layout.tsx">Staff portal layout wrapper</file>
  <file path="apps/web/src/app/(staff-portal)/login/page.tsx">Magic link login page</file>
  <file path="apps/web/src/app/(staff-portal)/verify/page.tsx">Magic link verification</file>
  <file path="apps/web/src/components/staff-portal/staff-header.tsx">Staff header navigation</file>
  <file path="apps/web/src/components/staff-portal/staff-sidebar.tsx">Staff sidebar menu</file>
  <file path="apps/web/src/components/staff-portal/index.ts">Component exports</file>
  <file path="apps/api/src/api/auth/staff-auth.controller.ts">Staff authentication API</file>
  <file path="apps/api/src/api/auth/dto/staff-login.dto.ts">Staff login DTOs</file>
  <file path="apps/api/src/templates/emails/staff-magic-link.hbs">Magic link email template</file>
</files_to_create>

<authentication_flow>
  <step order="1">Staff enters work email on /staff/login</step>
  <step order="2">API validates email exists in Staff table</step>
  <step order="3">Magic link generated with JWT (15min expiry)</step>
  <step order="4">Email sent via existing Mailgun integration</step>
  <step order="5">Staff clicks link → /staff/verify?token=xxx</step>
  <step order="6">Token validated, staff session created</step>
  <step order="7">SimplePay employee ID resolved for payroll access</step>
  <step order="8">Staff redirected to /staff/dashboard</step>
</authentication_flow>

<validation_criteria>
  <criterion>Magic link email sends successfully</criterion>
  <criterion>Token expires after 15 minutes</criterion>
  <criterion>Invalid email shows appropriate error</criterion>
  <criterion>Session includes SimplePay employee ID</criterion>
  <criterion>Session persists across page refreshes</criterion>
  <criterion>Logout clears session completely</criterion>
</validation_criteria>

</task_spec>
