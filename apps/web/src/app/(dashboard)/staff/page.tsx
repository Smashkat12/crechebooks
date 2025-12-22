'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StaffTable } from '@/components/staff';
import { useStaffList } from '@/hooks/use-staff';

export default function StaffPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useStaffList();

  if (error) {
    throw new Error(`Failed to load staff: ${error.message}`);
  }

  const filteredStaff = data?.staff.filter(
    (s) =>
      s.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      s.lastName?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
          <p className="text-muted-foreground">
            Manage staff members and payroll
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/payroll">
            <Button variant="outline">
              <Calculator className="h-4 w-4 mr-2" />
              Run Payroll
            </Button>
          </Link>
          <Link href="/staff/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StaffTable
            staff={filteredStaff}
            isLoading={isLoading}
            onView={(staff) => router.push(`/staff/${staff.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
