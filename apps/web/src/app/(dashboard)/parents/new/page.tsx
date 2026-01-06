'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ParentForm } from '@/components/parents';
import { useCreateParent } from '@/hooks/use-parents';
import { useToast } from '@/hooks/use-toast';

export default function NewParentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createParentMutation = useCreateParent();

  const handleSave = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    whatsappNumber?: string;
    address?: string;
    preferredCommunication: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH';
  }) => {
    try {
      await createParentMutation.mutateAsync(data);
      toast({
        title: 'Parent Created',
        description: `${data.firstName} ${data.lastName} has been added successfully.`,
      });
      router.push('/parents');
    } catch (error) {
      console.error('Failed to create parent:', error);
      toast({
        title: 'Error',
        description: 'Failed to create parent. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/parents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add New Parent</h1>
          <p className="text-muted-foreground">
            Register a new parent account
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parent Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ParentForm
            onSave={handleSave}
            onCancel={() => router.push('/parents')}
            isLoading={createParentMutation.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Children</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Save parent information first, then add children to their account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
