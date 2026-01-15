# TASK-SEC-001: Remove Hardcoded Dev Credentials

```xml
<task_spec id="TASK-SEC-001" version="1.0">
  <metadata>
    <title>Remove Hardcoded Dev Credentials</title>
    <priority>CRITICAL</priority>
    <estimated_tokens>3500</estimated_tokens>
    <domain>security</domain>
    <phase>16</phase>
    <status>DONE</status>
    <depends_on>none</depends_on>
  </metadata>

  <context>
    <background>
      Hardcoded development credentials in source code pose a critical security risk.
      If this code reaches production or the repository is exposed, attackers can
      gain immediate unauthorized access. Credentials like "admin123" and "viewer123"
      are commonly scanned for by automated security tools and attackers.
    </background>
    <current_state>
      Development credentials are hardcoded directly in authentication source files:
      - Backend auth services contain hardcoded user/password combinations
      - These credentials bypass normal authentication flows
      - No environment-based switching for credential sources
    </current_state>
    <target_state>
      All credentials sourced exclusively from environment variables:
      - No hardcoded passwords in any source file
      - Development uses separate .env.development with test credentials
      - Production credentials managed via secure secret management
      - Credential validation always goes through proper auth flow
    </target_state>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/auth/auth.service.ts" action="modify">
        Remove hardcoded credential checks, implement environment-based auth
      </file>
      <file path="apps/api/src/auth/auth.module.ts" action="modify">
        Update module configuration for environment-based auth providers
      </file>
      <file path="apps/api/src/auth/local.strategy.ts" action="modify">
        Remove any hardcoded credential validation
      </file>
      <file path="apps/web/src/app/login/page.tsx" action="modify">
        Remove any hardcoded credential references in frontend
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/auth/dev-auth.guard.ts">
        Optional development auth guard that reads from environment only
      </file>
      <file path=".env.example">
        Update with required auth environment variables (no actual values)
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1">
      Audit all auth files for hardcoded credentials using grep/search:
      - Search for "admin123", "viewer123", "password", "secret" literals
      - Document all occurrences with file paths and line numbers
    </step>
    <step order="2">
      Define required environment variables for authentication:
      - DEV_AUTH_ENABLED (boolean to enable dev auth mode)
      - DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD_HASH
      - DEV_VIEWER_EMAIL, DEV_VIEWER_PASSWORD_HASH
      - Passwords must be hashed, never plain text even in dev
    </step>
    <step order="3">
      Update auth.service.ts to remove all hardcoded credentials:
      - Replace literal password checks with environment variable reads
      - Use bcrypt/argon2 for password comparison
      - Add validation that required env vars are set on startup
    </step>
    <step order="4">
      Update local.strategy.ts passport strategy:
      - Remove any hardcoded user lookups
      - Ensure all validation uses database or env-configured sources
    </step>
    <step order="5">
      Create/update .env.example with placeholder variables:
      - Document all required auth environment variables
      - Include comments explaining each variable's purpose
      - Do NOT include actual credential values
    </step>
    <step order="6">
      Add startup validation in main.ts or auth module:
      - Check that required auth env vars are present
      - Fail fast with clear error if missing in production
      - Log warning (not values) if using dev auth in non-dev environment
    </step>
    <step order="7">
      Update frontend login page to remove credential hints:
      - Remove any displayed test credentials
      - Handled separately in TASK-SEC-002 if more extensive
    </step>
  </implementation>

  <verification>
    <test_command>npm run test -- --grep "auth" && npm run lint</test_command>
    <acceptance_criteria>
      <criterion>No hardcoded credentials found via grep search in source files</criterion>
      <criterion>Application starts successfully with proper env vars configured</criterion>
      <criterion>Application fails to start if required auth env vars missing (production mode)</criterion>
      <criterion>Authentication still works using environment-configured credentials</criterion>
      <criterion>All existing auth tests pass with env-based configuration</criterion>
      <criterion>Security scan (npm audit, secret scanning) passes clean</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <item>All hardcoded credentials removed from source code</item>
    <item>Environment variables defined for all auth configuration</item>
    <item>.env.example updated with required variables (no values)</item>
    <item>Startup validation added for required env vars</item>
    <item>All auth tests updated and passing</item>
    <item>Code review completed with security focus</item>
    <item>Secret scanning confirms no credentials in repo</item>
  </definition_of_done>
</task_spec>
```
