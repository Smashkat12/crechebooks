<task_spec id="TASK-PAY-021" version="2.0">

<metadata>
  <title>Complete Payroll Processing Frontend Integration</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>271</sequence>
  <implements>
    <requirement_ref>REQ-PAY-PROCESS-001</requirement_ref>
    <requirement_ref>REQ-PAY-XERO-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-011</task_ref>
    <task_ref status="complete">TASK-SARS-012</task_ref>
    <task_ref status="complete">TASK-STAFF-003</task_ref>
    <task_ref status="complete">TASK-SPAY-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/staff/payroll/page.tsx` (complete TODO stub)
  - `apps/web/src/hooks/use-staff.ts` (add payroll processing mutations)
  - `apps/web/src/lib/api/endpoints.ts` (add payroll processing endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (add payroll journal query keys)
  - `apps/web/src/components/staff/payroll-wizard.tsx` (add loading states, error handling)

  **Files to Create:**
  - `apps/web/src/hooks/use-payroll-processing.ts` (NEW - payroll processing hook)
  - `apps/web/src/lib/api/payroll.ts` (NEW - payroll API client functions)

  **Current Problem:**
  The payroll page has a stub implementation that does nothing:
  ```typescript
  const handleComplete = async (selectedStaff: string[], payrollEntries: IPayrollEntry[]): Promise<void> => {
    // TODO: Implement actual payroll processing
    router.push('/staff');
  };
  ```

  **Backend APIs Available (TASK-PAY-011, TASK-STAFF-003):**
  - `POST /api/v1/payroll/process` - Process payroll for staff (creates Payroll records)
  - `POST /api/v1/xero/payroll-journals` - Create Xero journal from payroll
  - `POST /api/v1/xero/payroll-journals/generate` - Generate journals for pay period
  - `POST /api/v1/xero/payroll-journals/:journalId/post` - Post journal to Xero
  - `POST /api/v1/xero/payroll-journals/bulk-post` - Bulk post journals to Xero

  **Backend Services Available:**
  - `PayeService` - PAYE calculations with 2025 SARS tax tables
  - `UifService` - UIF contributions (1% employee + 1% employer, R17,712 cap)
  - `XeroPayrollJournalService` - Journal creation and Xero posting
  - `SimplePayPayRunService` - SimplePay integration (if tenant uses SimplePay)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. API Client Pattern (from `apps/web/src/lib/api/client.ts`)
  ```typescript
  import axios, { AxiosError } from 'axios';
  import { getSession } from 'next-auth/react';

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  export const apiClient = axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
    withCredentials: true,
  });
  ```

  ### 3. React Query Mutation Pattern (from `apps/web/src/hooks/use-staff.ts`)
  ```typescript
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Mutation hook pattern
  export function useProcessPayroll() {
    const queryClient = useQueryClient();

    return useMutation<PayrollProcessResult, AxiosError, ProcessPayrollParams>({
      mutationFn: async ({ month, year, staffIds, entries }) => {
        const { data } = await apiClient.post<PayrollProcessResult>(
          endpoints.payroll.process,
          { month, year, staffIds, entries }
        );
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      },
    });
  }
  ```

  ### 4. Query Keys Pattern (from `apps/web/src/lib/api/query-keys.ts`)
  ```typescript
  export const queryKeys = {
    payroll: {
      all: ['payroll'] as const,
      list: (params?: Record<string, unknown>) => [...queryKeys.payroll.all, 'list', params] as const,
      detail: (id: string) => [...queryKeys.payroll.all, 'detail', id] as const,
    },
    xeroJournals: {
      all: ['xeroJournals'] as const,
      list: (params?: Record<string, unknown>) => [...queryKeys.xeroJournals.all, 'list', params] as const,
      pending: () => [...queryKeys.xeroJournals.all, 'pending'] as const,
      stats: () => [...queryKeys.xeroJournals.all, 'stats'] as const,
    },
  } as const;
  ```

  ### 5. Endpoints Pattern (from `apps/web/src/lib/api/endpoints.ts`)
  ```typescript
  export const endpoints = {
    payroll: {
      list: '/payroll',
      detail: (id: string) => `/payroll/${id}`,
      process: '/payroll/process',
    },
    xeroJournals: {
      list: '/xero/payroll-journals',
      create: '/xero/payroll-journals',
      generate: '/xero/payroll-journals/generate',
      stats: '/xero/payroll-journals/stats',
      pending: '/xero/payroll-journals/pending',
      post: (id: string) => `/xero/payroll-journals/${id}/post`,
      bulkPost: '/xero/payroll-journals/bulk-post',
    },
  } as const;
  ```

  ### 6. Error Handling with Toast Pattern
  ```typescript
  import { toast } from 'sonner';

  const processPayroll = useProcessPayroll();

  const handleComplete = async (selectedStaff: string[], payrollEntries: IPayrollEntry[]) => {
    try {
      await processPayroll.mutateAsync({
        month,
        year,
        staffIds: selectedStaff,
        entries: payrollEntries,
      });
      toast.success('Payroll processed successfully');
      router.push('/staff');
    } catch (error) {
      if (error instanceof AxiosError) {
        const message = error.response?.data?.message || 'Failed to process payroll';
        toast.error(message);
      } else {
        toast.error('An unexpected error occurred');
      }
    }
  };
  ```

  ### 7. Loading State Pattern
  ```typescript
  const [isProcessing, setIsProcessing] = useState(false);

  const handleComplete = async (...) => {
    setIsProcessing(true);
    try {
      // Step 1: Process payroll
      const result = await processPayroll.mutateAsync({ ... });

      // Step 2: Create Xero journals (if Xero connected)
      if (xeroStatus?.connected) {
        await createJournals.mutateAsync({ ... });
      }

      toast.success('Payroll processed successfully');
    } finally {
      setIsProcessing(false);
    }
  };
  ```

  ### 8. Monetary Values - CENTS ALWAYS
  All monetary values are stored and transmitted as integers in cents (R1.00 = 100).
  Use `Decimal.js` for calculations, convert to cents for storage/API.
  ```typescript
  // From PayrollWizard - already uses cents correctly
  return {
    grossSalary: staffMember.salary, // Already in cents
    paye: Math.round(paye * 100),    // Convert to cents
    uif: Math.round(uif.employee * 100),
    netSalary: Math.round((grossSalary - paye - uif.employee) * 100),
  };
  ```

  ### 9. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  pnpm test:web           # Web-specific tests
  ```
