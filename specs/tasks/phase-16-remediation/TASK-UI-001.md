<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-001</task_id>
    <title>Migrate Auth Token to HttpOnly Cookie</title>
    <type>security</type>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>security, authentication, xss-prevention, cookies</tags>
  </metadata>

  <context>
    <issue_description>
      Authentication tokens are currently stored in localStorage, which is vulnerable to
      Cross-Site Scripting (XSS) attacks. Any malicious script injected into the page can
      access localStorage and steal the authentication token, leading to session hijacking.
    </issue_description>
    <current_behavior>
      - Auth token stored in localStorage after login
      - Token retrieved from localStorage for API requests
      - Token accessible to any JavaScript running on the page
    </current_behavior>
    <security_impact>
      - HIGH: XSS attacks can steal authentication tokens
      - Session hijacking possible if token is compromised
      - Violates OWASP secure session management guidelines
    </security_impact>
    <related_issues>
      - TASK-UI-005 (CSP Headers) - Additional XSS mitigation
    </related_issues>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/web/src/lib/auth.ts" action="modify">
        Remove localStorage token operations, add cookie-based auth helpers
      </file>
      <file path="apps/api/src/auth/login.ts" action="modify">
        Set HttpOnly cookie on successful authentication
      </file>
      <file path="apps/api/src/auth/logout.ts" action="modify">
        Clear HttpOnly cookie on logout
      </file>
      <file path="apps/api/src/auth/middleware.ts" action="modify">
        Read token from cookie instead of Authorization header
      </file>
      <file path="apps/api/src/index.ts" action="modify">
        Update CORS configuration for credentials
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/web/src/lib/auth-cookies.ts">
        Cookie management utilities for client-side auth state
      </file>
    </files_to_create>
    <out_of_scope>
      - Refresh token implementation (separate task)
      - OAuth provider integration changes
      - Mobile app authentication
    </out_of_scope>
  </scope>

  <implementation>
    <step order="1" description="Update API to set HttpOnly cookie">
      <action>
        Modify login endpoint to set HttpOnly, Secure, SameSite cookie:

        ```typescript
        // apps/api/src/auth/login.ts
        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: '/'
        });
        ```
      </action>
    </step>
    <step order="2" description="Update API CORS for credentials">
      <action>
        Enable credentials in CORS configuration:

        ```typescript
        // apps/api/src/index.ts
        app.use(cors({
          origin: process.env.FRONTEND_URL,
          credentials: true
        }));
        ```
      </action>
    </step>
    <step order="3" description="Update auth middleware to read cookie">
      <action>
        Modify middleware to extract token from cookie:

        ```typescript
        // apps/api/src/auth/middleware.ts
        const token = req.cookies.auth_token;
        ```
      </action>
    </step>
    <step order="4" description="Update frontend auth library">
      <action>
        Remove localStorage operations, update fetch calls:

        ```typescript
        // apps/web/src/lib/auth.ts
        // Remove: localStorage.setItem('token', ...)
        // Add: credentials: 'include' to all fetch calls
        ```
      </action>
    </step>
    <step order="5" description="Update logout endpoint">
      <action>
        Clear cookie on logout:

        ```typescript
        // apps/api/src/auth/logout.ts
        res.clearCookie('auth_token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/'
        });
        ```
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="Cookie set on login">
        Login with valid credentials, verify Set-Cookie header with HttpOnly flag
      </test>
      <test name="Cookie not accessible via JavaScript">
        After login, verify document.cookie does not contain auth_token
      </test>
      <test name="API requests include cookie">
        Verify authenticated requests succeed with credentials: 'include'
      </test>
      <test name="Cookie cleared on logout">
        After logout, verify auth_token cookie is removed
      </test>
      <test name="CORS allows credentials">
        Verify cross-origin requests with credentials succeed
      </test>
    </test_cases>
    <security_verification>
      <check>Run XSS payload test - token should not be extractable</check>
      <check>Verify cookie flags in browser DevTools</check>
      <check>Test CSRF protection with SameSite attribute</check>
    </security_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <item>Auth token stored in HttpOnly cookie, not localStorage</item>
      <item>Cookie has Secure flag in production</item>
      <item>Cookie has SameSite=strict attribute</item>
      <item>All API endpoints accept cookie-based authentication</item>
      <item>Frontend fetch calls include credentials</item>
      <item>Logout properly clears auth cookie</item>
      <item>No localStorage references for auth token remain</item>
      <item>All existing auth tests pass</item>
      <item>Security scan shows no XSS token theft vulnerability</item>
    </criteria>
  </definition_of_done>
</task_specification>
