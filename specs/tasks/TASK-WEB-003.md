<task_spec id="TASK-WEB-003" version="1.0">

<metadata>
  <title>API Client and React Query Setup</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>3</sequence>
  <implements>
    <requirement_ref>REQ-WEB-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Set up the API client layer using Axios with proper request/response interceptors, and configure TanStack React Query for server state management. This establishes the data fetching patterns used throughout the application.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md</file>
  <file purpose="shared_types">packages/types/src/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed</check>
  <check>@tanstack/react-query installed</check>
  <check>axios installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Axios instance with base configuration
    - Add request interceptor for auth token
    - Add response interceptor for error handling
    - Configure React Query client
    - Create typed API hooks for each domain
    - Set up query key factories
  </in_scope>
  <out_of_scope>
    - Authentication logic (TASK-WEB-004)
    - Specific page implementations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/lib/api/client.ts">
      export const apiClient: AxiosInstance
    </signature>
    <signature file="apps/web/src/lib/api/query-client.ts">
      export const queryClient: QueryClient
    </signature>
    <signature file="apps/web/src/hooks/use-transactions.ts">
      export function useTransactions(params?: TransactionQueryParams): UseQueryResult&lt;...&gt;
    </signature>
  </signatures>

  <constraints>
    - Must use shared types from @crechebooks/types
    - Must handle 401 errors with redirect to login
    - Must implement proper error typing
    - Query keys must be organized by domain
  </constraints>

  <verification>
    - API client makes requests with correct headers
    - React Query caches responses correctly
    - Error handling triggers appropriate UI feedback
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/lib/api/client.ts">Axios client instance</file>
  <file path="apps/web/src/lib/api/query-client.ts">React Query client</file>
  <file path="apps/web/src/lib/api/query-keys.ts">Query key factories</file>
  <file path="apps/web/src/lib/api/endpoints.ts">API endpoint definitions</file>
  <file path="apps/web/src/hooks/use-transactions.ts">Transaction query hooks</file>
  <file path="apps/web/src/hooks/use-invoices.ts">Invoice query hooks</file>
  <file path="apps/web/src/hooks/use-payments.ts">Payment query hooks</file>
  <file path="apps/web/src/hooks/use-sars.ts">SARS query hooks</file>
  <file path="apps/web/src/hooks/use-reconciliation.ts">Reconciliation query hooks</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/components/providers.tsx">Add QueryClientProvider</file>
</files_to_modify>

<validation_criteria>
  <criterion>API client configured with correct base URL</criterion>
  <criterion>Auth token attached to requests when available</criterion>
  <criterion>Query hooks return properly typed data</criterion>
  <criterion>No TypeScript errors</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
  <command>cd apps/web && pnpm lint</command>
</test_commands>

</task_spec>
