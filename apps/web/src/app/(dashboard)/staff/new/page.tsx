'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StaffForm } from '@/components/staff';
import { useCreateStaff } from '@/hooks/use-staff';
import { useToast } from '@/hooks/use-toast';

export default function NewStaffPage() {
  const router = useRouter();
  const createStaffMutation = useCreateStaff();
  const { toast } = useToast();

  const handleSave = async (data: Parameters<typeof createStaffMutation.mutateAsync>[0]) => {
    try {
      await createStaffMutation.mutateAsync(data);
      toast({
        title: 'Staff Created',
        description: 'Staff member has been added successfully.',
      });
      router.push('/staff');
    } catch (error) {
      console.error('Failed to create staff:', error);
      toast({
        title: 'Error',
        description: 'Failed to create staff member. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Add Staff Member</h1>
          <p className="text-muted-foreground">
            Register a new staff member
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StaffForm
            onSave={handleSave}
            onCancel={() => router.push('/staff')}
            isLoading={createStaffMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