</critical_patterns>

<context>
This task wires the payroll wizard frontend to the backend APIs to complete the full payroll processing flow.

**South African Payroll Requirements:**
1. **PAYE (Pay-As-You-Earn)** - Calculated using SARS tax tables (already implemented in PayeService)
   - 2025 tax brackets with primary/secondary/tertiary rebates
   - Medical aid tax credits
   - Age-based thresholds
2. **UIF (Unemployment Insurance Fund)** - 1% employee + 1% employer (already implemented in UifService)
   - Monthly ceiling: R17,712
   - Max contribution: R177.12 per party
3. **SDL (Skills Development Levy)** - 1% of gross payroll (employer only, if applicable)
4. **ETI (Employment Tax Incentive)** - For qualifying young employees

**Payroll Processing Flow:**
1. User selects staff members in PayrollWizard (already implemented)
2. Frontend calculates PAYE/UIF preview (already implemented)
3. **User clicks "Process Payroll"** -> API call with entries
4. Backend creates Payroll records with server-side PAYE/UIF calculations
5. Backend creates Xero journal entries (if Xero connected)
6. Backend triggers payslip generation (async via queue)
7. Frontend shows success and redirects

**Xero Integration:**
- Payroll journals post as Manual Journals to Xero
- Journal entries: Salary Expense (DR), PAYE/UIF/Net Pay (CR)
- Rate limits: 60/min, 5000/day
- Must check Xero connection status before posting
</context>

<scope>
  <in_scope>
    - Wire handleComplete to call POST /payroll/process API
    - Create usePayrollProcessing hook with mutations
    - Add endpoints and query keys for payroll processing
    - Add Xero journal creation after payroll processing
    - Add loading states to PayrollWizard during processing
    - Add error handling with toast notifications
    - Add success state with summary of processed payroll
    - Invalidate relevant queries on success
    - Handle partial failures gracefully (some staff fail, others succeed)
  </in_scope>
  <out_of_scope>
    - Backend API changes (already implemented)
    - PAYE/UIF calculation changes (use backend calculations)
    - SimplePay integration (separate task TASK-SPAY-*)
    - Payslip PDF generation UI (separate task)
    - Bulk payslip email sending UI (separate task)
    - Historical payroll editing (immutable once processed)
  </out_of_scope>
