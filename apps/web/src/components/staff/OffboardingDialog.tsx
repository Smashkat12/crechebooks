'use client';

/**
 * Staff Offboarding Dialog
 * TASK-STAFF-002: Initiate offboarding workflow
 *
 * Provides a dialog for initiating the offboarding process including:
 * - Reason selection
 * - Last working date
 * - Settlement preview with BCEA-compliant calculations
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Calendar, DollarSign, FileText, Loader2 } from 'lucide-react';
import {
  useSettlementPreview,
  useInitiateOffboarding,
} from '@/hooks/use-staff-offboarding';
import { formatCurrency, formatDate } from '@/lib/utils';

interface OffboardingDialogProps {
  staffId: string;
  staffName: string;
  trigger?: React.ReactNode;
  onComplete?: () => void;
}

const OFFBOARDING_REASONS = [
  { value: 'RESIGNATION', label: 'Resignation' },
  { value: 'TERMINATION', label: 'Termination' },
  { value: 'RETRENCHMENT', label: 'Retrenchment' },
  { value: 'RETIREMENT', label: 'Retirement' },
  { value: 'END_OF_CONTRACT', label: 'End of Contract' },
  { value: 'MUTUAL_AGREEMENT', label: 'Mutual Agreement' },
  { value: 'DEATH', label: 'Death' },
] as const;

export function OffboardingDialog({
  staffId,
  staffName,
  trigger,
  onComplete,
}: OffboardingDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [notes, setNotes] = useState('');

  // Get settlement preview when date and reason are selected
  const {
    data: settlement,
    isLoading: loadingPreview,
  } = useSettlementPreview(staffId, lastWorkingDate, reason, open);

  const {
    mutate: initiateOffboarding,
    isPending: isInitiating,
  } = useInitiateOffboarding(staffId);

  const handleSubmit = () => {
    initiateOffboarding(
      { reason, lastWorkingDate, notes: notes || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setReason('');
          setLastWorkingDate('');
          setNotes('');
          onComplete?.();
        },
      }
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form on close
      setReason('');
      setLastWorkingDate('');
      setNotes('');
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="destructive" size="sm">
            Start Offboarding
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Offboard Staff: {staffName}
          </DialogTitle>
          <DialogDescription>
            Initiate the offboarding process for this staff member. This will calculate
            their final settlement and generate required documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Offboarding Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Leaving *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {OFFBOARDING_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastWorkingDate">Last Working Date *</Label>
              <Input
                id="lastWorkingDate"
                type="date"
                value={lastWorkingDate}
                onChange={(e) => setLastWorkingDate(e.target.value)}
                min={today}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about the offboarding..."
              rows={3}
            />
          </div>

          {/* Settlement Preview */}
          {reason && lastWorkingDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />
                  Settlement Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">
                      Calculating settlement...
                    </span>
                  </div>
                ) : settlement ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Notice Period: {settlement.noticePeriodDays} days
                        {settlement.bceanCompliant && ' (BCEA compliant)'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Earnings */}
                      <div>
                        <h4 className="font-medium mb-2">Earnings</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>Basic Salary</span>
                            <span>
                              {formatCurrency(settlement.finalPay.basicSalary / 100)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pro-rata</span>
                            <span>
                              {formatCurrency(settlement.finalPay.proRataAmount / 100)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Leave Encashment</span>
                            <span>
                              {formatCurrency(settlement.finalPay.leaveEncashment / 100)}
                            </span>
                          </div>
                          {settlement.finalPay.otherEarnings > 0 && (
                            <div className="flex justify-between">
                              <span>Other Earnings</span>
                              <span>
                                {formatCurrency(
                                  settlement.finalPay.otherEarnings / 100
                                )}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between font-medium border-t pt-1 mt-1">
                            <span>Total Gross</span>
                            <span>
                              {formatCurrency(settlement.finalPay.totalGross / 100)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Deductions */}
                      <div>
                        <h4 className="font-medium mb-2">Deductions</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>PAYE</span>
                            <span className="text-red-500">
                              -{formatCurrency(settlement.finalPay.deductions.paye / 100)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>UIF</span>
                            <span className="text-red-500">
                              -{formatCurrency(settlement.finalPay.deductions.uif / 100)}
                            </span>
                          </div>
                          {settlement.finalPay.deductions.other > 0 && (
                            <div className="flex justify-between">
                              <span>Other</span>
                              <span className="text-red-500">
                                -
                                {formatCurrency(
                                  settlement.finalPay.deductions.other / 100
                                )}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between font-medium border-t pt-1 mt-1 text-green-600">
                            <span>Net Pay</span>
                            <span>
                              {formatCurrency(settlement.finalPay.netPay / 100)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {settlement.documents.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                        <FileText className="h-4 w-4" />
                        <span>
                          Documents to generate: {settlement.documents.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Unable to calculate settlement preview
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Warning */}
          {reason && lastWorkingDate && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-yellow-800">
                This action will initiate the offboarding process. The staff member will
                be marked as offboarding and final settlement will be calculated.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={!reason || !lastWorkingDate || isInitiating}
            >
              {isInitiating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Initiate Offboarding'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
