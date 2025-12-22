'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StaffForm } from '@/components/staff';

export default function NewStaffPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Staff Member</h1>
          <p className="text-muted-foreground">
            Register a new staff member
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StaffForm
            onSave={async () => { router.push('/staff'); }}
            onCancel={() => router.push('/staff')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
