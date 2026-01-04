'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useInviteUser, UserRole } from '@/hooks/useTenantUsers';
import { useToast } from '@/hooks/use-toast';

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(UserRole),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteUserModalProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleDescriptions: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Full access, can delete tenant',
  [UserRole.ADMIN]: 'Full access except tenant deletion',
  [UserRole.ACCOUNTANT]: 'Financial data access',
  [UserRole.VIEWER]: 'Read-only access',
};

export function InviteUserModal({
  tenantId,
  open,
  onOpenChange,
}: InviteUserModalProps) {
  const { toast } = useToast();
  const inviteUser = useInviteUser();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      role: UserRole.VIEWER,
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: InviteFormData) => {
    try {
      await inviteUser.mutateAsync({
        tenantId,
        email: data.email,
        role: data.role,
      });

      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${data.email}`,
      });

      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to send invitation',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to join this tenant
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setValue('role', value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleDescriptions).map(([role, description]) => (
                  <SelectItem key={role} value={role}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{role}</span>
                      <span className="text-xs text-muted-foreground">
                        {description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteUser.isPending}>
              {inviteUser.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
