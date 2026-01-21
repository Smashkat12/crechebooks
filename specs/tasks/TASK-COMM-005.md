<task_spec id="TASK-COMM-005" version="1.0">

<metadata>
  <title>Recipient Selection Component</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>284</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-COMM-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-COMM-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/components/communications/recipient-selector.tsx` (NEW)
  - `apps/web/src/components/communications/recipient-preview.tsx` (NEW)
  - `apps/web/src/components/communications/parent-filter-form.tsx` (NEW)
  - `apps/web/src/components/communications/staff-filter-form.tsx` (NEW)
  - `apps/web/src/components/communications/custom-recipient-picker.tsx` (NEW)
  - `apps/web/src/components/communications/saved-groups-selector.tsx` (NEW)

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/communications/new/page.tsx` (integrate components)

  **Current Problem:**
  - No UI for selecting message recipients
  - No filter-based targeting for parents or staff
  - No way to preview who will receive the message
  - No saved group selection

  **Test Count:** 460+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. RecipientSelector Component
  ```typescript
  // apps/web/src/components/communications/recipient-selector.tsx
  'use client';

  import { useState } from 'react';
  import { Card, CardContent } from '@/components/ui/card';
  import { Label } from '@/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { ParentFilterForm } from './parent-filter-form';
  import { StaffFilterForm } from './staff-filter-form';
  import { CustomRecipientPicker } from './custom-recipient-picker';
  import { SavedGroupsSelector } from './saved-groups-selector';
  import { Users, UserCog, UserCheck, Bookmark } from 'lucide-react';

  interface RecipientSelectorProps {
    value: {
      recipientType: string;
      recipientFilter?: any;
      recipientGroupId?: string;
    };
    onChange: (updates: Partial<RecipientSelectorProps['value']>) => void;
  }

  export function RecipientSelector({ value, onChange }: RecipientSelectorProps) {
    const [selectionMode, setSelectionMode] = useState<'filter' | 'group' | 'custom'>('filter');

    return (
      <div className="space-y-6">
        {/* Recipient Type Selection */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Who should receive this message?</Label>
          <RadioGroup
            value={value.recipientType}
            onValueChange={(type) => onChange({ recipientType: type, recipientFilter: {} })}
            className="grid grid-cols-2 gap-4"
          >
            <div>
              <RadioGroupItem value="parent" id="parent" className="peer sr-only" />
              <Label
                htmlFor="parent"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
              >
                <Users className="mb-3 h-6 w-6" />
                <span className="font-medium">Parents</span>
                <span className="text-sm text-muted-foreground">Message to parents</span>
              </Label>
            </div>
            <div>
              <RadioGroupItem value="staff" id="staff" className="peer sr-only" />
              <Label
                htmlFor="staff"
                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
              >
                <UserCog className="mb-3 h-6 w-6" />
                <span className="font-medium">Staff</span>
                <span className="text-sm text-muted-foreground">Message to employees</span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Selection Mode */}
        <div className="space-y-3">
          <Label className="text-base font-medium">How would you like to select recipients?</Label>
          <Tabs value={selectionMode} onValueChange={(v) => setSelectionMode(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="filter">
                <UserCheck className="mr-2 h-4 w-4" />
                By Filter
              </TabsTrigger>
              <TabsTrigger value="group">
                <Bookmark className="mr-2 h-4 w-4" />
                Saved Group
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Users className="mr-2 h-4 w-4" />
                Select Manually
              </TabsTrigger>
            </TabsList>

            <TabsContent value="filter" className="mt-4">
              {value.recipientType === 'parent' ? (
                <ParentFilterForm
                  value={value.recipientFilter?.parentFilter}
                  onChange={(parentFilter) =>
                    onChange({ recipientFilter: { parentFilter } })
                  }
                />
              ) : (
                <StaffFilterForm
                  value={value.recipientFilter?.staffFilter}
                  onChange={(staffFilter) =>
                    onChange({ recipientFilter: { staffFilter } })
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="group" className="mt-4">
              <SavedGroupsSelector
                recipientType={value.recipientType}
                value={value.recipientGroupId}
                onChange={(groupId) => onChange({ recipientGroupId: groupId })}
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-4">
              <CustomRecipientPicker
                recipientType={value.recipientType}
                value={value.recipientFilter?.selectedIds ?? []}
                onChange={(selectedIds) =>
                  onChange({
                    recipientType: 'custom',
                    recipientFilter: { selectedIds },
                  })
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }
  ```

  ### 3. ParentFilterForm Component
  ```typescript
  // apps/web/src/components/communications/parent-filter-form.tsx
  'use client';

  import { Label } from '@/components/ui/label';
  import { Switch } from '@/components/ui/switch';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { MultiSelect } from '@/components/ui/multi-select';
  import { useFeeStructures } from '@/hooks/use-fee-structures';

  interface ParentFilter {
    isActive?: boolean;
    enrollmentStatus?: string[];
    feeStructureId?: string;
    hasOutstandingBalance?: boolean;
    daysOverdue?: number;
  }

  interface ParentFilterFormProps {
    value?: ParentFilter;
    onChange: (value: ParentFilter) => void;
  }

  export function ParentFilterForm({ value = {}, onChange }: ParentFilterFormProps) {
    const { feeStructures } = useFeeStructures();

    const handleChange = (field: keyof ParentFilter, fieldValue: any) => {
      onChange({ ...value, [field]: fieldValue });
    };

    return (
      <div className="space-y-4">
        {/* Active Parents Only */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Active Parents Only</Label>
            <p className="text-sm text-muted-foreground">
              Only include parents with active enrollments
            </p>
          </div>
          <Switch
            checked={value.isActive ?? true}
            onCheckedChange={(checked) => handleChange('isActive', checked)}
          />
        </div>

        {/* Enrollment Status */}
        <div className="space-y-2">
          <Label>Enrollment Status</Label>
          <MultiSelect
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'WITHDRAWN', label: 'Withdrawn' },
              { value: 'GRADUATED', label: 'Graduated' },
            ]}
            value={value.enrollmentStatus ?? ['ACTIVE']}
            onChange={(statuses) => handleChange('enrollmentStatus', statuses)}
            placeholder="Select enrollment statuses"
          />
        </div>

        {/* Fee Structure */}
        <div className="space-y-2">
          <Label>Fee Structure</Label>
          <Select
            value={value.feeStructureId ?? 'all'}
            onValueChange={(v) => handleChange('feeStructureId', v === 'all' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All fee structures" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fee structures</SelectItem>
              {feeStructures?.map((fs) => (
                <SelectItem key={fs.id} value={fs.id}>
                  {fs.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Outstanding Balance */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Has Outstanding Balance</Label>
            <p className="text-sm text-muted-foreground">
              Only include parents with unpaid invoices
            </p>
          </div>
          <Switch
            checked={value.hasOutstandingBalance ?? false}
            onCheckedChange={(checked) => handleChange('hasOutstandingBalance', checked)}
          />
        </div>

        {/* Days Overdue */}
        {value.hasOutstandingBalance && (
          <div className="space-y-2">
            <Label>Minimum Days Overdue</Label>
            <Select
              value={String(value.daysOverdue ?? 0)}
              onValueChange={(v) => handleChange('daysOverdue', parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any overdue</SelectItem>
                <SelectItem value="7">7+ days</SelectItem>
                <SelectItem value="14">14+ days</SelectItem>
                <SelectItem value="30">30+ days</SelectItem>
                <SelectItem value="60">60+ days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }
  ```

  ### 4. RecipientPreview Component
  ```typescript
  // apps/web/src/components/communications/recipient-preview.tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Skeleton } from '@/components/ui/skeleton';
  import { useCommunications } from '@/hooks/use-communications';
  import { Users, Mail, MessageSquare } from 'lucide-react';

  interface RecipientPreviewProps {
    recipientType: string;
    filter?: any;
    channel: string;
  }

  export function RecipientPreview({ recipientType, filter, channel }: RecipientPreviewProps) {
    const { previewRecipients, isPreviewing } = useCommunications();
    const [preview, setPreview] = useState<{
      total: number;
      recipients: Array<{ id: string; name: string; email?: string; phone?: string }>;
      hasMore: boolean;
    } | null>(null);

    useEffect(() => {
      const loadPreview = async () => {
        try {
          const result = await previewRecipients({
            recipientType,
            filter,
            channel,
          });
          setPreview(result);
        } catch (error) {
          console.error('Failed to preview recipients', error);
        }
      };

      loadPreview();
    }, [recipientType, filter, channel]);

    if (isPreviewing) {
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      );
    }

    if (!preview) {
      return null;
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recipient Preview</CardTitle>
          <Badge variant="secondary">
            <Users className="mr-1 h-3 w-3" />
            {preview.total} recipient{preview.total !== 1 ? 's' : ''}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {preview.recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="font-medium">{r.name}</span>
                <div className="flex items-center gap-2">
                  {r.email && (channel === 'email' || channel === 'all') && (
                    <Badge variant="outline" className="text-xs">
                      <Mail className="mr-1 h-3 w-3" />
                      {r.email}
                    </Badge>
                  )}
                  {r.phone && (channel === 'whatsapp' || channel === 'all') && (
                    <Badge variant="outline" className="text-xs">
                      <MessageSquare className="mr-1 h-3 w-3" />
                      {r.phone}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {preview.hasMore && (
              <p className="text-center text-sm text-muted-foreground">
                ... and {preview.total - preview.recipients.length} more
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the recipient selection components for the communication dashboard.

**Business Requirements:**
1. Select between Parents and Staff as recipient types
2. Filter parents by enrollment status, fee structure, arrears
3. Filter staff by department, employment type
4. Use saved recipient groups for quick selection
5. Manually pick individual recipients
6. Preview who will receive the message before sending

**Component Hierarchy:**
```
RecipientSelector
├── RecipientTypeRadioGroup
├── SelectionModeTabs
│   ├── ParentFilterForm / StaffFilterForm
│   ├── SavedGroupsSelector
│   └── CustomRecipientPicker
└── RecipientPreview
```
</context>

<scope>
  <in_scope>
    - RecipientSelector main component
    - ParentFilterForm with all filter options
    - StaffFilterForm with department/type filters
    - SavedGroupsSelector for reusable groups
    - CustomRecipientPicker for manual selection
    - RecipientPreview with count and sample
    - Integration with preview API
  </in_scope>
  <out_of_scope>
    - Creating new saved groups (handled in groups management)
    - WhatsApp opt-in warnings (handled in channel selector)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create ParentFilterForm
# Create apps/web/src/components/communications/parent-filter-form.tsx

# 2. Create StaffFilterForm
# Create apps/web/src/components/communications/staff-filter-form.tsx

# 3. Create SavedGroupsSelector
# Create apps/web/src/components/communications/saved-groups-selector.tsx

# 4. Create CustomRecipientPicker
# Create apps/web/src/components/communications/custom-recipient-picker.tsx

# 5. Create RecipientPreview
# Create apps/web/src/components/communications/recipient-preview.tsx

# 6. Create RecipientSelector
# Create apps/web/src/components/communications/recipient-selector.tsx

# 7. Integrate into new broadcast page
# Update apps/web/src/app/(dashboard)/communications/new/page.tsx

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All components properly typed with TypeScript
    - Responsive design for various screen sizes
    - Loading states during preview fetch
    - Error handling for failed API calls
    - Accessible form controls
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Manual: Select Parents/Staff
    - Manual: Apply parent filters
    - Manual: Apply staff filters
    - Manual: Select saved group
    - Manual: Manually pick recipients
    - Manual: Preview updates on filter change
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Fetch preview on every keystroke (debounce)
  - Show all recipients in preview (limit to 20)
  - Allow sending without recipient preview
  - Use any types for filter values
</anti_patterns>

</task_spec>
