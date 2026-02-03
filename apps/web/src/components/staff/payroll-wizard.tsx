'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, Users, Calculator, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { PayrollBreakdown } from './payroll-breakdown';
import { PayslipPreview } from './payslip-preview';
import { formatCurrency } from '@/lib/utils/format';
import type { IStaff, IPayrollEntry } from '@crechebooks/types';
import { UIF_CONSTANTS } from '@crechebooks/types';

interface PayrollWizardProps {
  month: number;
  year: number;
  staff: IStaff[];
  onComplete: (selectedStaff: string[], payrollEntries: IPayrollEntry[]) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

type WizardStep = 'select' | 'calculate' | 'review' | 'confirm';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'select', label: 'Select Staff', icon: Users },
  { key: 'calculate', label: 'Calculate', icon: Calculator },
  { key: 'review', label: 'Review', icon: FileCheck },
  { key: 'confirm', label: 'Confirm', icon: Check },
];

// 2024/2025 SARS Tax Tables (simplified)
function calculatePAYE(annualIncome: number): number {
  const brackets = [
    { min: 0, max: 237100, rate: 0.18, base: 0 },
    { min: 237101, max: 370500, rate: 0.26, base: 42678 },
    { min: 370501, max: 512800, rate: 0.31, base: 77362 },
    { min: 512801, max: 673000, rate: 0.36, base: 121475 },
    { min: 673001, max: 857900, rate: 0.39, base: 179147 },
    { min: 857901, max: 1817000, rate: 0.41, base: 251258 },
    { min: 1817001, max: Infinity, rate: 0.45, base: 644489 },
  ];

  const bracket = brackets.find(b => annualIncome >= b.min && annualIncome <= b.max);
  if (!bracket) return 0;

  const tax = bracket.base + (annualIncome - bracket.min + 1) * bracket.rate;
  return Math.round(tax / 12); // Monthly PAYE
}

// UIF calculation using shared constants from @crechebooks/types
// Reference: SARS 2024/2025 rates - UI Act No. 63 of 2001
function calculateUIF(monthlyGross: number): { employee: number; employer: number } {
  // UIF is calculated on gross salary, capped at the monthly ceiling
  const cappedGross = Math.min(monthlyGross, UIF_CONSTANTS.UIF_CEILING_MONTHLY);
  const employeeContribution = Math.min(
    Math.round(cappedGross * UIF_CONSTANTS.UIF_RATE_EMPLOYEE * 100) / 100,
    UIF_CONSTANTS.UIF_CAP_MONTHLY
  );
  const employerContribution = Math.min(
    Math.round(cappedGross * UIF_CONSTANTS.UIF_RATE_EMPLOYER * 100) / 100,
    UIF_CONSTANTS.UIF_CAP_MONTHLY
  );
  return { employee: employeeContribution, employer: employerContribution };
}

