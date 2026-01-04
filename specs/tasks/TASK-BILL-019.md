<task_spec id="TASK-BILL-019" version="1.0">

<metadata>
  <title>Enrollment Register Dedicated View</title>
  <status>pending</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>131</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
    <user_story_ref>US-BILL-003</user_story_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-WEB-037</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-011</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use data table and CRUD interface design patterns.
This task involves:
1. Creating a dedicated enrollment register page
2. Displaying all enrollments with status filters
3. Search and filter by child, parent, fee tier
4. Quick actions (edit, deactivate, view invoices)
5. Bulk operations (activate, deactivate)
6. Export functionality
</reasoning_mode>

<context>
GAP: REQ-BILL-009 specifies "Enrollment register maintained with child, parent, start date, end date, fee tier."

Current state: Child management exists (TASK-WEB-037) but there's no dedicated enrollment register view that shows:
- All enrollments across children
- Active vs inactive enrollments
- Enrollment history
- Fee tier assignments
- Quick filtering and search

This is distinct from child management - it's an operational view of who is currently enrolled and their billing status.
</context>

<current_state>
## Codebase State
- Child entity exists with enrollment data
- Parent entity exists
- FeeStructure and Enrollment entities exist
- EnrollmentManagementService exists (TASK-BILL-011)
- Child management page exists at apps/web/src/app/(dashboard)/children/
- No dedicated enrollment register view

## Enrollment Entity (from TASK-BILL-002)
```typescript
interface Enrollment {
  id: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'inactive' | 'pending';
  siblingDiscount: boolean;
}
```
</current_state>

<input_context_files>
  <file purpose="enrollment_entity">apps/api/src/database/entities/enrollment.entity.ts</file>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment-management.service.ts</file>
  <file purpose="children_page">apps/web/src/app/(dashboard)/children/page.tsx</file>
  <file purpose="fee_structure">apps/api/src/database/entities/fee-structure.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Dedicated /enrollments page
    - Enrollment list with all fields
    - Status filter (active, inactive, pending, all)
    - Search by child name, parent name
    - Filter by fee tier
    - Sortable columns
    - Quick edit enrollment
    - View enrollment history
    - Bulk status change
    - Export to CSV/Excel
  </in_scope>
  <out_of_scope>
    - Creating new enrollments (use child management)
    - Fee structure management (separate page)
    - Invoice generation (separate flow)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/enrollments/page.tsx">
      export default function EnrollmentsPage(): JSX.Element;
      // Server component with enrollment data fetching
    </signature>
    <signature file="apps/web/src/components/enrollments/EnrollmentTable.tsx">
      export interface EnrollmentTableProps {
        enrollments: EnrollmentWithDetails[];
        onEdit: (enrollment: Enrollment) => void;
        onStatusChange: (ids: string[], status: EnrollmentStatus) => void;
        onExport: (format: 'csv' | 'xlsx') => void;
      }

      export function EnrollmentTable({
        enrollments,
        onEdit,
        onStatusChange,
        onExport,
      }: EnrollmentTableProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/enrollments/EnrollmentFilters.tsx">
      export interface EnrollmentFiltersProps {
        filters: EnrollmentFilters;
        onFilterChange: (filters: EnrollmentFilters) => void;
        feeTiers: FeeStructure[];
      }

      export function EnrollmentFilters({
        filters,
        onFilterChange,
        feeTiers,
      }: EnrollmentFiltersProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/hooks/useEnrollments.ts">
      export function useEnrollments(filters: EnrollmentFilters): {
        enrollments: EnrollmentWithDetails[];
        isLoading: boolean;
        error: Error | null;
        refetch: () => void;
        updateStatus: (ids: string[], status: EnrollmentStatus) => Promise<void>;
        exportData: (format: 'csv' | 'xlsx') => Promise<void>;
      };
    </signature>
  </signatures>

  <constraints>
    - Show child name, parent name, fee tier, start date, end date, status
    - Active enrollments shown by default
    - Pagination for large lists (50 per page)
    - Real-time search (debounced 300ms)
    - Bulk select with shift-click
    - Export includes all filtered data
    - Mobile responsive table
    - Loading states for all operations
  </constraints>

  <verification>
    - Page loads at /enrollments
    - All enrollments displayed
    - Filters work correctly
    - Search finds by name
    - Status change works
    - Bulk operations work
    - Export generates valid file
    - Mobile responsive
    - Loading states shown
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/enrollments/page.tsx">Main page</file>
  <file path="apps/web/src/components/enrollments/EnrollmentTable.tsx">Data table</file>
  <file path="apps/web/src/components/enrollments/EnrollmentFilters.tsx">Filter controls</file>
  <file path="apps/web/src/components/enrollments/EnrollmentStatusBadge.tsx">Status badge</file>
  <file path="apps/web/src/components/enrollments/BulkActionsBar.tsx">Bulk action toolbar</file>
  <file path="apps/web/src/hooks/useEnrollments.ts">Data hook</file>
  <file path="apps/web/src/lib/api/enrollments.ts">API client</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/components/layout/Sidebar.tsx">Add enrollments nav item</file>
</files_to_modify>

<validation_criteria>
  <criterion>Enrollments page accessible at /enrollments</criterion>
  <criterion>All enrollments with details displayed</criterion>
  <criterion>Filters work (status, fee tier)</criterion>
  <criterion>Search works (child, parent name)</criterion>
  <criterion>Bulk status change works</criterion>
  <criterion>Export generates valid CSV/Excel</criterion>
  <criterion>Mobile responsive</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="enrollment" --verbose</command>
</test_commands>

</task_spec>
