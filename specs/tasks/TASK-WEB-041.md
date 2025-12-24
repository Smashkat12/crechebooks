<task_spec id="TASK-WEB-041" version="1.0">

<metadata>
  <title>SARS VAT201 Real Data Hook</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>120</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-WEB-09</requirement_ref>
    <critical_issue_ref>CRIT-002</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-SARS-001</task_ref>
    <task_ref status="COMPLETE">TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use frontend integration thinking.
This task involves:
1. Replace hardcoded mock data
2. Create useSarsVat201 hook
3. Connect to API endpoint
4. Handle loading/error states
5. Display real VAT calculations
</reasoning_mode>

<context>
CRITICAL BUG: SARS VAT201 page displays FAKE mock data instead of real API data.

File: `apps/web/src/app/(dashboard)/sars/vat201/page.tsx:17-25`

REQ-WEB-09 specifies: "Preview SARS submissions in correct format."

This task removes hardcoded mock data and connects to the real API.
</context>

<current_state>
## Codebase State
- VAT201 page exists with hardcoded MOCK data
- SARS API endpoints exist
- No useSarsVat201 hook
- Fake tax figures displayed

## What Exists
- GET /api/sars/vat201 endpoint
- VAT201FormData type
- SARS calculation service
</current_state>

<input_context_files>
  <file purpose="page_to_fix">apps/web/src/app/(dashboard)/sars/vat201/page.tsx</file>
  <file purpose="api_endpoint">apps/api/src/sars/sars.controller.ts</file>
  <file purpose="types">apps/api/src/sars/types/vat201.types.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Create useSarsVat201 hook
    - Remove hardcoded mock data
    - Connect to GET /api/sars/vat201
    - Loading spinner during fetch
    - Error message on failure
    - Empty state for no data
  </in_scope>
  <out_of_scope>
    - API endpoint changes (exists)
    - VAT calculation logic (backend)
    - PDF export (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/hooks/useSarsVat201.ts">
      export function useSarsVat201(period: string) {
        return useQuery<VAT201Data, Error>({
          queryKey: ['sars', 'vat201', period],
          queryFn: () => fetchVat201(period),
          enabled: !!period,
        });
      }

      async function fetchVat201(period: string): Promise<VAT201Data>;
    </signature>
    <signature file="apps/web/src/types/sars.types.ts">
      export interface VAT201Data {
        period: string;
        outputVat: number;
        inputVat: number;
        netVat: number;
        standardRatedSales: number;
        zeroRatedSales: number;
        exemptSales: number;
        standardRatedPurchases: number;
        capitalGoods: number;
        dueDate: string;
        isSubmitted: boolean;
      }
    </signature>
  </signatures>

  <constraints>
    - Use @tanstack/react-query for data fetching
    - Handle period selection from URL params
    - Show loading spinner centered in container
    - Show error message with retry button
    - Show empty state for no transactions
    - VAT figures must match backend exactly
  </constraints>

  <verification>
    - No hardcoded mock data in component
    - Hook fetches from real API
    - Loading state shows spinner
    - Error state shows message
    - VAT figures match backend
    - E2E test verifies real data
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/hooks/useSarsVat201.ts">Data fetching hook</file>
  <file path="apps/web/src/types/sars.types.ts">TypeScript types</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/sars/vat201/page.tsx">Remove mock, use hook</file>
</files_to_modify>

<validation_criteria>
  <criterion>No hardcoded mock data</criterion>
  <criterion>Hook fetches real data</criterion>
  <criterion>Loading state works</criterion>
  <criterion>Error state works</criterion>
  <criterion>VAT figures accurate</criterion>
  <criterion>E2E test passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="sars" --verbose</command>
  <command>npm run e2e --filter=web -- --grep="VAT201"</command>
</test_commands>

</task_spec>
