<task_spec id="TASK-SEC-103" version="1.0">

<metadata>
  <title>Content Security Policy Headers</title>
  <status>ready</status>
  <phase>usacf-sprint-3</phase>
  <layer>security</layer>
  <sequence>208</sequence>
  <priority>P2-MEDIUM</priority>
  <sprint>3</sprint>
  <estimated_effort>2 days (16 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP020</opportunity_ref>
    <gap_ref>S007</gap_ref>
    <vulnerability_ref>V007</vulnerability_ref>
  </implements>
  <depends_on>
    <!-- No strict dependencies -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <confidence>92%</confidence>
  <cvss_score>4.0</cvss_score>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP020</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture - CSP must allow tenant-specific content while blocking XSS.
    React SPA frontend with API backend - CSP must cover both.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <frontend>React 18 with Vite - served separately or via CDN</frontend>
    <testing>Jest for unit/integration, manual XSS testing with OWASP ZAP</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (CSP headers set here)
    apps/web/        - React frontend (receives CSP headers)
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - enforce strict CSP, fix violations immediately</rule>
    <rule id="2">REPORT-ONLY FIRST - deploy in report-only mode for 1 week before enforcing</rule>
    <rule id="3">ROBUST ERROR LOGGING - log all CSP violations with source/blocked URI</rule>
    <rule id="4">NO UNSAFE-EVAL - never allow eval(), use nonces for inline scripts</rule>
    <rule id="5">FRAME-ANCESTORS NONE - prevent clickjacking attacks</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="middleware">HTTP middleware in apps/api/src/common/middleware/</pattern>
    <pattern name="config">CSP directives configurable via environment</pattern>
    <pattern name="reporting">CSP violation reports to dedicated endpoint</pattern>
  </coding_patterns>

  <external_resources_needed>
    - fonts.googleapis.com (Google Fonts)
    - fonts.gstatic.com (Google Fonts files)
    - cdn.jsdelivr.net (optional CDN assets)
    - api.xero.com (Xero API calls)
    - *.simplepay.co.za (SimplePay API calls)
  </external_resources_needed>
</project_context>

<executive_summary>
Implement Content Security Policy (CSP) headers to prevent XSS attacks and enforce secure
content loading. Currently, no CSP headers are set, leaving the application vulnerable to
script injection attacks.
</executive_summary>

<business_case>
  <problem>No CSP headers - vulnerable to XSS attacks (CVSS 4.0)</problem>
  <solution>Implement strict CSP with report-only mode initially</solution>
  <benefit>Block XSS attacks, prevent unauthorized script execution</benefit>
  <roi>Security compliance, reduced vulnerability surface</roi>
</business_case>

<context>
GAP S007: No CSP security headers.
Vulnerability V007: XSS prevention missing.

Current State:
- No Content-Security-Policy header
- No X-Content-Type-Options header
- No X-Frame-Options header
- Scripts can be injected and executed
</context>

<input_context_files>
  <file purpose="main_ts">apps/api/src/main.ts</file>
  <file purpose="web_main">apps/web/src/main.tsx</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Content-Security-Policy header configuration
    - X-Content-Type-Options header
    - X-Frame-Options header
    - X-XSS-Protection header
    - Referrer-Policy header
    - CSP report-only mode for testing
    - CSP violation reporting endpoint
    - Nonce-based inline script handling
  </in_scope>
  <out_of_scope>
    - Subresource Integrity (SRI) for CDN assets
    - Feature Policy/Permissions Policy
    - HSTS preloading
    - Certificate transparency
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/common/middleware/security-headers.middleware.ts">
      @Injectable()
      export class SecurityHeadersMiddleware implements NestMiddleware {
        use(req: Request, res: Response, next: NextFunction): void {
          // Set all security headers
          res.setHeader('Content-Security-Policy', this.getCSP());
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('X-XSS-Protection', '1; mode=block');
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
          next();
        }
      }
    </signature>
    <signature file="apps/api/src/api/csp/csp-report.controller.ts">
      @Controller('csp-report')
      export class CspReportController {
        @Post()
        @HttpCode(204)
        async handleReport(@Body() report: CspViolationReport): Promise&lt;void&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Must not break existing functionality
    - Start in report-only mode for 1 week
    - Allow only necessary external sources
    - Nonces for inline scripts
    - Report violations to logging endpoint
  </constraints>

  <verification>
    - All security headers present in responses
    - XSS attack vectors blocked
    - Application functions normally
    - Violations logged
    - No false positives in normal usage
  </verification>
</definition_of_done>

<csp_policy>
  <directive name="default-src">'self'</directive>
  <directive name="script-src">'self' 'nonce-{random}' https://cdn.jsdelivr.net</directive>
  <directive name="style-src">'self' 'unsafe-inline' https://fonts.googleapis.com</directive>
  <directive name="font-src">'self' https://fonts.gstatic.com</directive>
  <directive name="img-src">'self' data: https:</directive>
  <directive name="connect-src">'self' https://api.xero.com https://*.simplepay.co.za</directive>
  <directive name="frame-ancestors">'none'</directive>
  <directive name="form-action">'self'</directive>
  <directive name="base-uri">'self'</directive>
  <directive name="object-src">'none'</directive>
  <directive name="report-uri">/csp-report</directive>
</csp_policy>

<implementation_approach>
  <step order="1">
    Create SecurityHeadersMiddleware with all headers
  </step>
  <step order="2">
    Implement CSP report endpoint
  </step>
  <step order="3">
    Deploy in report-only mode (Content-Security-Policy-Report-Only)
  </step>
  <step order="4">
    Monitor for violations for 1 week
  </step>
  <step order="5">
    Adjust policy based on violations
  </step>
  <step order="6">
    Switch to enforcement mode
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/common/middleware/security-headers.middleware.ts">
    Security headers middleware
  </file>
  <file path="apps/api/src/api/csp/csp-report.controller.ts">
    CSP violation report handler
  </file>
  <file path="apps/api/src/api/csp/csp.module.ts">
    CSP module
  </file>
  <file path="apps/api/src/common/middleware/__tests__/security-headers.middleware.spec.ts">
    Middleware tests
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/main.ts">
    Apply security headers middleware
  </file>
  <file path="apps/api/src/app.module.ts">
    Import CSP module
  </file>
  <file path="apps/web/index.html">
    Add nonce support for inline scripts
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Content-Security-Policy header present</criterion>
  <criterion>X-Content-Type-Options: nosniff present</criterion>
  <criterion>X-Frame-Options: DENY present</criterion>
  <criterion>Application functions normally with CSP</criterion>
  <criterion>Violations logged to endpoint</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="security-headers" --verbose</command>
  <command>curl -I http://localhost:3000/health | grep -i content-security-policy</command>
</test_commands>

<success_metrics>
  <metric name="xss_blocked">100%</metric>
  <metric name="false_positives">0</metric>
  <metric name="headers_present">100% of responses</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: CSP_ENABLED (default: true)
  - Start in report-only mode
  - Easy rollback by removing middleware
</rollback_plan>

</task_spec>
