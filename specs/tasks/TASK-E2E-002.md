<task_spec id="TASK-E2E-002" version="1.0">

<metadata>
  <title>E2E Bug Fixes - Date Picker Year Range for DOB Fields</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>155</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

The date picker component only allows selecting years from 2016-2031. This is problematic for:
- Staff Date of Birth fields (staff could be born 1940-2010)
- Any historical date selection

## Error Details
When opening the DOB date picker on /staff/new:
- Year dropdown only shows: 2016, 2017, ..., 2031
- Cannot select years before 2016
- This makes it impossible to enter a valid DOB for adult staff members

## Root Cause
The Calendar/DatePicker component has a hardcoded or default year range that's too restrictive.

## Impact
- **Staff creation**: Cannot enter proper DOB for staff members
- **User experience**: Frustrating limitation

## Pages Affected
- /staff/new (Add Staff form)
- /staff/[id]/edit (Edit Staff form)
- Any form using DOB date picker

</context>

<input_context_files>
  <file purpose="component">apps/web/src/components/ui/calendar.tsx</file>
  <file purpose="date_picker">apps/web/src/components/forms/date-picker.tsx</file>
  <file purpose="staff_form">apps/web/src/app/(dashboard)/staff/new/page.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - Update Calendar component to accept configurable year range
    - Update DatePicker to pass appropriate year range for DOB fields
    - Allow DOB fields to select years from 1940 to current year
  </in_scope>
  <out_of_scope>
    - Changing date format
    - Adding new date picker features
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - DOB date picker allows years from 1940 to current year
    - Other date pickers (like Start Date) keep reasonable ranges
    - No breaking changes to existing functionality
  </constraints>

  <verification>
    - Navigate to /staff/new
    - Click DOB date picker
    - Verify year dropdown includes years back to at least 1950
    - Select a year like 1985 and verify it works
  </verification>
</definition_of_done>

<pseudo_code>
// In calendar.tsx or date-picker.tsx, add props for year range:
interface DatePickerProps {
  minYear?: number;  // Default: current year - 10
  maxYear?: number;  // Default: current year + 10
  mode?: 'date' | 'dob' | 'future';  // Presets for common use cases
}

// For DOB mode:
if (mode === 'dob') {
  minYear = 1940;
  maxYear = new Date().getFullYear();
}

// Update staff form to use mode="dob" for Date of Birth field
</pseudo_code>

<test_commands>
  <command>npm run dev</command>
  <command>Navigate to http://localhost:3000/staff/new and test DOB picker</command>
</test_commands>

</task_spec>