export function PayrollWizard({
  month,
  year,
  staff,
  onComplete,
  onCancel,
  isLoading = false,
}: PayrollWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
    staff.filter(s => s.status === 'ACTIVE').map(s => s.id)
  );
  const [payrollEntries, setPayrollEntries] = useState<IPayrollEntry[]>([]);
  const [previewStaff, setPreviewStaff] = useState<IStaff | null>(null);

  const activeStaff = staff.filter(s => s.status === 'ACTIVE');
  const periodLabel = format(new Date(year, month - 1), 'MMMM yyyy');

  const toggleStaff = (staffId: string) => {
    setSelectedStaffIds(prev =>
      prev.includes(staffId)
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
  };

  const calculatePayroll = () => {
    const entries: IPayrollEntry[] = selectedStaffIds.map(staffId => {
      const staffMember = staff.find(s => s.id === staffId)!;
      const grossSalary = staffMember.salary / 100; // Convert from cents
      const annualSalary = grossSalary * 12;
      const paye = calculatePAYE(annualSalary);
      const uif = calculateUIF(grossSalary);

      return {
        id: `temp-${staffId}`,
        payrollPeriodId: '',
        staffId,
        grossSalary: staffMember.salary,
        paye: Math.round(paye * 100),
        uif: Math.round(uif.employee * 100),
        uifEmployer: Math.round(uif.employer * 100),
        netSalary: Math.round((grossSalary - paye - uif.employee) * 100),
        deductions: [],
      };
    });

    setPayrollEntries(entries);
    setCurrentStep('review');
  };

  const handleConfirm = async () => {
    await onComplete(selectedStaffIds, payrollEntries);
  };

  const getStepIndex = (step: WizardStep) => STEPS.findIndex(s => s.key === step);
  const currentStepIndex = getStepIndex(currentStep);

  const goNext = () => {
    if (currentStep === 'select') {
      setCurrentStep('calculate');
      calculatePayroll();
    } else if (currentStep === 'calculate' || currentStep === 'review') {
      setCurrentStep('confirm');
    }
  };

  const goBack = () => {
    if (currentStep === 'calculate' || currentStep === 'review') {
      setCurrentStep('select');
    } else if (currentStep === 'confirm') {
      setCurrentStep('review');
    }
  };

  const totals = payrollEntries.reduce(
    (acc, entry) => ({
      gross: acc.gross + entry.grossSalary,
      paye: acc.paye + entry.paye,
      uif: acc.uif + entry.uif,
      uifEmployer: acc.uifEmployer + entry.uifEmployer,
      net: acc.net + entry.netSalary,
    }),
    { gross: 0, paye: 0, uif: 0, uifEmployer: 0, net: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-muted bg-muted'
                }`}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    isCompleted ? 'bg-green-500' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll for {periodLabel}</CardTitle>
          <CardDescription>
            {currentStep === 'select' && 'Select staff members to include in this payroll run'}
            {currentStep === 'calculate' && 'Calculating payroll...'}
            {currentStep === 'review' && 'Review calculated payroll entries'}
            {currentStep === 'confirm' && 'Confirm and process payroll'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Select Step */}
          {currentStep === 'select' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedStaffIds.length === activeStaff.length}
                  disabled={isLoading}
                  onCheckedChange={(checked) => {
                    setSelectedStaffIds(checked ? activeStaff.map(s => s.id) : []);
                  }}
                />
                <Label htmlFor="select-all" className="font-medium">
                  Select All Active Staff ({activeStaff.length})
                </Label>
              </div>
              <div className="space-y-2 border-t pt-4">
                {activeStaff.map((staffMember) => (
                  <div
                    key={staffMember.id}
                    className="flex items-center justify-between p-3 rounded border"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`staff-${staffMember.id}`}
                        checked={selectedStaffIds.includes(staffMember.id)}
                        disabled={isLoading}
                        onCheckedChange={() => toggleStaff(staffMember.id)}
                      />
                      <Label htmlFor={`staff-${staffMember.id}`}>
                        {staffMember.firstName} {staffMember.lastName}
                        <span className="text-muted-foreground ml-2">
                          ({staffMember.employeeNumber})
                        </span>
                      </Label>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(staffMember.salary / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Step */}
          {(currentStep === 'review' || currentStep === 'calculate') && (
            <div className="space-y-4">
              <PayrollBreakdown
                entries={payrollEntries}
                staff={staff}
                onViewPayslip={(staffId) => {
                  const member = staff.find(s => s.id === staffId);
                  if (member) setPreviewStaff(member);
                }}
              />
              <div className="border-t pt-4 mt-4">
                <div className="grid grid-cols-5 gap-4 font-medium">
                  <div>Total Gross</div>
                  <div>Total PAYE</div>
                  <div>Total UIF (Emp)</div>
                  <div>Total UIF (Employer)</div>
                  <div>Total Net</div>
                </div>
                <div className="grid grid-cols-5 gap-4 text-lg mt-2">
                  <div>{formatCurrency(totals.gross / 100)}</div>
                  <div className="text-destructive">{formatCurrency(totals.paye / 100)}</div>
                  <div className="text-destructive">{formatCurrency(totals.uif / 100)}</div>
                  <div className="text-orange-600">{formatCurrency(totals.uifEmployer / 100)}</div>
                  <div className="text-green-600 font-bold">{formatCurrency(totals.net / 100)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Step */}
          {currentStep === 'confirm' && (
            <div className="space-y-4 text-center py-6">
              <Check className="h-16 w-16 mx-auto text-green-500" />
              <h3 className="text-xl font-semibold">Ready to Process</h3>
              <p className="text-muted-foreground">
                You are about to process payroll for {selectedStaffIds.length} staff members.
                <br />
                Total net payment: <strong>{formatCurrency(totals.net / 100)}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <div>
          {currentStep !== 'select' && (
            <Button variant="outline" onClick={goBack} disabled={isLoading}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {onCancel && currentStep === 'select' && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
        <div>
          {currentStep === 'confirm' ? (
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Payroll'
              )}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={selectedStaffIds.length === 0 || isLoading}
            >
              {currentStep === 'select' ? 'Calculate' : 'Continue'}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Payslip Preview Dialog */}
      {previewStaff && (
        <PayslipPreview
          staff={previewStaff}
          entry={payrollEntries.find(e => e.staffId === previewStaff.id)!}
          period={{ year, month }}
          open={!!previewStaff}
          onOpenChange={(open) => !open && setPreviewStaff(null)}
        />
      )}
    </div>
  );
}
