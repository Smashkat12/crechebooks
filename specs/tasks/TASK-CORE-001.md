<task_spec id="TASK-CORE-001" version="1.0">

<metadata>
  <title>Project Setup and Base Configuration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>1</sequence>
  <implements>
    <requirement_ref>NFR-PERF-001</requirement_ref>
    <requirement_ref>NFR-SEC-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- First task - no dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This is the foundational task for the CrecheBooks system. It establishes the project
structure, installs dependencies, configures TypeScript, sets up the NestJS framework,
and creates base configuration for database connections, environment variables, and
shared utilities. All subsequent tasks depend on this foundation.
</context>

<input_context_files>
  <file purpose="project_structure">specs/constitution.md#directory_structure</file>
  <file purpose="tech_stack">specs/constitution.md#tech_stack</file>
  <file purpose="coding_standards">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>Node.js 20.x installed</check>
  <check>PostgreSQL 16.x installed or accessible</check>
  <check>Redis installed or accessible</check>
  <check>npm or pnpm package manager available</check>
</prerequisites>

<scope>
  <in_scope>
    - Initialize NestJS project with TypeScript
    - Configure ESLint and Prettier per constitution
    - Set up Prisma ORM with PostgreSQL connection
    - Create environment configuration module
    - Create shared utilities (Decimal.js wrapper, date helpers)
    - Create base exception classes
    - Create logging configuration
    - Set up Jest for testing
  </in_scope>
  <out_of_scope>
    - Entity definitions (TASK-CORE-002+)
    - Authentication (TASK-CORE-003)
    - Business logic (Phase 2)
    - API controllers (Phase 4)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/main.ts">
      async function bootstrap(): Promise&lt;void&gt;
    </signature>
    <signature file="src/app.module.ts">
      @Module({ imports: [...], controllers: [...], providers: [...] })
      export class AppModule {}
    </signature>
    <signature file="src/config/configuration.ts">
      export default (): Configuration =&gt; ({...})
      export interface Configuration {...}
    </signature>
    <signature file="src/shared/utils/decimal.util.ts">
      export class Money {
        static fromCents(cents: number): Decimal;
        static toCents(amount: Decimal): number;
        static add(a: Decimal, b: Decimal): Decimal;
        static subtract(a: Decimal, b: Decimal): Decimal;
        static multiply(a: Decimal, b: Decimal): Decimal;
        static divide(a: Decimal, b: Decimal): Decimal;
        static round(value: Decimal): Decimal; // banker's rounding
      }
    </signature>
    <signature file="src/shared/exceptions/base.exception.ts">
      export class AppException extends Error {...}
      export class ValidationException extends AppException {...}
      export class NotFoundExeption extends AppException {...}
      export class ConflictException extends AppException {...}
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for all monetary calculations
    - Must implement banker's rounding (half-even)
    - Must NOT use JavaScript Number for money
    - Must configure timezone as Africa/Johannesburg
    - Must follow naming conventions from constitution
    - Environment variables must be validated on startup
  </constraints>

  <verification>
    - npm run build compiles without errors
    - npm run lint passes with no warnings
    - npm run test passes (base tests)
    - Application starts and responds to /health endpoint
    - Database connection established
  </verification>
</definition_of_done>

<pseudo_code>
Project Initialization:
  nest new crechebooks --package-manager pnpm
  cd crechebooks

Dependencies:
  pnpm add @nestjs/config @prisma/client decimal.js winston bull
  pnpm add -D prisma eslint-config-prettier @types/node

Configuration Module (src/config/configuration.ts):
  export default () => ({
    port: parseInt(process.env.PORT, 10) || 3000,
    database: {
      url: process.env.DATABASE_URL,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    },
    timezone: 'Africa/Johannesburg',
    vat: {
      rate: 0.15,
      registrationThreshold: 1000000_00, // R1M in cents
    }
  });

Money Utility (src/shared/utils/decimal.util.ts):
  import Decimal from 'decimal.js';

  // Configure Decimal.js for financial calculations
  Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

  export class Money:
    static fromCents(cents: number): Decimal
      return new Decimal(cents).dividedBy(100)

    static toCents(amount: Decimal): number
      return amount.times(100).round().toNumber()

    static round(value: Decimal): Decimal
      return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)

Exception Classes (src/shared/exceptions/base.exception.ts):
  export class AppException extends Error:
    constructor(message: string, public code: string, public statusCode: number)

  export class ValidationException extends AppException:
    constructor(message: string, public details: ValidationError[])
      super(message, 'VALIDATION_ERROR', 400)
</pseudo_code>

<files_to_create>
  <file path="package.json">Package configuration with dependencies</file>
  <file path="tsconfig.json">TypeScript configuration</file>
  <file path=".env.example">Environment variable template</file>
  <file path="prisma/schema.prisma">Prisma schema (base configuration only)</file>
  <file path="src/main.ts">Application entry point</file>
  <file path="src/app.module.ts">Root module</file>
  <file path="src/config/configuration.ts">Configuration module</file>
  <file path="src/config/config.module.ts">Config module definition</file>
  <file path="src/shared/utils/decimal.util.ts">Money/Decimal utilities</file>
  <file path="src/shared/utils/date.util.ts">Date utilities (SA timezone)</file>
  <file path="src/shared/exceptions/base.exception.ts">Base exception classes</file>
  <file path="src/shared/exceptions/index.ts">Exception exports</file>
  <file path="src/shared/constants/index.ts">Shared constants (VAT_RATE, etc.)</file>
  <file path="src/shared/interfaces/index.ts">Shared interfaces</file>
  <file path="src/health/health.controller.ts">Health check endpoint</file>
  <file path="src/health/health.module.ts">Health module</file>
  <file path="jest.config.js">Jest configuration</file>
  <file path=".eslintrc.js">ESLint configuration</file>
  <file path=".prettierrc">Prettier configuration</file>
  <file path="tests/shared/utils/decimal.util.spec.ts">Money utility tests</file>
</files_to_create>

<files_to_modify>
  <!-- First task - no existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>Project compiles with TypeScript</criterion>
  <criterion>ESLint passes with no errors or warnings</criterion>
  <criterion>Health endpoint returns 200 OK</criterion>
  <criterion>Database connection configurable via environment</criterion>
  <criterion>Money.round() uses banker's rounding (test with 2.5 -> 2, 3.5 -> 4)</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test</command>
  <command>npm run start:dev</command>
  <command>curl http://localhost:3000/health</command>
</test_commands>

</task_spec>
