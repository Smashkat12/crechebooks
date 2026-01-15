<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-006</task_id>
    <title>Remove Console Logging from Middleware</title>
    <type>code-quality</type>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <status>DONE</status>
    <estimated_effort>1-2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <tags>logging, middleware, production, debugging, code-quality</tags>
  </metadata>

  <context>
    <issue_description>
      The middleware file contains console.log statements used for debugging that are
      executing in production. This creates unnecessary log noise, potential performance
      impact, and may expose sensitive information in logs.
    </issue_description>
    <current_behavior>
      - console.log statements in middleware.ts
      - Debug output for every request in production
      - Potential sensitive data in logs
      - Log clutter in production monitoring
    </current_behavior>
    <issues>
      - Performance: Logging on every request adds overhead
      - Security: May log sensitive headers or tokens
      - Operations: Difficult to find important logs in noise
      - Professionalism: Debug code in production
    </issues>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/web/src/middleware.ts" action="modify">
        Remove console.log statements, add proper logging
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/web/src/lib/logger.ts">
        Structured logger utility for frontend
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1" description="Create logger utility">
      <action>
        ```typescript
        // apps/web/src/lib/logger.ts
        type LogLevel = 'debug' | 'info' | 'warn' | 'error';

        interface LogEntry {
          level: LogLevel;
          message: string;
          timestamp: string;
          context?: Record<string, unknown>;
        }

        const shouldLog = (level: LogLevel): boolean => {
          const levels: Record<LogLevel, number> = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
          };

          const minLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
          return levels[level] >= levels[minLevel];
        };

        export const logger = {
          debug: (message: string, context?: Record<string, unknown>) => {
            if (shouldLog('debug')) {
              console.debug(JSON.stringify({ level: 'debug', message, timestamp: new Date().toISOString(), context }));
            }
          },

          info: (message: string, context?: Record<string, unknown>) => {
            if (shouldLog('info')) {
              console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), context }));
            }
          },

          warn: (message: string, context?: Record<string, unknown>) => {
            if (shouldLog('warn')) {
              console.warn(JSON.stringify({ level: 'warn', message, timestamp: new Date().toISOString(), context }));
            }
          },

          error: (message: string, context?: Record<string, unknown>) => {
            if (shouldLog('error')) {
              console.error(JSON.stringify({ level: 'error', message, timestamp: new Date().toISOString(), context }));
            }
          },
        };
        ```
      </action>
    </step>
    <step order="2" description="Audit middleware for console statements">
      <action>
        Find all console.log, console.debug, console.info statements:

        ```bash
        grep -n "console\." apps/web/src/middleware.ts
        ```
      </action>
    </step>
    <step order="3" description="Remove or replace console statements">
      <action>
        ```typescript
        // apps/web/src/middleware.ts
        import { logger } from '@/lib/logger';

        export function middleware(request: NextRequest) {
          // REMOVE: console.log('Request:', request.url);
          // REMOVE: console.log('Headers:', request.headers);

          // If logging is needed, use structured logger
          logger.debug('Middleware processing', {
            path: request.nextUrl.pathname,
            method: request.method
          });

          // ... rest of middleware logic
        }
        ```
      </action>
    </step>
    <step order="4" description="Add environment-based log control">
      <action>
        Ensure debug logs only appear in development:

        ```typescript
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Detailed middleware info', { ... });
        }
        ```
      </action>
    </step>
    <step order="5" description="Verify no sensitive data logged">
      <action>
        Review remaining log statements to ensure no sensitive data:
        - No auth tokens
        - No user credentials
        - No PII
        - No internal paths
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="No console.log in middleware">
        Search middleware.ts for raw console.log statements
      </test>
      <test name="Production logs clean">
        Deploy to staging, verify no debug noise in logs
      </test>
      <test name="Logger respects environment">
        Verify debug logs only appear in development
      </test>
      <test name="No sensitive data in logs">
        Review log output for any sensitive information
      </test>
    </test_cases>
    <commands>
      <command>grep -r "console\." apps/web/src/middleware.ts</command>
      <command>NODE_ENV=production npm run build</command>
    </commands>
  </verification>

  <definition_of_done>
    <criteria>
      <item>All console.log statements removed from middleware.ts</item>
      <item>Logger utility created with level filtering</item>
      <item>Production builds produce no debug log noise</item>
      <item>No sensitive data logged at any level</item>
      <item>Structured logging format used (JSON)</item>
      <item>ESLint rule added to prevent future console.log</item>
      <item>Development environment still has useful debug output</item>
    </criteria>
  </definition_of_done>
</task_specification>
