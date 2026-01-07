/**
 * Bulk Actions Bar Component
 * TASK-ENROL-003: Added Graduate action with date picker
 *
 * Toolbar for bulk operations on selected enrollments:
 * - Change status to active/inactive/pending
 * - Graduate enrollments (year-end processing)
 * - Clear selection
 */

import * as React from 'react';
import { Check, X, GraduationCap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkStatusChange: (status: 'active' | 'inactive' | 'pending') => void;
  onBulkGraduate: (endDate: string) => Promise<void>;
  isLoading?: boolean;
  isGraduating?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkStatusChange,
  onBulkGraduate,
  isLoading = false,
  isGraduating = false,
}: BulkActionsBarProps) {
  const [selectedStatus, setSelectedStatus] = React.useState<string>('');
  const [showGraduateDialog, setShowGraduateDialog] = React.useState(false);
  const [graduationDate, setGraduationDate] = React.useState(() => {
    // Default to today's date
    return new Date().toISOString().split('T')[0];
  });

  const handleApply = () => {
    if (selectedStatus && selectedStatus !== 'placeholder') {
      onBulkStatusChange(selectedStatus as 'active' | 'inactive' | 'pending');
      setSelectedStatus('');
    }
  };

  const handleGraduate = async () => {
    if (graduationDate) {
      await onBulkGraduate(graduationDate);
      setShowGraduateDialog(false);
      // Reset to today for next time
      setGraduationDate(new Date().toISOString().split('T')[0]);
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {selectedCount} enrollment{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={isLoading || isGraduating}
          >
            <X className="mr-2 h-4 w-4" />
            Clear Selection
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* Graduate Action */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGraduateDialog(true)}
            disabled={isLoading || isGraduating}
          >
            {isGraduating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GraduationCap className="mr-2 h-4 w-4" />
            )}
            Graduate
          </Button>

          {/* Status Change */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Change status:</span>
            <Select
              value={selectedStatus}
              onValueChange={setSelectedStatus}
              disabled={isLoading || isGraduating}
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
              disabled={!selectedStatus || selectedStatus === 'placeholder' || isLoading || isGraduating}
              size="sm"
            >
              <Check className="mr-2 h-4 w-4" />
              Apply
            </Button>
          </div>
        </div>
      </div>

      {/* Graduate Dialog */}
      <Dialog open={showGraduateDialog} onOpenChange={setShowGraduateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Graduate Enrollments</DialogTitle>
            <DialogDescription>
              Graduate {selectedCount} selected enrollment{selectedCount !== 1 ? 's' : ''}.
              This action sets the status to GRADUATED and records the graduation date.
              Graduated children will be charged the re-registration fee (R300) if they re-enroll.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="graduation-date">Graduation Date</Label>
              <Input
                id="graduation-date"
                type="date"
                value={graduationDate}
                onChange={(e) => setGraduationDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
              <p className="text-sm text-muted-foreground">
                Typically the last day of the school year (e.g., December 15)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGraduateDialog(false)}
              disabled={isGraduating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGraduate}
              disabled={!graduationDate || isGraduating}
            >
              {isGraduating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Graduating...
                </>
              ) : (
                <>
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Graduate {selectedCount} Enrollment{selectedCount !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
