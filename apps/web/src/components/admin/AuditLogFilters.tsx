'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterState {
  search: string;
  action: string;
  resourceType: string;
}

interface AuditLogFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  actions: string[];
  resourceTypes: string[];
}

export function AuditLogFilters({
  filters,
  onChange,
  actions,
  resourceTypes,
}: AuditLogFiltersProps) {
  return (
    <div className="flex gap-4 flex-wrap">
      <Input
        placeholder="Search logs..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="max-w-sm"
      />
      <Select
        value={filters.action || 'all'}
        onValueChange={(v) => onChange({ ...filters, action: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {actions.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.resourceType || 'all'}
        onValueChange={(v) => onChange({ ...filters, resourceType: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Resources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Resources</SelectItem>
          {resourceTypes.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
