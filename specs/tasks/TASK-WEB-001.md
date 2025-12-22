<task_spec id="TASK-WEB-001" version="1.0">

<metadata>
  <title>Next.js Project Setup and Configuration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>1</sequence>
  <implements>
    <requirement_ref>REQ-WEB-14</requirement_ref>
    <requirement_ref>REQ-WEB-15</requirement_ref>
  </implements>
  <depends_on>
    <!-- None - first web task -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This is the foundational task for the CrecheBooks web application. It sets up the Next.js 15 project with App Router, configures TypeScript, Tailwind CSS, and establishes the base project structure. The apps/web directory has been created; this task completes the core configuration files.
</context>

<input_context_files>
  <file purpose="directory_structure">specs/constitution.md#directory_structure</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_config">apps/web/package.json</file>
  <file purpose="existing_config">apps/web/tsconfig.json</file>
</input_context_files>

<prerequisites>
  <check>pnpm workspace configured</check>
  <check>apps/web directory exists</check>
  <check>Node.js 20+ installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Configure Next.js with App Router
    - Set up Tailwind CSS with CrecheBooks theme
    - Create base layout with dark mode support
    - Configure path aliases
    - Set up environment variables structure
  </in_scope>
  <out_of_scope>
    - UI component library (TASK-WEB-002)
    - API client setup (TASK-WEB-003)
    - Authentication (TASK-WEB-004)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/next.config.ts">
      const nextConfig: NextConfig = { ... }
    </signature>
    <signature file="apps/web/tailwind.config.ts">
      const config: Config = { ... }
    </signature>
    <signature file="apps/web/src/app/layout.tsx">
      export default function RootLayout({ children }: { children: React.ReactNode })
    </signature>
  </signatures>

  <constraints>
    - Must use Next.js 15 with App Router
    - Must support dark mode via next-themes
    - Must use Tailwind CSS with shadcn/ui compatible config
    - Environment variables must follow .env.example pattern
  </constraints>

  <verification>
    - pnpm --filter @crechebooks/web dev starts without errors
    - Page renders at localhost:3001
    - Dark mode toggle works
    - No TypeScript errors
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/.env.example">Environment variables template</file>
  <file path="apps/web/.env.local">Local environment (gitignored)</file>
  <file path="apps/web/next-env.d.ts">Next.js TypeScript declarations</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/next.config.ts">Add API proxy and env config</file>
  <file path="apps/web/src/app/layout.tsx">Complete root layout</file>
</files_to_modify>

<validation_criteria>
  <criterion>Next.js dev server starts successfully</criterion>
  <criterion>Tailwind styles apply correctly</criterion>
  <criterion>Dark mode toggles between light and dark</criterion>
  <criterion>No TypeScript or ESLint errors</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm dev</command>
  <command>cd apps/web && pnpm lint</command>
  <command>cd apps/web && pnpm type-check</command>
</test_commands>

</task_spec>
