'use client';

/**
 * Leave Request Dialog
 * TASK-WEB-051: Create leave request form dialog
 *
 * Provides a dialog for creating new leave requests including:
 * - Leave type selection
 * - Start and end date pickers
 * - Reason textarea
 * - Form validation and submission
 * - Success/error toast notifications
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Loader2, AlertCircle } from 'lucide-react';
import { DatePicker, todaySA } from '@/components/ui/date-picker';
import {
  useLeaveTypes,
  useCreateLeaveRequest,
  useLeaveBalances,
} from '@/hooks/use-leave';
import { useToast } from '@/hooks/use-toast';
import { differenceInBusinessDays, differenceInHours, isBefore } from 'date-fns';

interface LeaveRequestDialogProps {
  staffId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Calculate business days between two dates (excluding weekends)
 */
function calculateLeaveDuration(
  startDate: Date,
  endDate: Date,
  units: 'days' | 'hours'
): { days: number; hours: number } {
  if (units === 'hours') {
    // For hourly leave, calculate hours (8-hour work day assumption)
    const hours = Math.max(differenceInHours(endDate, startDate) + 1, 1);
    return { days: hours / 8, hours };
  }

  // For daily leave, calculate business days
  // Add 1 because both start and end dates are inclusive
  const days = differenceInBusinessDays(endDate, startDate) + 1;
  return { days: Math.max(days, 1), hours: days * 8 };
}

export function LeaveRequestDialog({ staffId, open, onOpenChange }: LeaveRequestDialogProps) {
  // Form state
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('');

  // Queries and mutations
  const { data: leaveTypes, isLoading: loadingTypes } = useLeaveTypes();
  const { data: balances } = useLeaveBalances(staffId);
  const { mutate: createLeaveRequest, isPending: isSubmitting } = useCreateLeaveRequest();
  const { toast } = useToast();

  // Get today's date in SA timezone
  const today = useMemo(() => todaySA(), []);

  // Find selected leave type details
  const selectedLeaveType = useMemo(() => {
    if (!selectedLeaveTypeId || !leaveTypes) return null;
    return leaveTypes.find((t) => t.id.toString() === selectedLeaveTypeId) || null;
  }, [selectedLeaveTypeId, leaveTypes]);

  // Get balance for selected leave type
  const selectedBalance = useMemo(() => {
    if (!selectedLeaveTypeId || !balances) return null;
    return (
      balances.find((b) => b.leaveTypeId.toString() === selectedLeaveTypeId) || null
    );
  }, [selectedLeaveTypeId, balances]);

  // Calculate duration based on selected dates
  const duration = useMemo(() => {
    if (!startDate || !endDate || !selectedLeaveType) return null;
    return calculateLeaveDuration(startDate, endDate, selectedLeaveType.units);
  }, [startDate, endDate, selectedLeaveType]);

  // Check if requested days exceed available balance
  const exceedsBalance = useMemo(() => {
    if (!duration || !selectedBalance) return false;
    return duration.days > selectedBalance.currentBalance;
  }, [duration, selectedBalance]);

  // Form validation
  const isValid = useMemo(() => {
    if (!selectedLeaveTypeId) return false;
    if (!startDate) return false;
    if (!endDate) return false;
    if (isBefore(endDate, startDate)) return false;
    if (exceedsBalance) return false;
    return true;
  }, [selectedLeaveTypeId, startDate, endDate, exceedsBalance]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedLeaveTypeId('');
      setStartDate(null);
      setEndDate(null);
      setReason('');
    }
  }, [open]);

  // Update end date when start date changes (if end date is before start)
  useEffect(() => {
    if (startDate && endDate && isBefore(endDate, startDate)) {
      setEndDate(startDate);
    }
  }, [startDate, endDate]);

  const handleSubmit = () => {
    if (!isValid || !selectedLeaveType || !startDate || !endDate || !duration) return;

    createLeaveRequest(
      {
        staffId,
        body: {
          leaveTypeId: parseInt(selectedLeaveTypeId, 10),
          leaveTypeName: selectedLeaveType.name,
          startDate,
          endDate,
          totalDays: duration.days,
          totalHours: duration.hours,
          reason: reason.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: 'Leave request submitted',
            description: `Your ${selectedLeaveType.name} request for ${duration.days} ${selectedLeaveType.units} has been submitted.`,
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'Failed to submit leave request',
            description:
              error.response?.data?.message || 'An unexpected error occurred. Please try again.',
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Request Leave
          </DialogTitle>
          <DialogDescription>
            Submit a leave request for approval. Select the leave type and dates below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Leave Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="leaveType">Leave Type *</Label>
            <Select
              value={selectedLeaveTypeId}
              onValueChange={setSelectedLeaveTypeId}
              disabled={loadingTypes}
            >
              <SelectTrigger id="leaveType">
                <SelectValue placeholder={loadingTypes ? 'Loading...' : 'Select leave type'} />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id.toString()}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Show available balance for selected type */}
            {selectedBalance && (
              <p className="text-xs text-muted-foreground">
                Available:{' '}
                <span className="font-medium">
                  {selectedBalance.currentBalance.toFixed(1)} {selectedBalance.units}
                </span>
              </p>
            )}
          </div>

          {/* Date Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <DatePicker
                id="startDate"
                value={startDate}
                onChange={setStartDate}
                placeholder="Select start"
                minDate={today}
                disabled={!selectedLeaveTypeId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <DatePicker
                id="endDate"
                value={endDate}
                onChange={setEndDate}
                placeholder="Select end"
                minDate={startDate || today}
                disabled={!startDate}
              />
            </div>
          </div>

          {/* Duration Display */}
          {duration && selectedLeaveType && (
            <div className="rounded-md bg-muted p-3">
              <div className="flex items-center justify-between text-sm">
                <span>Duration</span>
                <span className="font-medium">
                  {duration.days} {selectedLeaveType.units}
                </span>
              </div>
            </div>
          )}

          {/* Balance Warning */}
          {exceedsBalance && selectedBalance && (
            <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-yellow-800">
                <p className="font-medium">Insufficient balance</p>
                <p className="text-xs mt-0.5">
                  You only have {selectedBalance.currentBalance.toFixed(1)}{' '}
                  {selectedBalance.units} available.
                </p>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for leave request..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
