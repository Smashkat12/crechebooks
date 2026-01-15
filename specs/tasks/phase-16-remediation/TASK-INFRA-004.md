<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-004</task_id>
    <title>Add Helmet Security Headers</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Infrastructure</category>
    <subcategory>Security</subcategory>
    <estimated_effort>2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The API does not set security headers, leaving it vulnerable to common
      web attacks including XSS, clickjacking, MIME sniffing, and information
      disclosure through server headers.
    </issue_description>
    <impact>
      - Cross-site scripting (XSS) attacks possible
      - Clickjacking vulnerabilities
      - MIME type sniffing attacks
      - Information leakage via server headers
      - Missing HSTS allows downgrade attacks
      - Non-compliant with security best practices
    </impact>
    <root_cause>
      No security middleware configured in the NestJS application bootstrap.
      Missing helmet() or equivalent security header middleware.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Add helmet middleware with appropriate configuration
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/config/security.config.ts" action="create">
        Create centralized security configuration
      </file>
    </files_to_create>
    <dependencies>
      <dependency>helmet npm package for security headers</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Add helmet middleware to the NestJS application with appropriate
      configuration for an API server. Configure CSP, HSTS, and other
      headers while ensuring compatibility with API responses.
    </approach>
    <steps>
      <step order="1">
        Install helmet package:
        npm install helmet
      </step>
      <step order="2">
        Create security configuration with environment-specific settings
      </step>
      <step order="3">
        Add helmet middleware in main.ts bootstrap
      </step>
      <step order="4">
        Configure Content-Security-Policy appropriate for API
      </step>
      <step order="5">
        Enable HSTS with appropriate max-age for production
      </step>
      <step order="6">
        Hide X-Powered-By header to reduce information disclosure
      </step>
    </steps>
    <code_example>
```typescript
// main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }));

  await app.listen(3000);
}

// security.config.ts
export const securityConfig = {
  helmet: {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    hsts: {
      maxAge: process.env.NODE_ENV === 'production' ? 31536000 : 0,
    },
  },
};
```
    </code_example>
    <headers_explanation>
      <header name="Content-Security-Policy">
        Prevents XSS by restricting resource loading sources
      </header>
      <header name="Strict-Transport-Security">
        Forces HTTPS connections for specified duration
      </header>
      <header name="X-Frame-Options">
        Prevents clickjacking by blocking iframe embedding
      </header>
      <header name="X-Content-Type-Options">
        Prevents MIME type sniffing
      </header>
      <header name="X-XSS-Protection">
        Enables browser XSS filtering (legacy browsers)
      </header>
      <header name="Referrer-Policy">
        Controls referrer information in requests
      </header>
    </headers_explanation>
  </implementation>

  <verification>
    <test_cases>
      <test name="X-Frame-Options header present">
        Verify response includes X-Frame-Options: DENY
      </test>
      <test name="Content-Security-Policy header present">
        Verify response includes CSP header with expected directives
      </test>
      <test name="HSTS header present in production">
        Verify Strict-Transport-Security header in production mode
      </test>
      <test name="X-Powered-By header removed">
        Verify response does not include X-Powered-By header
      </test>
      <test name="X-Content-Type-Options header present">
        Verify response includes X-Content-Type-Options: nosniff
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API and make request to any endpoint</step>
      <step>Inspect response headers in browser dev tools</step>
      <step>Verify all expected security headers present</step>
      <step>Run security scanner (e.g., securityheaders.com) against API</step>
      <step>Verify A+ rating on security headers scan</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Helmet middleware configured and active</criterion>
      <criterion>Content-Security-Policy header appropriate for API</criterion>
      <criterion>HSTS enabled with 1 year max-age in production</criterion>
      <criterion>X-Frame-Options set to DENY</criterion>
      <criterion>X-Content-Type-Options set to nosniff</criterion>
      <criterion>X-Powered-By header removed</criterion>
      <criterion>Referrer-Policy configured appropriately</criterion>
      <criterion>Unit tests verify header presence</criterion>
      <criterion>Security headers scan achieves A+ rating</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
