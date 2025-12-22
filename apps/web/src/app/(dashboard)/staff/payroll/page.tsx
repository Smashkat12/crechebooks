'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
          <h1 className="text-3xl font-bold tracking-tight">Run Payroll</h1>
          <p className="text-muted-foreground">
            Process monthly payroll for staff members
          </p>
        </div>
      </div>

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
