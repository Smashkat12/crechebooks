'use client';

/**
 * Staff Filter Form Component
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

interface StaffFilter {
  isActive?: boolean;
  employmentType?: string[];
  department?: string;
  position?: string;
}

interface StaffFilterFormProps {
  value?: StaffFilter;
  onChange: (value: StaffFilter) => void;
}

export function StaffFilterForm({ value = {}, onChange }: StaffFilterFormProps) {
  const handleChange = (field: keyof StaffFilter, fieldValue: unknown) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="space-y-4">
      {/* Active Staff Only */}
      <div className="flex items-center space-x-3 rounded-lg border p-4">
        <Checkbox
          id="staffIsActive"
          checked={value.isActive ?? true}
          onCheckedChange={(checked) => handleChange('isActive', checked === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="staffIsActive">Active Staff Only</Label>
          <p className="text-sm text-muted-foreground">
            Only include currently employed staff
          </p>
        </div>
      </div>

      {/* Employment Type */}
      <div className="space-y-2">
        <Label>Employment Type</Label>
        <Select
          value={value.employmentType?.[0] ?? 'all'}
          onValueChange={(v) => handleChange('employmentType', v === 'all' ? undefined : [v])}
        >
          <SelectTrigger>
            <SelectValue placeholder="All employment types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="FULL_TIME">Full-time</SelectItem>
            <SelectItem value="PART_TIME">Part-time</SelectItem>
            <SelectItem value="CONTRACT">Contract</SelectItem>
            <SelectItem value="TEMPORARY">Temporary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Department */}
      <div className="space-y-2">
        <Label>Department</Label>
        <Select
          value={value.department ?? 'all'}
          onValueChange={(v) => handleChange('department', v === 'all' ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            <SelectItem value="teaching">Teaching</SelectItem>
            <SelectItem value="administration">Administration</SelectItem>
            <SelectItem value="kitchen">Kitchen</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="management">Management</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