</scope>

<api_reference>
## Backend API Endpoints

### POST /api/v1/payroll/process
Process payroll for selected staff members.
```typescript
// Request
interface ProcessPayrollRequest {
  month: number;           // 1-12
  year: number;            // e.g., 2026
  staffIds: string[];      // Staff IDs to process
}

// Response
interface ProcessPayrollResponse {
  success: boolean;
  count: number;           // Number of payroll records created
  payrollIds: string[];    // Created payroll record IDs
  errors?: Array<{
    staffId: string;
    error: string;
  }>;
}
```

### POST /api/v1/xero/payroll-journals/generate
Generate Xero journals for a pay period.
```typescript
// Request
interface GenerateJournalsRequest {
  payrollPeriodStart: string;  // ISO date
  payrollPeriodEnd: string;    // ISO date
}

// Response
interface GenerateJournalsResponse {
  created: PayrollJournalWithRelations[];
  skipped: Array<{
    payrollId: string;
    reason: string;
  }>;
}
```

### POST /api/v1/xero/payroll-journals/bulk-post
Bulk post journals to Xero.
```typescript
// Request
interface BulkPostRequest {
  journalIds: string[];
}

// Response
interface BulkPostResult {
  total: number;
  posted: number;
  failed: number;
  results: Array<{
    journalId: string;
    payrollId: string;
    status: 'POSTED' | 'FAILED';
    xeroJournalId?: string;
    errorMessage?: string;
  }>;
}
```

### GET /api/v1/xero/status
Check Xero connection status.
```typescript
// Response
interface XeroStatusResponse {
  connected: boolean;
  organizationName?: string;
  lastSync?: string;
}
```
</api_reference>

<implementation_guide>
## Step-by-Step Implementation

### Step 1: Add Endpoints (apps/web/src/lib/api/endpoints.ts)
```typescript
export const endpoints = {
  // ... existing endpoints ...
  payroll: {
    list: '/payroll',
    detail: (id: string) => `/payroll/${id}`,
    process: '/payroll/process',
  },
  xeroJournals: {
    list: '/xero/payroll-journals',
    create: '/xero/payroll-journals',
    generate: '/xero/payroll-journals/generate',
    stats: '/xero/payroll-journals/stats',
    pending: '/xero/payroll-journals/pending',
    post: (id: string) => `/xero/payroll-journals/${id}/post`,
    bulkPost: '/xero/payroll-journals/bulk-post',
  },
} as const;
```

### Step 2: Add Query Keys (apps/web/src/lib/api/query-keys.ts)
```typescript
export const queryKeys = {
  // ... existing keys ...
  xeroJournals: {
    all: ['xeroJournals'] as const,
    lists: () => [...queryKeys.xeroJournals.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.xeroJournals.lists(), params] as const,
    pending: () => [...queryKeys.xeroJournals.all, 'pending'] as const,
    stats: () => [...queryKeys.xeroJournals.all, 'stats'] as const,
  },
} as const;
```

