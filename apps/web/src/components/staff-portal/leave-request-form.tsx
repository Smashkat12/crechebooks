'use client';

/**
 * Leave Request Form Component
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Form for submitting new leave requests with:
 * - Leave type selection
 * - Date range picker
 * - Reason textarea
 * - Validation and submission handling
 */

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, Calendar, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInBusinessDays, isAfter, isBefore, addDays } from 'date-fns';
import { todaySA } from '@/lib/date-utils';

// ============================================================================
// Types
// ============================================================================

export interface LeaveBalanceItem {
  type: string;
  name: string;
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export interface LeaveRequestFormData {
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface LeaveRequestFormProps {
  balances: LeaveBalanceItem[];
  onSubmit: (data: LeaveRequestFormData) => Promise<void>;
  className?: string;
  isSubmitting?: boolean;
}

// ============================================================================
// Leave Type Options
// ============================================================================

const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual Leave', description: '15 days per year' },
  { value: 'sick', label: 'Sick Leave', description: '30 days per 3-year cycle' },
  { value: 'family', label: 'Family Responsibility Leave', description: '3 days per year' },
  { value: 'unpaid', label: 'Unpaid Leave', description: 'No pay during absence' },
  { value: 'study', label: 'Study Leave', description: 'For educational purposes' },
];

// ============================================================================
// Helper Functions
// ============================================================================

const calculateWorkingDays = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 0;
  // Simple calculation - doesn't account for public holidays
  return Math.max(0, differenceInBusinessDays(end, start) + 1);
};

// ============================================================================
// Component
// ============================================================================

export function LeaveRequestForm({
  balances,
  onSubmit,
  className,
  isSubmitting = false,
}: LeaveRequestFormProps) {
  const [leaveType, setLeaveType] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = useMemo(() => todaySA(), []);

  // Get available balance for selected leave type
  const selectedBalance = useMemo(() => {
    return balances.find((b) => b.type === leaveType);
  }, [balances, leaveType]);

  // Calculate working days for the selected period
  const workingDays = useMemo(() => {
    return calculateWorkingDays(startDate, endDate);
  }, [startDate, endDate]);

  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];

    if (!leaveType) {
      errors.push('Please select a leave type');
    }

    if (!startDate) {
      errors.push('Please select a start date');
    }

    if (!endDate) {
      errors.push('Please select an end date');
    }

    if (startDate && endDate && isAfter(startDate, endDate)) {
      errors.push('End date must be after start date');
    }

    if (startDate && isBefore(startDate, today)) {
      errors.push('Start date cannot be in the past');
    }

    if (selectedBalance && workingDays > selectedBalance.available) {
      errors.push(
        `Insufficient leave balance. You have ${selectedBalance.available} days available but requested ${workingDays} days.`
      );
    }

    if (workingDays > 20) {
      errors.push('Leave requests cannot exceed 20 working days. Please split into multiple requests.');
    }

    return {
      isValid: errors.length === 0 && leaveType && startDate && endDate,
      errors,
    };
  }, [leaveType, startDate, endDate, selectedBalance, workingDays, today]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      if (!validation.isValid || !startDate || !endDate) {
        setError(validation.errors[0] || 'Please fill in all required fields');
        return;
      }

      try {
        await onSubmit({
          type: leaveType,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          reason: reason.trim() || undefined,
        });

        setSuccess('Leave request submitted successfully!');
        // Reset form
        setLeaveType('');
        setStartDate(null);
        setEndDate(null);
        setReason('');

        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(null), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit leave request');
      }
    },
    [validation, leaveType, startDate, endDate, reason, onSubmit]
  );

  // Handle start date change - auto-adjust end date if needed
  const handleStartDateChange = (date: Date | null) => {
    setStartDate(date);
    if (date && (!endDate || isBefore(endDate, date))) {
      setEndDate(date);
    }
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Request Leave
        </CardTitle>
        <CardDescription>
          Submit a new leave request for approval by your manager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Success Message */}
          {success && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                {success}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Leave Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="leave-type">Leave Type *</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger id="leave-type">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPE_OPTIONS.map((option) => {
                  const balance = balances.find((b) => b.type === option.value);
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center justify-between w-full">
                        <span>{option.label}</span>
                        {balance && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({balance.available} days available)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedBalance && (
              <p className="text-xs text-muted-foreground">
                Available: {selectedBalance.available} of {selectedBalance.entitled} days
                {selectedBalance.pending > 0 && ` (${selectedBalance.pending} pending)`}
              </p>
            )}
          </div>

          {/* Date Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <DatePicker
                id="start-date"
                value={startDate}
                onChange={handleStartDateChange}
                placeholder="Select start date"
                disablePast
                minDate={today}
                maxDate={addDays(today, 365)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date *</Label>
              <DatePicker
                id="end-date"
                value={endDate}
                onChange={setEndDate}
                placeholder="Select end date"
                disablePast
                minDate={startDate || today}
                maxDate={addDays(today, 365)}
                disabled={!startDate}
              />
            </div>
          </div>

          {/* Working Days Summary */}
          {startDate && endDate && (
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Working days requested:</span>
                <span className="text-lg font-semibold">{workingDays} days</span>
              </div>
              {selectedBalance && workingDays > selectedBalance.available && (
                <p className="text-xs text-destructive mt-2">
                  This exceeds your available balance of {selectedBalance.available} days
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide additional details about your leave request..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {reason.length}/500 characters
            </p>
          </div>

          {/* Validation Errors */}
          {!validation.isValid && validation.errors.length > 0 && leaveType && (
            <div className="text-sm text-destructive space-y-1">
              {validation.errors.map((err, i) => (
                <p key={i}>• {err}</p>
              ))}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSubmitting || !validation.isValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Request
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default LeaveRequestForm;
