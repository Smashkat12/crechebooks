'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils/format';
import type { IStaff, IPayrollEntry } from '@crechebooks/types';

interface PayrollBreakdownProps {
  entries: IPayrollEntry[];
  staff: IStaff[];
  onViewPayslip?: (staffId: string) => void;
}

export function PayrollBreakdown({ entries, staff, onViewPayslip }: PayrollBreakdownProps) {
  const getStaffName = (staffId: string) => {
    const member = staff.find(s => s.id === staffId);
    return member ? `${member.firstName} ${member.lastName}` : 'Unknown';
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff Member</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">PAYE</TableHead>
            <TableHead className="text-right">UIF (Emp)</TableHead>
            <TableHead className="text-right">UIF (Er)</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.staffId}>
              <TableCell className="font-medium">
                {getStaffName(entry.staffId)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(entry.grossSalary / 100)}
              </TableCell>
              <TableCell className="text-right text-destructive">
                -{formatCurrency(entry.paye / 100)}
              </TableCell>
              <TableCell className="text-right text-destructive">
                -{formatCurrency(entry.uif / 100)}
              </TableCell>
              <TableCell className="text-right text-orange-600">
                {formatCurrency(entry.uifEmployer / 100)}
              </TableCell>
              <TableCell className="text-right font-medium text-green-600">
                {formatCurrency(entry.netSalary / 100)}
              </TableCell>
              <TableCell>
                {onViewPayslip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewPayslip(entry.staffId)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
