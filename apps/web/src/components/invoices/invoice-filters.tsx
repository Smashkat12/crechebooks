import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceStatus } from "@/types/invoice";

interface InvoiceFiltersProps {
  status?: InvoiceStatus | "all";
  onStatusChange: (status: InvoiceStatus | "all") => void;
  parentSearch?: string;
  onParentSearchChange: (search: string) => void;
  dateFrom?: string;
  onDateFromChange: (date: string) => void;
  dateTo?: string;
  onDateToChange: (date: string) => void;
  onReset: () => void;
}

export function InvoiceFilters({
  status = "all",
  onStatusChange,
  parentSearch = "",
  onParentSearchChange,
  dateFrom = "",
  onDateFromChange,
  dateTo = "",
  onDateToChange,
  onReset,
}: InvoiceFiltersProps) {
  const hasActiveFilters =
    status !== "all" || parentSearch || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger id="status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="parent">Parent Name</Label>
          <Input
            id="parent"
            placeholder="Search parents..."
            value={parentSearch}
            onChange={(e) => onParentSearchChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateFrom">From Date</Label>
          <div className="relative">
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
            />
            <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateTo">To Date</Label>
          <div className="relative">
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
            />
            <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}
