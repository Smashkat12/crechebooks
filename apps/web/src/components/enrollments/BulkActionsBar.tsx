/**
 * Bulk Actions Bar Component
 *
 * Toolbar for bulk operations on selected enrollments:
 * - Change status to active/inactive/pending
 * - Clear selection
 */

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkStatusChange: (status: 'active' | 'inactive' | 'pending') => void;
  isLoading?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkStatusChange,
  isLoading = false,
}: BulkActionsBarProps) {
  const [selectedStatus, setSelectedStatus] = React.useState<string>('');

  const handleApply = () => {
    if (selectedStatus && selectedStatus !== 'placeholder') {
      onBulkStatusChange(selectedStatus as 'active' | 'inactive' | 'pending');
      setSelectedStatus('');
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedCount} enrollment{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
        >
          <X className="mr-2 h-4 w-4" />
          Clear Selection
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Change status to:</span>
        <Select
          value={selectedStatus}
          onValueChange={setSelectedStatus}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={handleApply}
          disabled={!selectedStatus || selectedStatus === 'placeholder' || isLoading}
          size="sm"
        >
          <Check className="mr-2 h-4 w-4" />
          Apply
        </Button>
      </div>
    </div>
  );
}
