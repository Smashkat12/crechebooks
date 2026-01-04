'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RoleSelect } from './RoleSelect';
import {
  TenantUser,
  UserRole,
  useUpdateUserRole,
  useRemoveUser,
} from '@/hooks/useTenantUsers';
import { useToast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';

interface UserRowProps {
  user: TenantUser;
  currentUserId: string;
  tenantId: string;
  canModify: boolean;
}

export function UserRow({
  user,
  currentUserId,
  tenantId,
  canModify,
}: UserRowProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const updateUserRole = useUpdateUserRole();
  const removeUser = useRemoveUser();

  const isSelf = user.userId === currentUserId;
  const isOwner = user.role === UserRole.OWNER;

  const handleRoleChange = async (newRole: UserRole) => {
    if (isSelf) {
      toast({
        title: 'Cannot change own role',
        description: 'You cannot change your own role',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateUserRole.mutateAsync({
        tenantId,
        userId: user.userId,
        role: newRole,
      });

      toast({
        title: 'Role updated',
        description: `${user.user.name}'s role has been updated to ${newRole}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to update role',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async () => {
    try {
      await removeUser.mutateAsync({
        tenantId,
        userId: user.userId,
      });

      toast({
        title: 'User removed',
        description: `${user.user.name} has been removed from this tenant`,
      });

      setShowDeleteDialog(false);
    } catch (error) {
      toast({
        title: 'Failed to remove user',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{user.user.name}</TableCell>
        <TableCell>{user.user.email}</TableCell>
        <TableCell>
          <RoleSelect
            value={user.role}
            onChange={handleRoleChange}
            disabled={!canModify || isSelf || isOwner}
          />
        </TableCell>
        <TableCell>
          <Badge variant={user.isActive ? 'success' : 'destructive'}>
            {user.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </TableCell>
        <TableCell>
          {format(new Date(user.joinedAt), 'MMM d, yyyy')}
        </TableCell>
        <TableCell className="text-right">
          {canModify && !isSelf && !isOwner && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove
            </Button>
          )}
          {isSelf && (
            <span className="text-sm text-muted-foreground">You</span>
          )}
          {isOwner && !isSelf && (
            <span className="text-sm text-muted-foreground">Owner</span>
          )}
        </TableCell>
      </TableRow>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {user.user.name} from this tenant?
              They will lose access to all tenant data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
