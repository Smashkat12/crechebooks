<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-005</task_id>
    <title>Configure CSP Headers</title>
    <type>security</type>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <status>DONE</status>
    <estimated_effort>3-4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <tags>security, csp, xss-prevention, headers, next.js</tags>
  </metadata>

  <context>
    <issue_description>
      The application has no Content Security Policy (CSP) headers configured. This leaves
      the application vulnerable to Cross-Site Scripting (XSS) attacks, inline script
      injection, and unauthorized resource loading from malicious domains.
    </issue_description>
    <current_behavior>
      - No CSP headers sent with responses
      - Any script can execute on the page
      - No restrictions on resource origins
      - No reporting of CSP violations
    </current_behavior>
    <security_impact>
      - MEDIUM: XSS attacks can inject and execute scripts
      - Data exfiltration possible via unauthorized requests
      - Clickjacking attacks possible without frame-ancestors
      - No defense-in-depth against injection attacks
    </security_impact>
    <related_issues>
      - TASK-UI-001 (HttpOnly Cookie) - Combined XSS mitigation
    </related_issues>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/web/next.config.js" action="modify">
        Add security headers configuration
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/web/src/lib/csp.ts">
        CSP policy generation utilities
      </file>
    </files_to_create>
    <headers_to_configure>
      <header name="Content-Security-Policy">Primary XSS prevention</header>
      <header name="X-Frame-Options">Clickjacking prevention</header>
      <header name="X-Content-Type-Options">MIME sniffing prevention</header>
      <header name="Referrer-Policy">Referrer information control</header>
      <header name="Permissions-Policy">Feature restrictions</header>
    </headers_to_configure>
  </scope>

  <implementation>
    <step order="1" description="Create CSP policy generator">
      <action>
        ```typescript
        // apps/web/src/lib/csp.ts
        export function generateCSP() {
          const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

          const policy = {
            'default-src': ["'self'"],
            'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],
            'style-src': ["'self'", "'unsafe-inline'"], // Required for CSS-in-JS
            'img-src': ["'self'", 'data:', 'https:'],
            'font-src': ["'self'"],
            'connect-src': ["'self'", process.env.NEXT_PUBLIC_API_URL],
            'frame-ancestors': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'upgrade-insecure-requests': [],
          };

          return {
            nonce,
            header: Object.entries(policy)
              .map(([key, values]) => `${key} ${values.join(' ')}`)
              .join('; '),
          };
        }
        ```
      </action>
    </step>
    <step order="2" description="Configure Next.js security headers">
      <action>
        ```javascript
        // apps/web/next.config.js
        const securityHeaders = [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
              img-src 'self' data: https:;
              font-src 'self';
              connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL || ''};
              frame-ancestors 'none';
              base-uri 'self';
              form-action 'self';
            `.replace(/\s{2,}/g, ' ').trim()
          }
        ];

        module.exports = {
          async headers() {
            return [
              {
                source: '/:path*',
                headers: securityHeaders,
              },
            ];
          },
        };
        ```
      </action>
    </step>
    <step order="3" description="Add CSP reporting endpoint (optional)">
      <action>
        ```typescript
        // apps/web/src/app/api/csp-report/route.ts
        export async function POST(request: Request) {
          const report = await request.json();
          console.error('CSP Violation:', report);
          // Log to monitoring service
          return new Response(null, { status: 204 });
        }
        ```
      </action>
    </step>
    <step order="4" description="Test CSP in report-only mode first">
      <action>
        Use Content-Security-Policy-Report-Only header initially to identify issues
      </action>
    </step>
    <step order="5" description="Adjust policy based on violations">
      <action>
        Review CSP violation reports and adjust policy as needed
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="CSP header present in response">
        Check response headers include Content-Security-Policy
      </test>
      <test name="Inline scripts blocked">
        Verify inline script injection is blocked
      </test>
      <test name="External scripts blocked">
        Verify scripts from unauthorized domains are blocked
      </test>
      <test name="Application still functions">
        Verify all application features work with CSP enabled
      </test>
      <test name="Frame embedding blocked">
        Verify page cannot be embedded in iframe
      </test>
    </test_cases>
    <security_verification>
      <check>Run security scanner to verify headers</check>
      <check>Test XSS payload injection is blocked</check>
      <check>Verify no CSP violations in production logs</check>
    </security_verification>
    <tools>
      <tool>securityheaders.com - Header analysis</tool>
      <tool>Browser DevTools Console - CSP violations</tool>
      <tool>csp-evaluator.withgoogle.com - Policy evaluation</tool>
    </tools>
  </verification>

  <definition_of_done>
    <criteria>
      <item>CSP header configured in next.config.js</item>
      <item>All security headers present (X-Frame-Options, X-Content-Type-Options, etc.)</item>
      <item>CSP policy blocks inline script execution</item>
      <item>CSP policy restricts resource origins</item>
      <item>Application functions correctly with CSP enabled</item>
      <item>No CSP violations in production</item>
      <item>Security header scanner shows A+ rating</item>
      <item>CSP reporting endpoint configured (optional)</item>
    </criteria>
  </definition_of_done>
</task_specification>
