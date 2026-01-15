# TASK-SEC-002: Remove Dev Login UI Credentials Display

```xml
<task_spec id="TASK-SEC-002" version="1.0">
  <metadata>
    <title>Remove Dev Login UI Credentials Display</title>
    <priority>CRITICAL</priority>
    <estimated_tokens>2500</estimated_tokens>
    <domain>security</domain>
    <phase>16</phase>
    <status>DONE</status>
    <depends_on>TASK-SEC-001</depends_on>
  </metadata>

  <context>
    <background>
      Development credentials displayed in the login UI create a critical security
      vulnerability. Even if intended only for development, this UI can accidentally
      reach production, be captured in screenshots, or be indexed by search engines.
      Users may also screenshot and share these credentials unknowingly.
    </background>
    <current_state>
      The login page displays hardcoded test credentials in the UI:
      - Visible credential hints or "quick login" buttons
      - May include admin and viewer account details
      - No environment-based toggling of this display
      - Credentials visible in page source and potentially cached
    </current_state>
    <target_state>
      Clean login UI with no credential exposure:
      - No visible credentials in any environment
      - Development authentication uses browser dev tools or CLI
      - Proper dev auth flow without UI credential display
      - Environment-based dev tools that don't expose secrets
    </target_state>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/web/src/app/login/page.tsx" action="modify">
        Remove all credential display elements, quick login buttons, and hints
      </file>
      <file path="apps/web/src/app/login/login-form.tsx" action="modify">
        Remove any credential auto-fill or suggestion features
      </file>
      <file path="apps/web/src/components/dev-tools.tsx" action="modify">
        If exists, remove or secure development tools component
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/web/src/hooks/use-dev-auth.ts">
        Secure development auth hook using localStorage token injection
      </file>
      <file path="docs/development/dev-authentication.md">
        Documentation for developers on how to authenticate in dev mode
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1">
      Audit login page for credential exposure:
      - Search for hardcoded email/password strings
      - Find "quick login", "dev login", "test account" UI elements
      - Check for conditional rendering that might show credentials
    </step>
    <step order="2">
      Remove all credential display from login/page.tsx:
      - Delete any elements showing test usernames/passwords
      - Remove quick login buttons with hardcoded credentials
      - Remove credential hint text or tooltips
    </step>
    <step order="3">
      Remove credential auto-fill features:
      - Delete any form pre-population with test credentials
      - Remove autocomplete suggestions for dev accounts
      - Ensure form fields start empty
    </step>
    <step order="4">
      Implement secure dev auth alternative (optional):
      - Create use-dev-auth.ts hook for development use
      - Uses environment variable to enable (NEXT_PUBLIC_DEV_AUTH_ENABLED)
      - Allows token injection via browser console, not UI
      - Only available in development builds
    </step>
    <step order="5">
      Create developer documentation:
      - Document how to authenticate in development
      - Explain using browser dev tools or CLI for dev auth
      - Include example commands/scripts for common dev scenarios
    </step>
    <step order="6">
      Add build-time checks:
      - Ensure production builds don't include dev auth code
      - Add lint rules to catch credential patterns in UI files
    </step>
  </implementation>

  <verification>
    <test_command>npm run build && npm run test:e2e -- --grep "login"</test_command>
    <acceptance_criteria>
      <criterion>No credentials visible in login page UI</criterion>
      <criterion>No credentials in page source HTML</criterion>
      <criterion>No quick login buttons with hardcoded values</criterion>
      <criterion>Login page renders correctly without credential hints</criterion>
      <criterion>Production build contains no dev auth code paths</criterion>
      <criterion>Login functionality works for legitimate users</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <item>All credential displays removed from login UI</item>
    <item>Quick login / dev login buttons removed</item>
    <item>Form fields start empty with no suggestions</item>
    <item>Dev auth documentation created for developers</item>
    <item>Production build verified clean of dev auth code</item>
    <item>Visual regression tests pass</item>
    <item>Security review of login page completed</item>
  </definition_of_done>
</task_spec>
```