### Step 3: Create Payroll Processing Hook (apps/web/src/hooks/use-payroll-processing.ts)
```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

interface ProcessPayrollParams {
  month: number;
  year: number;
  staffIds: string[];
}

interface ProcessPayrollResult {
  success: boolean;
  count: number;
  payrollIds: string[];
  errors?: Array<{ staffId: string; error: string }>;
}

interface GenerateJournalsParams {
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
}

interface GenerateJournalsResult {
  created: Array<{ id: string; payrollId: string }>;
  skipped: Array<{ payrollId: string; reason: string }>;
}

interface BulkPostResult {
  total: number;
  posted: number;
  failed: number;
  results: Array<{
    journalId: string;
    payrollId: string;
    status: 'POSTED' | 'FAILED';
    xeroJournalId?: string;
    errorMessage?: string;
  }>;
}

export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation<ProcessPayrollResult, AxiosError, ProcessPayrollParams>({
    mutationFn: async ({ month, year, staffIds }) => {
      const { data } = await apiClient.post<ProcessPayrollResult>(
        endpoints.payroll.process,
        { month, year, staffIds }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

export function useGenerateXeroJournals() {
  const queryClient = useQueryClient();

  return useMutation<GenerateJournalsResult, AxiosError, GenerateJournalsParams>({
    mutationFn: async ({ payrollPeriodStart, payrollPeriodEnd }) => {
      const { data } = await apiClient.post<GenerateJournalsResult>(
        endpoints.xeroJournals.generate,
        { payrollPeriodStart, payrollPeriodEnd }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroJournals.all });
    },
  });
}

export function useBulkPostXeroJournals() {
  const queryClient = useQueryClient();

  return useMutation<BulkPostResult, AxiosError, { journalIds: string[] }>({
    mutationFn: async ({ journalIds }) => {
      const { data } = await apiClient.post<BulkPostResult>(
        endpoints.xeroJournals.bulkPost,
        { journalIds }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroJournals.all });
    },
  });
}

export function useXeroStatus() {
  return useQuery({
    queryKey: queryKeys.xero.status(),
    queryFn: async () => {
      const { data } = await apiClient.get<{
        connected: boolean;
        organizationName?: string;
      }>(endpoints.xero.status);
      return data;
    },
    staleTime: 60000, // 1 minute
  });
}
```

### Step 4: Update Payroll Page (apps/web/src/app/(dashboard)/staff/payroll/page.tsx)
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollWizard } from '@/components/staff';
import { useStaffList } from '@/hooks/use-staff';
import {
  useProcessPayroll,
  useGenerateXeroJournals,
  useBulkPostXeroJournals,
  useXeroStatus,
} from '@/hooks/use-payroll-processing';
import type { IPayrollEntry } from '@crechebooks/types';

export default function PayrollPage() {
  const router = useRouter();
  const { data } = useStaffList({ status: 'active' });
  const { data: xeroStatus } = useXeroStatus();
  const now = new Date();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const processPayroll = useProcessPayroll();
  const generateJournals = useGenerateXeroJournals();
  const bulkPostJournals = useBulkPostXeroJournals();

  const handleComplete = async (
    selectedStaff: string[],
    payrollEntries: IPayrollEntry[]
  ): Promise<void> => {
    if (selectedStaff.length === 0) {
      toast.error('No staff members selected');
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Process payroll
      setProcessingStep('Processing payroll...');
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const result = await processPayroll.mutateAsync({
        month,
        year,
        staffIds: selectedStaff,
      });

      if (!result.success) {
        throw new Error('Payroll processing failed');
      }

      // Report partial failures
      if (result.errors && result.errors.length > 0) {
        const failedCount = result.errors.length;
        toast.warning(
          `Processed ${result.count} staff, ${failedCount} failed`,
          { description: result.errors[0].error }
        );
      }

      // Step 2: Create Xero journals (if Xero connected)
      if (xeroStatus?.connected) {
        setProcessingStep('Creating Xero journal entries...');

        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0);

        const journalResult = await generateJournals.mutateAsync({
          payrollPeriodStart: periodStart.toISOString(),
          payrollPeriodEnd: periodEnd.toISOString(),
        });

        // Step 3: Post journals to Xero (optional - could be manual step)
        if (journalResult.created.length > 0) {
          setProcessingStep('Posting to Xero...');
          const journalIds = journalResult.created.map((j) => j.id);

          const postResult = await bulkPostJournals.mutateAsync({ journalIds });

          if (postResult.failed > 0) {
            toast.warning(
              `Posted ${postResult.posted}/${postResult.total} journals to Xero`
            );
          }
        }
      }

      // Success
      toast.success(
        `Payroll processed for ${result.count} staff members`,
        { description: xeroStatus?.connected ? 'Xero journals created' : undefined }
      );

      router.push('/staff');
    } catch (error) {
      if (error instanceof AxiosError) {
        const message =
          error.response?.data?.message || 'Failed to process payroll';
        toast.error(message);
      } else if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('An unexpected error occurred');
      }
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon" disabled={isProcessing}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Process monthly payroll for staff members
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statutory Deductions</CardTitle>
          <CardDescription>
            Standard South African payroll deductions applied automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">PAYE</span>
              <p className="text-muted-foreground">
                Pay As You Earn tax per SARS brackets
              </p>
            </div>
            <div>
              <span className="font-medium">UIF</span>
              <p className="text-muted-foreground">
                1% employee + 1% employer contribution
              </p>
            </div>
            <div>
              <span className="font-medium">SDL</span>
              <p className="text-muted-foreground">
                Skills Development Levy (if applicable)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Overlay */}
      {isProcessing && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <p className="font-medium">Processing Payroll</p>
              <p className="text-sm text-muted-foreground">{processingStep}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <PayrollWizard
        month={now.getMonth() + 1}
        year={now.getFullYear()}
        staff={data?.staff ?? []}
        onComplete={handleComplete}
        onCancel={() => router.push('/staff')}
        isLoading={isProcessing}
      />
    </div>
  );
}
```

### Step 5: Update PayrollWizard for Better Loading States
Add to `apps/web/src/components/staff/payroll-wizard.tsx`:
```typescript
// Add to the props check
if (isLoading) {
  // Disable all interactions during processing
}

