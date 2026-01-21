'use client';

/**
 * Saved Groups Selector Component
 * TASK-COMM-005: Recipient Selection Component
 */

import { useRecipientGroups } from '@/hooks/use-communications';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Bookmark, Users } from 'lucide-react';

interface SavedGroupsSelectorProps {
  recipientType: string;
  value?: string;
  onChange: (groupId: string | undefined) => void;
}

export function SavedGroupsSelector({
  recipientType,
  value,
  onChange,
}: SavedGroupsSelectorProps) {
  const { groups, isLoading } = useRecipientGroups();

  // Filter groups by recipient type
  const filteredGroups = groups.filter(
    (g) => g.recipient_type === recipientType || g.recipient_type === 'custom'
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium">No saved groups</h3>
        <p className="text-sm text-muted-foreground">
          Create a recipient group to quickly select the same recipients later.
        </p>
      </div>
    );
  }

  return (
    <RadioGroup value={value} onValueChange={onChange}>
      <div className="space-y-3">
        {filteredGroups.map((group) => (
          <div key={group.id}>
            <RadioGroupItem
              value={group.id}
              id={group.id}
              className="peer sr-only"
            />
            <Label
              htmlFor={group.id}
              className="flex items-center justify-between rounded-lg border-2 p-4 cursor-pointer hover:bg-accent peer-data-[state=checked]:border-primary"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-muted p-2">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">{group.name}</div>
                  {group.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                </div>
              </div>
              {group.is_system && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  System
                </span>
              )}
            </Label>
          </div>
        ))}
      </div>
    </RadioGroup>
  );
}
