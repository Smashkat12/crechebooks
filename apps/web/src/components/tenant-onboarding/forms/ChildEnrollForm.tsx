'use client';

/**
 * Child Enrollment Inline Form
 * TASK-ACCT-UI-006: Inline form for onboarding wizard
 */

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateParent, useParentsList, useCreateChild } from '@/hooks/use-parents';
import { useFeeStructures } from '@/hooks/use-fee-structures';
import { useEnrollments } from '@/hooks/use-enrollments';
import { useToast } from '@/hooks/use-toast';

// Parent form schema
const parentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  preferredCommunication: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'BOTH']),
});

// Child form schema
const childSchema = z.object({
  parentId: z.string().min(1, 'Parent is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  feeStructureId: z.string().min(1, 'Fee structure is required'),
  startDate: z.string().min(1, 'Start date is required'),
});

type ParentFormData = z.infer<typeof parentSchema>;
type ChildFormData = z.infer<typeof childSchema>;

interface ChildEnrollFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function ChildEnrollForm({ onComplete, onCancel }: ChildEnrollFormProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'check' | 'parent' | 'child'>('check');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const { data: parents, isLoading: parentsLoading } = useParentsList();
  const { data: feeStructures, isLoading: feeStructuresLoading } = useFeeStructures();
  const { data: enrollments, isLoading: enrollmentsLoading } = useEnrollments({ status: 'active' });
  const createParent = useCreateParent();
  const createChild = useCreateChild();

  // Check if there are already enrollments
  const hasEnrollments = enrollments && enrollments.enrollments && enrollments.enrollments.length > 0;
  const hasParents = parents && parents.parents && parents.parents.length > 0;
  const hasFeeStructures = feeStructures && feeStructures.fee_structures.length > 0;

  // Parent form
  const parentForm = useForm<ParentFormData>({
    resolver: zodResolver(parentSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      preferredCommunication: 'EMAIL',
    },
  });

  // Child form
  const childForm = useForm<ChildFormData>({
    resolver: zodResolver(childSchema),
    defaultValues: {
      parentId: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: undefined,
      feeStructureId: '',
      startDate: new Date().toISOString().split('T')[0],
    },
  });

  const handleCreateParent = async (data: ParentFormData) => {
    try {
      const parent = await createParent.mutateAsync(data);
      setSelectedParentId(parent.id);
      childForm.setValue('parentId', parent.id);
      toast({
        title: 'Parent created',
        description: `${data.firstName} ${data.lastName} has been added.`,
      });
      setStep('child');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create parent. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateChild = async (data: ChildFormData) => {
    try {
      await createChild.mutateAsync(data);
      toast({
        title: 'Child enrolled',
        description: 'Your first child has been enrolled successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to enrol child. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSelectExistingParent = (parentId: string) => {
    setSelectedParentId(parentId);
    childForm.setValue('parentId', parentId);
    setStep('child');
  };

  if (parentsLoading || feeStructuresLoading || enrollmentsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If already has enrollments, show success
  if (hasEnrollments) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              You already have {enrollments.enrollments?.length} child(ren) enrolled.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // Check if no fee structures
  if (!hasFeeStructures) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-700">
            You need to create a fee structure before enrolling a child.
            Please complete the Fee Structure step first.
          </p>
        </div>
      </div>
    );
  }

  // Initial check step
  if (step === 'check') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Let&apos;s enrol your first child. Do you have a parent/guardian already set up?
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {hasParents && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-medium">Select Existing Parent</span>
              </div>
              <Select onValueChange={handleSelectExistingParent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose parent..." />
                </SelectTrigger>
                <SelectContent>
                  {parents?.parents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.firstName} {parent.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-center gap-2"
            onClick={() => setStep('parent')}
          >
            <UserPlus className="h-5 w-5 text-primary" />
            <span className="font-medium">Add New Parent</span>
          </Button>
        </div>
      </div>
    );
  }

  // Parent creation step
  if (step === 'parent') {
    return (
      <form onSubmit={parentForm.handleSubmit(handleCreateParent)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              {...parentForm.register('firstName')}
              placeholder="e.g., John"
            />
            {parentForm.formState.errors.firstName && (
              <p className="text-sm text-destructive">
                {parentForm.formState.errors.firstName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              {...parentForm.register('lastName')}
              placeholder="e.g., Smith"
            />
            {parentForm.formState.errors.lastName && (
              <p className="text-sm text-destructive">
                {parentForm.formState.errors.lastName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              {...parentForm.register('email')}
              placeholder="e.g., john@example.com"
            />
            {parentForm.formState.errors.email && (
              <p className="text-sm text-destructive">
                {parentForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              {...parentForm.register('phone')}
              placeholder="e.g., 082 123 4567"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="preferredCommunication">Preferred Contact Method *</Label>
            <Controller
              name="preferredCommunication"
              control={parentForm.control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="BOTH">Both Email & WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={createParent.isPending}>
            {createParent.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Continue to Child Details
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep('check')}>
            Back
          </Button>
        </div>
      </form>
    );
  }

  // Child enrollment step
  return (
    <form onSubmit={childForm.handleSubmit(handleCreateChild)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="childFirstName">Child&apos;s First Name *</Label>
          <Input
            id="childFirstName"
            {...childForm.register('firstName')}
            placeholder="e.g., Emma"
          />
          {childForm.formState.errors.firstName && (
            <p className="text-sm text-destructive">
              {childForm.formState.errors.firstName.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="childLastName">Child&apos;s Last Name *</Label>
          <Input
            id="childLastName"
            {...childForm.register('lastName')}
            placeholder="e.g., Smith"
          />
          {childForm.formState.errors.lastName && (
            <p className="text-sm text-destructive">
              {childForm.formState.errors.lastName.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth *</Label>
          <Input
            id="dateOfBirth"
            type="date"
            {...childForm.register('dateOfBirth')}
          />
          {childForm.formState.errors.dateOfBirth && (
            <p className="text-sm text-destructive">
              {childForm.formState.errors.dateOfBirth.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Controller
            name="gender"
            control={childForm.control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="feeStructureId">Fee Structure *</Label>
          <Controller
            name="feeStructureId"
            control={childForm.control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fee structure" />
                </SelectTrigger>
                <SelectContent>
                  {feeStructures?.fee_structures.map((fs) => (
                    <SelectItem key={fs.id} value={fs.id}>
                      {fs.name} - R{fs.amount.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {childForm.formState.errors.feeStructureId && (
            <p className="text-sm text-destructive">
              {childForm.formState.errors.feeStructureId.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Enrollment Start Date *</Label>
          <Input
            id="startDate"
            type="date"
            {...childForm.register('startDate')}
          />
          {childForm.formState.errors.startDate && (
            <p className="text-sm text-destructive">
              {childForm.formState.errors.startDate.message}
            </p>
          )}
        </div>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        This will create the first child enrollment for your creche.
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={createChild.isPending}>
          {createChild.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enrolling...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Enrol & Complete
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setStep('check')}>
          Back
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default ChildEnrollForm;
