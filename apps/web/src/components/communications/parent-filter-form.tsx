'use client';

/**
 * Parent Filter Form Component
 * TASK-COMM-005: Recipient Selection Component
 */

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ParentFilter {
  isActive?: boolean;
  enrollmentStatus?: string[];
  feeStructureId?: string;
  hasOutstandingBalance?: boolean;
  daysOverdue?: number;
}

interface ParentFilterFormProps {
  value?: ParentFilter;
  onChange: (value: ParentFilter) => void;
}

export function ParentFilterForm({ value = {}, onChange }: ParentFilterFormProps) {
  const handleChange = (field: keyof ParentFilter, fieldValue: unknown) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="space-y-4">
      {/* Active Parents Only */}
      <div className="flex items-center space-x-3 rounded-lg border p-4">
        <Checkbox
          id="isActive"
          checked={value.isActive ?? true}
          onCheckedChange={(checked) => handleChange('isActive', checked === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="isActive">Active Parents Only</Label>
          <p className="text-sm text-muted-foreground">
            Only include parents with active enrollments
          </p>
        </div>
      </div>

      {/* Enrollment Status */}
      <div className="space-y-2">
        <Label>Enrollment Status</Label>
        <Select
          value={value.enrollmentStatus?.[0] ?? 'ACTIVE'}
          onValueChange={(v) => handleChange('enrollmentStatus', [v])}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select enrollment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
            <SelectItem value="GRADUATED">Graduated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Outstanding Balance */}
      <div className="flex items-center space-x-3 rounded-lg border p-4">
        <Checkbox
          id="hasOutstandingBalance"
          checked={value.hasOutstandingBalance ?? false}
          onCheckedChange={(checked) => handleChange('hasOutstandingBalance', checked === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="hasOutstandingBalance">Has Outstanding Balance</Label>
          <p className="text-sm text-muted-foreground">
            Only include parents with unpaid invoices
          </p>
        </div>
      </div>

      {/* Days Overdue */}
      {value.hasOutstandingBalance && (
        <div className="space-y-2">
          <Label>Minimum Days Overdue</Label>
          <Select
            value={String(value.daysOverdue ?? 0)}
            onValueChange={(v) => handleChange('daysOverdue', parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any overdue</SelectItem>
              <SelectItem value="7">7+ days</SelectItem>
              <SelectItem value="14">14+ days</SelectItem>
              <SelectItem value="30">30+ days</SelectItem>
              <SelectItem value="60">60+ days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
