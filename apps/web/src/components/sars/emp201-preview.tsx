'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { ValidationWarnings } from './validation-warnings';

interface EMP201Data {
  period: string;
  totalPaye: number;
  totalUif: number;
  totalSdl: number;
  employees: {
    id: string;
    name: string;
    paye: number;
    uif: number;
    sdl: number;
  }[];
}

interface EMP201PreviewProps {
  data: EMP201Data;
  period: string;
}

export function EMP201Preview({ data, period }: EMP201PreviewProps) {
  const totalContributions = data.totalPaye + data.totalUif + data.totalSdl;

  const warnings = useMemo(() => {
    const result: { type: 'error' | 'warning' | 'info'; field?: string; message: string }[] = [];

    if (data.employees.length === 0) {
      result.push({ type: 'warning', message: 'No employees found for this period' });
    }

    data.employees.forEach((emp) => {
      if (emp.paye < 0) {
        result.push({ type: 'error', field: emp.name, message: 'PAYE cannot be negative' });
      }
    });

    // UIF cap check (based on 2024/2025 rates)
    const UIF_CAP = 177.12; // Monthly cap per person
    data.employees.forEach((emp) => {
      if (emp.uif > UIF_CAP) {
        result.push({
          type: 'warning',
          field: emp.name,
          message: `UIF exceeds monthly cap of ${formatCurrency(UIF_CAP)}`,
        });
      }
    });

    return result;
  }, [data]);

  const formatPeriod = (p: string) => {
    const [year, month] = p.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-ZA', {
      month: 'long',
    });
    return `${monthName} ${year}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">EMP201 Return</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Tax Period: {formatPeriod(period)}
            </p>
          </div>
          <Badge variant="default">{data.employees.length} Employees</Badge>
        </CardHeader>
        <CardContent>
          <ValidationWarnings warnings={warnings} className="mb-6" />

          {/* Summary Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">PAYE (Pay As You Earn)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.totalPaye)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">UIF (Unemployment Insurance)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.totalUif)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">SDL (Skills Development)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.totalSdl)}</p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10">
              <p className="text-sm text-muted-foreground">Total Payable</p>
              <p className="text-lg font-bold font-mono">{formatCurrency(totalContributions)}</p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Employee Breakdown */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Employee Contributions</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">UIF</TableHead>
                    <TableHead className="text-right">SDL</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.employees.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-8"
                      >
                        No employees
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(emp.paye)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(emp.uif)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(emp.sdl)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(emp.paye + emp.uif + emp.sdl)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {data.employees.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(data.totalPaye)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(data.totalUif)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(data.totalSdl)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatCurrency(totalContributions)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Reference</span>
              <span className="font-mono">EMP201-{period.replace('-', '')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date</span>
              <span>7th of the following month</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Amount Due</span>
              <span className="font-mono">{formatCurrency(totalContributions)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
