'use client';

/**
 * Recipient Selector Component
 * TASK-COMM-005: Recipient Selection Component
 */

import { useState } from 'react';
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
    recipientFilter?: Record<string, unknown>;
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
        <Tabs value={selectionMode} onValueChange={(v) => setSelectionMode(v as 'filter' | 'group' | 'custom')}>
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
                value={value.recipientFilter?.parentFilter as Record<string, unknown> | undefined}
                onChange={(parentFilter) =>
                  onChange({ recipientFilter: { parentFilter } })
                }
              />
            ) : (
              <StaffFilterForm
                value={value.recipientFilter?.staffFilter as Record<string, unknown> | undefined}
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
              value={(value.recipientFilter?.selectedIds as string[]) ?? []}
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
