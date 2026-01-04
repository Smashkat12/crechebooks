'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserRole } from '@/hooks/useTenantUsers';

interface RoleSelectProps {
  value: UserRole;
  onChange: (value: UserRole) => void;
  disabled?: boolean;
}

const roleDescriptions: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Full access, can delete tenant',
  [UserRole.ADMIN]: 'Full access except tenant deletion',
  [UserRole.ACCOUNTANT]: 'Financial data access',
  [UserRole.VIEWER]: 'Read-only access',
};

export function RoleSelect({ value, onChange, disabled }: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(roleDescriptions).map(([role, description]) => (
          <SelectItem key={role} value={role}>
            <div className="flex flex-col items-start">
              <span className="font-medium">{role}</span>
              <span className="text-xs text-muted-foreground">
                {description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
