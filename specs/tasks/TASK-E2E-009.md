<task_spec id="TASK-E2E-009" version="1.0">

<metadata>
  <title>E2E Bug - React Hydration Error on Arrears Page</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>162</sequence>
  <priority>P3-LOW</priority>
  <implements>
    <requirement_ref>PAY-ARR-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - UI bug fix -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

During comprehensive Playwright E2E testing, the Arrears page triggers a React hydration error.

## Error Details
```
Console Error: Hydration failed because the server rendered text didn't match the client.
Page: /arrears
```

## Steps to Reproduce
1. Navigate to /arrears
2. Wait for page to load
3. Observe console error about hydration mismatch

## Root Cause
React hydration errors occur when the server-rendered HTML doesn't match the client-side React render. Common causes:
1. Date/time formatting differences between server and client
2. Currency formatting with locale differences
3. Random/dynamic content that differs between renders
4. Conditional rendering based on client-only data

## Likely Culprit
The Arrears page displays:
- Total Outstanding: R 333,333.00
- 90+ Days Overdue: R 333,333.00
- Accounts in Arrears: 1

The currency formatting or date formatting may differ between SSR and CSR.

## Impact
- **User Experience**: Page may flash or rerender unexpectedly
- **Performance**: Hydration mismatch causes React to discard server HTML
- **SEO**: May affect SEO if content differs

## Pages Affected
- /arrears

</context>

<input_context_files>
  <file purpose="page">apps/web/src/app/(dashboard)/arrears/page.tsx</file>
  <file purpose="component">apps/web/src/components/arrears/</file>
  <file purpose="formatting">apps/web/src/lib/utils.ts</file>
</input_context_files>

<prerequisites>
  <check>Arrears page loads without 500 error</check>
  <check>Data displays correctly despite hydration warning</check>
</prerequisites>

<scope>
  <in_scope>
    - Identify the specific hydration mismatch cause
    - Fix the formatting/rendering to be consistent between server and client
    - Suppress hydration warning if intentional difference
  </in_scope>
  <out_of_scope>
    - Refactoring arrears functionality
    - Adding new features
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - No hydration error in console
    - Arrears page renders correctly
    - Data displays consistently between SSR and CSR
  </constraints>

  <verification>
    - Navigate to /arrears
    - Check browser console for hydration errors
    - Verify page displays correctly
    - Verify data is accurate
  </verification>
</definition_of_done>

<fix_steps>
1. Identify which component causes the hydration mismatch
2. Check currency formatting functions (formatCurrency, etc.)
3. Use suppressHydrationWarning if intentional (e.g., client-only date)
4. Or fix formatting to be consistent between server and client
5. Consider using useEffect for client-only data
6. Test the fix
</fix_steps>

<common_fixes>
```tsx
// Option 1: Suppress warning for intentional differences
<span suppressHydrationWarning>{formatCurrency(amount)}</span>

// Option 2: Client-only rendering
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <Skeleton />;

// Option 3: Use consistent formatting
// Ensure Intl.NumberFormat uses same locale on server and client
```
</common_fixes>

</task_spec>