// Update the confirm button
<Button onClick={handleConfirm} disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Processing...
    </>
  ) : (
    'Process Payroll'
  )}
</Button>
```
</implementation_guide>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints to endpoints.ts
# Edit apps/web/src/lib/api/endpoints.ts

# 2. Add query keys to query-keys.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 3. Create payroll processing hook
# Create apps/web/src/hooks/use-payroll-processing.ts

# 4. Update payroll page
# Edit apps/web/src/app/(dashboard)/staff/payroll/page.tsx

# 5. Update payroll wizard (optional loading improvements)
# Edit apps/web/src/components/staff/payroll-wizard.tsx

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test:web            # Must show all tests passing

# 7. Manual Testing Steps
# a. Start dev servers: pnpm dev
# b. Navigate to /staff/payroll
# c. Select staff members
# d. Click through wizard to "Process Payroll"
# e. Verify:
#    - Loading state shows during processing
#    - Toast notification on success
#    - Redirects to /staff after completion
#    - If Xero connected: journals are created
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All API calls use cents for monetary values
    - Xero journal creation only occurs if Xero is connected
    - Partial failures are reported but don't block entire process
    - Loading state prevents double-submission
    - Error messages are user-friendly (not raw API errors)
    - Query invalidation updates related pages
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test:web: all tests passing
    - Manual: Can process payroll for selected staff
    - Manual: Loading state displays during processing
    - Manual: Success toast shows after completion
    - Manual: Redirects to /staff after success
    - Manual: Error toast shows on failure
    - Manual: Xero journals created when Xero connected
    - Manual: Partial failures show warning toast
    - Manual: Cannot double-click submit
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Store monetary values as floats (always use cents as integers)
  - Skip loading states during API calls
  - Show raw API error messages to users
  - Assume Xero is always connected
  - Allow double-submission of payroll
  - Forget to invalidate related queries
  - Hard-code API URLs (use endpoints object)
  - Skip error handling for mutations
  - Use localStorage for sensitive data (use in-memory or HttpOnly cookies)
</anti_patterns>

<test_cases>
  ## Required Test Coverage

  ### Unit Tests (apps/web/src/hooks/__tests__/use-payroll-processing.spec.ts)
  ```typescript
  describe('useProcessPayroll', () => {
    it('should call POST /payroll/process with correct params', async () => {});
    it('should invalidate payroll and staff queries on success', async () => {});
    it('should handle partial failures', async () => {});
    it('should handle network errors', async () => {});
  });

  describe('useGenerateXeroJournals', () => {
    it('should call POST /xero/payroll-journals/generate', async () => {});
    it('should handle skipped payrolls', async () => {});
  });

  describe('useBulkPostXeroJournals', () => {
    it('should call POST /xero/payroll-journals/bulk-post', async () => {});
    it('should report partial post failures', async () => {});
  });
  ```

  ### Integration Tests
  ```typescript
  describe('PayrollPage', () => {
    it('should show loading state during processing', async () => {});
    it('should show success toast and redirect on completion', async () => {});
    it('should show error toast on failure', async () => {});
    it('should skip Xero if not connected', async () => {});
    it('should disable submit button while processing', async () => {});
  });
  ```
</test_cases>

</task_spec>
