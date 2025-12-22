'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PayrollWizard } from '@/components/staff';
import { useStaffList } from '@/hooks/use-staff';
import type { IPayrollEntry } from '@crechebooks/types';

export default function PayrollPage() {
  const router = useRouter();
  const { data } = useStaffList({ status: 'active' });
  const now = new Date();

  const handleComplete = async (selectedStaff: string[], payrollEntries: IPayrollEntry[]): Promise<void> => {
    console.log('Processing payroll for:', selectedStaff, payrollEntries);
    // TODO: Implement actual payroll processing
    router.push('/staff');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Process monthly payroll for staff members
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statutory Deductions</CardTitle>
          <CardDescription>
            Standard South African payroll deductions applied automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">PAYE</span>
              <p className="text-muted-foreground">Pay As You Earn tax per SARS brackets</p>
            </div>
            <div>
              <span className="font-medium">UIF</span>
              <p className="text-muted-foreground">1% employee + 1% employer contribution</p>
            </div>
            <div>
              <span className="font-medium">SDL</span>
              <p className="text-muted-foreground">Skills Development Levy (if applicable)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PayrollWizard
        month={now.getMonth() + 1}
        year={now.getFullYear()}
        staff={data?.staff ?? []}
        onComplete={handleComplete}
        onCancel={() => router.push('/staff')}
      />
    </div>
  );
}
