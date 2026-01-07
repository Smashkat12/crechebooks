'use client';

/**
 * Tax Info Step
 * TASK-STAFF-001: Staff Onboarding - Step 3
 *
 * Collects SARS tax-related information including:
 * - Tax reference number
 * - Tax status (resident/non-resident)
 * - Deductions and allowances
 * - UIF status
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStaff } from '@/hooks/use-staff';

interface TaxInfoStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

const TAX_STATUS_OPTIONS = [
  { value: 'RESIDENT', label: 'SA Tax Resident' },
  { value: 'NON_RESIDENT', label: 'Non-Resident' },
  { value: 'PENDING', label: 'Pending Assessment' },
];

export function TaxInfoStep({ staffId, onComplete, isSubmitting, isEditing }: TaxInfoStepProps) {
  const { data: staff } = useStaff(staffId);

  const [formData, setFormData] = useState({
    taxNumber: '',
    taxStatus: '',
    uifExempt: false,
    uifExemptReason: '',
    medicalAidMembers: '0',
    medicalAidContribution: '',
    retirementContribution: '',
    additionalTaxDeduction: '',
    taxDirective: false,
    taxDirectiveNumber: '',
  });

  // Pre-populate form with existing staff data
  useEffect(() => {
    if (staff) {
      setFormData((prev) => ({
        ...prev,
        taxNumber: staff.taxNumber || prev.taxNumber,
        medicalAidMembers: staff.medicalAidMembers?.toString() || prev.medicalAidMembers,
      }));
    }
  }, [staff]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dataToSubmit = {
      ...formData,
      medicalAidMembers: parseInt(formData.medicalAidMembers, 10),
      medicalAidContributionCents: formData.medicalAidContribution
        ? Math.round(parseFloat(formData.medicalAidContribution) * 100)
        : 0,
      retirementContributionCents: formData.retirementContribution
        ? Math.round(parseFloat(formData.retirementContribution) * 100)
        : 0,
      additionalTaxDeductionCents: formData.additionalTaxDeduction
        ? Math.round(parseFloat(formData.additionalTaxDeduction) * 100)
        : 0,
    };
    await onComplete(dataToSubmit);
  };

  // Validate SARS tax number format (10 digits)
  const isValidTaxNumber = (num: string) => /^\d{10}$/.test(num);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Tax information is required for SARS compliance. Please ensure all details match official
          SARS records to avoid payroll issues.
        </AlertDescription>
      </Alert>

      {/* Tax Registration Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Tax Registration
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="taxNumber">SARS Tax Reference Number</Label>
            <Input
              id="taxNumber"
              name="taxNumber"
              value={formData.taxNumber}
              onChange={handleChange}
              placeholder="10-digit tax number"
              maxLength={10}
            />
            {formData.taxNumber && !isValidTaxNumber(formData.taxNumber) && (
              <p className="text-xs text-destructive">Tax number must be 10 digits</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxStatus">Tax Status *</Label>
            <Select
              value={formData.taxStatus}
              onValueChange={(value) => handleSelectChange('taxStatus', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tax status" />
              </SelectTrigger>
              <SelectContent>
                {TAX_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* UIF Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          UIF (Unemployment Insurance Fund)
        </h4>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="uifExempt"
              checked={formData.uifExempt}
              onCheckedChange={(checked) => handleCheckboxChange('uifExempt', checked as boolean)}
            />
            <Label htmlFor="uifExempt" className="font-normal">
              Employee is exempt from UIF contributions
            </Label>
          </div>
          {formData.uifExempt && (
            <div className="space-y-2 ml-6">
              <Label htmlFor="uifExemptReason">Exemption Reason *</Label>
              <Input
                id="uifExemptReason"
                name="uifExemptReason"
                value={formData.uifExemptReason}
                onChange={handleChange}
                placeholder="e.g., Learnership, Foreign worker"
                required={formData.uifExempt}
              />
            </div>
          )}
        </div>
      </div>

      {/* Deductions Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Tax Deductions
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="medicalAidMembers">Medical Aid Members</Label>
            <Select
              value={formData.medicalAidMembers}
              onValueChange={(value) => handleSelectChange('medicalAidMembers', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Number of members" />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num === 0 ? 'No medical aid' : `${num} member${num > 1 ? 's' : ''}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for medical aid tax credit calculation
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicalAidContribution">Monthly Medical Aid Contribution (R)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R
              </span>
              <Input
                id="medicalAidContribution"
                name="medicalAidContribution"
                type="text"
                inputMode="decimal"
                value={formData.medicalAidContribution}
                onChange={handleChange}
                placeholder="0.00"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retirementContribution">
              Monthly Retirement Fund Contribution (R)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R
              </span>
              <Input
                id="retirementContribution"
                name="retirementContribution"
                type="text"
                inputMode="decimal"
                value={formData.retirementContribution}
                onChange={handleChange}
                placeholder="0.00"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalTaxDeduction">Additional Tax Deduction (R)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R
              </span>
              <Input
                id="additionalTaxDeduction"
                name="additionalTaxDeduction"
                type="text"
                inputMode="decimal"
                value={formData.additionalTaxDeduction}
                onChange={handleChange}
                placeholder="0.00"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Additional PAYE requested by employee
            </p>
          </div>
        </div>
      </div>

      {/* Tax Directive Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Tax Directive
        </h4>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="taxDirective"
              checked={formData.taxDirective}
              onCheckedChange={(checked) =>
                handleCheckboxChange('taxDirective', checked as boolean)
              }
            />
            <Label htmlFor="taxDirective" className="font-normal">
              Employee has a SARS tax directive
            </Label>
          </div>
          {formData.taxDirective && (
            <div className="space-y-2 ml-6">
              <Label htmlFor="taxDirectiveNumber">Tax Directive Number *</Label>
              <Input
                id="taxDirectiveNumber"
                name="taxDirectiveNumber"
                value={formData.taxDirectiveNumber}
                onChange={handleChange}
                placeholder="Enter directive number"
                required={formData.taxDirective}
              />
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Update & Return' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
