<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-002</task_id>
    <title>Add Frontend Unit Tests</title>
    <type>testing</type>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <status>DONE</status>
    <estimated_effort>8-12 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <tags>testing, jest, react-testing-library, coverage, quality</tags>
  </metadata>

  <context>
    <issue_description>
      The frontend application has zero test coverage. Critical components, hooks, and
      utilities have no automated tests, making refactoring risky and regression detection
      impossible. This creates significant technical debt and production risk.
    </issue_description>
    <current_behavior>
      - No test files exist in apps/web/src/
      - No Jest or Testing Library configuration
      - No test scripts in package.json
      - Manual testing only
    </current_behavior>
    <business_impact>
      - HIGH: Regressions reach production undetected
      - Refactoring carries high risk
      - No confidence in deployment safety
      - Slower development velocity due to manual verification
    </business_impact>
  </context>

  <scope>
    <files_to_create>
      <file path="apps/web/jest.config.js">Jest configuration for Next.js</file>
      <file path="apps/web/jest.setup.ts">Test environment setup</file>
      <file path="apps/web/src/__tests__/setup.tsx">Test utilities and providers</file>
      <file path="apps/web/src/components/__tests__/Button.test.tsx">Button component tests</file>
      <file path="apps/web/src/components/__tests__/Form.test.tsx">Form component tests</file>
      <file path="apps/web/src/components/__tests__/Navigation.test.tsx">Navigation tests</file>
      <file path="apps/web/src/hooks/__tests__/useAuth.test.ts">Auth hook tests</file>
      <file path="apps/web/src/hooks/__tests__/useForm.test.ts">Form hook tests</file>
      <file path="apps/web/src/lib/__tests__/auth.test.ts">Auth utility tests</file>
      <file path="apps/web/src/lib/__tests__/api.test.ts">API client tests</file>
      <file path="apps/web/src/lib/__tests__/validation.test.ts">Validation tests</file>
    </files_to_create>
    <files_to_modify>
      <file path="apps/web/package.json" action="modify">
        Add Jest, Testing Library dependencies and test scripts
      </file>
      <file path="apps/web/tsconfig.json" action="modify">
        Add Jest types
      </file>
    </files_to_modify>
    <coverage_targets>
      <target component="Critical UI Components">80% minimum</target>
      <target component="Custom Hooks">90% minimum</target>
      <target component="Utility Functions">95% minimum</target>
      <target component="Overall Frontend">70% minimum</target>
    </coverage_targets>
  </scope>

  <implementation>
    <step order="1" description="Install testing dependencies">
      <action>
        ```bash
        cd apps/web
        npm install -D jest @testing-library/react @testing-library/jest-dom \
          @testing-library/user-event jest-environment-jsdom @types/jest \
          ts-jest identity-obj-proxy
        ```
      </action>
    </step>
    <step order="2" description="Configure Jest for Next.js">
      <action>
        Create jest.config.js:

        ```javascript
        const nextJest = require('next/jest');

        const createJestConfig = nextJest({ dir: './' });

        const customJestConfig = {
          setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
          testEnvironment: 'jest-environment-jsdom',
          moduleNameMapper: {
            '^@/(.*)$': '<rootDir>/src/$1',
          },
          collectCoverageFrom: [
            'src/**/*.{ts,tsx}',
            '!src/**/*.d.ts',
            '!src/**/*.stories.tsx',
          ],
          coverageThreshold: {
            global: {
              branches: 70,
              functions: 70,
              lines: 70,
              statements: 70,
            },
          },
        };

        module.exports = createJestConfig(customJestConfig);
        ```
      </action>
    </step>
    <step order="3" description="Create test setup file">
      <action>
        Create jest.setup.ts:

        ```typescript
        import '@testing-library/jest-dom';

        // Mock Next.js router
        jest.mock('next/navigation', () => ({
          useRouter: () => ({
            push: jest.fn(),
            replace: jest.fn(),
            back: jest.fn(),
          }),
          usePathname: () => '/',
          useSearchParams: () => new URLSearchParams(),
        }));
        ```
      </action>
    </step>
    <step order="4" description="Create test utilities">
      <action>
        Create reusable test providers and utilities:

        ```typescript
        // src/__tests__/setup.tsx
        import { render } from '@testing-library/react';
        import { ReactNode } from 'react';

        export function renderWithProviders(ui: ReactNode) {
          return render(
            <TestProviders>{ui}</TestProviders>
          );
        }
        ```
      </action>
    </step>
    <step order="5" description="Write critical component tests">
      <action>
        Test critical UI components with user interaction scenarios
      </action>
    </step>
    <step order="6" description="Write hook tests">
      <action>
        Test custom hooks with @testing-library/react renderHook
      </action>
    </step>
    <step order="7" description="Write utility function tests">
      <action>
        Test all utility functions with edge cases
      </action>
    </step>
    <step order="8" description="Add test scripts to package.json">
      <action>
        ```json
        {
          "scripts": {
            "test": "jest",
            "test:watch": "jest --watch",
            "test:coverage": "jest --coverage"
          }
        }
        ```
      </action>
    </step>
  </implementation>

  <verification>
    <test_commands>
      <command>npm run test</command>
      <command>npm run test:coverage</command>
    </test_commands>
    <validation_criteria>
      <criterion>All tests pass without errors</criterion>
      <criterion>Coverage meets minimum thresholds</criterion>
      <criterion>No console errors during test runs</criterion>
      <criterion>Tests complete in under 60 seconds</criterion>
    </validation_criteria>
  </verification>

  <definition_of_done>
    <criteria>
      <item>Jest configured and running with Next.js</item>
      <item>Testing Library installed and configured</item>
      <item>Test utilities and providers created</item>
      <item>All critical components have tests</item>
      <item>All custom hooks have tests</item>
      <item>All utility functions have tests</item>
      <item>Minimum 70% overall coverage achieved</item>
      <item>npm run test passes in CI</item>
      <item>Coverage report generated and accessible</item>
    </criteria>
  </definition_of_done>
</task_specification>
