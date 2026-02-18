/**
 * Enroll Child Dialog
 *
 * Reusable dialog for enrolling an existing child in a fee structure.
 * Two modes:
 * - Pre-selected child (from parent detail page): shows child name read-only
 * - Child picker (from enrollments page): shows searchable dropdown of unenrolled children
 */

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useEnrollChild, useChildren } from '@/hooks/use-parents';
import { useFeeStructures } from '@/hooks/use-fee-structures';
import { useToast } from '@/hooks/use-toast';
import type { EnrollmentData } from './EnrollmentSuccessModal';

export interface EnrollChildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected child ID (Mode A) */
  childId?: string;
  /** Pre-selected child name for display */
  childName?: string;
  /** Parent ID for cache invalidation */
  parentId?: string;
  /** Callback after successful enrollment */
  onSuccess?: (data: EnrollmentData) => void;
}

export function EnrollChildDialog({
  open,
  onOpenChange,
  childId: preselectedChildId,
  childName,
  parentId,
  onSuccess,
}: EnrollChildDialogProps) {
  const { toast } = useToast();
  const enrollMutation = useEnrollChild();
  const { data: feeStructuresData } = useFeeStructures();
  const { data: childrenData } = useChildren(
    !preselectedChildId ? { status: 'REGISTERED', limit: 100 } : undefined,
  );

  const [selectedChildId, setSelectedChildId] = useState('');
  const [feeStructureId, setFeeStructureId] = useState('');
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0],
  );

  const feeStructures = feeStructuresData?.fee_structures ?? [];
  const unenrolledChildren = childrenData?.data ?? [];

  const effectiveChildId = preselectedChildId || selectedChildId;

  const handleSubmit = async () => {
    if (!effectiveChildId || !feeStructureId || !startDate) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await enrollMutation.mutateAsync({
        childId: effectiveChildId,
        feeStructureId,
        startDate,
        parentId,
      });

      // Reset form
      setSelectedChildId('');
      setFeeStructureId('');
      setStartDate(new Date().toISOString().split('T')[0]);
      onOpenChange(false);

      toast({
        title: 'Enrollment Successful',
        description: `Child has been enrolled successfully.`,
      });

      onSuccess?.(result.data);
    } catch {
      toast({
        title: 'Enrollment Failed',
        description: 'Failed to enroll child. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedChildId('');
      setFeeStructureId('');
      setStartDate(new Date().toISOString().split('T')[0]);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Child</DialogTitle>
          <DialogDescription>
            {preselectedChildId
              ? `Enroll ${childName} in a fee structure to activate their enrollment.`
              : 'Select an unenrolled child and assign them to a fee structure.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Child selection */}
          {preselectedChildId ? (
            <div className="space-y-2">
              <Label>Child</Label>
              <Input value={childName || ''} disabled />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Child *</Label>
              <Select
                value={selectedChildId}
                onValueChange={setSelectedChildId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a child to enroll" />
                </SelectTrigger>
                <SelectContent>
                  {unenrolledChildren.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No unenrolled children found
                    </div>
                  ) : (
                    unenrolledChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.first_name} {child.last_name} —{' '}
                        <span className="text-muted-foreground">
                          {child.parent.name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fee structure */}
          <div className="space-y-2">
            <Label>Fee Structure *</Label>
            <Select value={feeStructureId} onValueChange={setFeeStructureId}>
              <SelectTrigger>
                <SelectValue placeholder="Select fee structure" />
              </SelectTrigger>
              <SelectContent>
                {feeStructures.map((fs) => (
                  <SelectItem key={fs.id} value={fs.id}>
                    {fs.name} — R{fs.amount.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start date */}
          <div className="space-y-2">
            <Label>Start Date *</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={enrollMutation.isPending || !effectiveChildId || !feeStructureId}
          >
            {enrollMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enrolling...
              </>
            ) : (
              'Enroll'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
