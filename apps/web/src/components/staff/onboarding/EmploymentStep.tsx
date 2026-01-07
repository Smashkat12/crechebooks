'use client';

/**
 * Employment Step
 * TASK-STAFF-001: Staff Onboarding - Step 2
 *
 * Collects employment-related information including:
 * - Job title and department
 * - Employment type and start date
 * - Work schedule and hours
 * - Salary and pay frequency
 */

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { useStaff } from '@/hooks/use-staff';

interface EmploymentStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

const EMPLOYMENT_TYPES = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PART_TIME', label: 'Part-Time' },
  { value: 'TEMPORARY', label: 'Temporary' },
];

const PAY_FREQUENCIES = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const DEPARTMENTS = [
  { value: 'teaching', label: 'Teaching' },
  { value: 'administration', label: 'Administration' },
  { value: 'support', label: 'Support Staff' },
  { value: 'management', label: 'Management' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'maintenance', label: 'Maintenance' },
];

export function EmploymentStep({ staffId, onComplete, isSubmitting, isEditing }: EmploymentStepProps) {
  const { data: staff } = useStaff(staffId);

  const [formData, setFormData] = useState({
    employeeNumber: '',
    jobTitle: '',
    department: '',
    employmentType: '',
    startDate: '',
    endDate: '',
    probationEndDate: '',
    workingHoursPerWeek: '',
    basicSalary: '',
    payFrequency: '',
    reportingManager: '',
  });

  // Pre-populate form with existing staff data
  useEffect(() => {
    if (staff) {
      setFormData((prev) => ({
        ...prev,
        employeeNumber: staff.employeeNumber || prev.employeeNumber,
        employmentType: staff.employmentType || prev.employmentType,
        startDate: staff.startDate
          ? new Date(staff.startDate).toISOString().split('T')[0]
          : prev.startDate,
        endDate: staff.endDate
          ? new Date(staff.endDate).toISOString().split('T')[0]
          : prev.endDate,
        basicSalary: staff.basicSalaryCents
          ? (staff.basicSalaryCents / 100).toString()
          : prev.basicSalary,
        payFrequency: staff.payFrequency || prev.payFrequency,
      }));
    }
  }, [staff]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Convert salary to cents for backend
    const dataToSubmit = {
      ...formData,
      basicSalaryCents: Math.round(parseFloat(formData.basicSalary) * 100),
      workingHoursPerWeek: parseInt(formData.workingHoursPerWeek, 10),
    };
    await onComplete(dataToSubmit);
  };

  // Format currency input
  const formatCurrency = (value: string) => {
    const num = value.replace(/[^\d.]/g, '');
    return num;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Position Details Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Position Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="employeeNumber">Employee Number</Label>
            <Input
              id="employeeNumber"
              name="employeeNumber"
              value={formData.employeeNumber}
              onChange={handleChange}
              placeholder="Auto-generated if blank"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job Title *</Label>
            <Input
              id="jobTitle"
              name="jobTitle"
              value={formData.jobTitle}
              onChange={handleChange}
              placeholder="e.g., Teacher, Administrator"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department *</Label>
            <Select
              value={formData.department}
              onValueChange={(value) => handleSelectChange('department', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reportingManager">Reporting Manager</Label>
            <Input
              id="reportingManager"
              name="reportingManager"
              value={formData.reportingManager}
              onChange={handleChange}
              placeholder="Manager's name"
            />
          </div>
        </div>
      </div>

      {/* Employment Terms Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Employment Terms
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="employmentType">Employment Type *</Label>
            <Select
              value={formData.employmentType}
              onValueChange={(value) => handleSelectChange('employmentType', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date *</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">
              End Date {formData.employmentType === 'CONTRACT' && '*'}
            </Label>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              value={formData.endDate}
              onChange={handleChange}
              required={formData.employmentType === 'CONTRACT'}
            />
            <p className="text-xs text-muted-foreground">
              Required for contract employees
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="probationEndDate">Probation End Date</Label>
            <Input
              id="probationEndDate"
              name="probationEndDate"
              type="date"
              value={formData.probationEndDate}
              onChange={handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workingHoursPerWeek">Working Hours/Week *</Label>
            <Input
              id="workingHoursPerWeek"
              name="workingHoursPerWeek"
              type="number"
              min="1"
              max="60"
              value={formData.workingHoursPerWeek}
              onChange={handleChange}
              placeholder="e.g., 40"
              required
            />
          </div>
        </div>
      </div>

      {/* Compensation Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Compensation
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="basicSalary">Basic Salary (R) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R
              </span>
              <Input
                id="basicSalary"
                name="basicSalary"
                type="text"
                inputMode="decimal"
                value={formData.basicSalary}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    basicSalary: formatCurrency(e.target.value),
                  }))
                }
                placeholder="0.00"
                className="pl-8"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the gross salary amount
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payFrequency">Pay Frequency *</Label>
            <Select
              value={formData.payFrequency}
              onValueChange={(value) => handleSelectChange('payFrequency', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {PAY_FREQUENCIES.map((freq) => (
                  <SelectItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
