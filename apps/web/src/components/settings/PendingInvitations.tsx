'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useTenantInvitations,
  useResendInvitation,
  useRevokeInvitation,
  InvitationStatus,
} from '@/hooks/useTenantUsers';
import { useToast } from '@/hooks/use-toast';
import { Mail, X, RefreshCw } from 'lucide-react';

interface PendingInvitationsProps {
  tenantId: string;
}

export function PendingInvitations({ tenantId }: PendingInvitationsProps) {
  const { toast } = useToast();
  const { data: invitations, isLoading } = useTenantInvitations(tenantId);
  const resendInvitation = useResendInvitation();
  const revokeInvitation = useRevokeInvitation();

  const handleResend = async (invitationId: string, email: string) => {
    try {
      await resendInvitation.mutateAsync({ tenantId, invitationId });
      toast({
        title: 'Invitation resent',
        description: `Invitation resent to ${email}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to resend invitation',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = async (invitationId: string, email: string) => {
    try {
      await revokeInvitation.mutateAsync({ tenantId, invitationId });
      toast({
        title: 'Invitation revoked',
        description: `Invitation to ${email} has been revoked`,
      });
    } catch (error) {
      toast({
        title: 'Failed to revoke invitation',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: InvitationStatus) => {
    const variants = {
      [InvitationStatus.PENDING]: 'default',
      [InvitationStatus.ACCEPTED]: 'success',
      [InvitationStatus.EXPIRED]: 'warning',
      [InvitationStatus.REVOKED]: 'destructive',
    } as const;

    return (
      <Badge variant={variants[status] as any}>{status.toLowerCase()}</Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const pendingInvitations =
    invitations?.filter((inv) => inv.status === InvitationStatus.PENDING) || [];

  if (pendingInvitations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>
            No pending invitations at this time
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invitations</CardTitle>
        <CardDescription>
          Manage outstanding invitations to join this tenant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingInvitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell className="font-medium">
                  {invitation.email}
                </TableCell>
                <TableCell>{invitation.role}</TableCell>
                <TableCell>
                  {format(new Date(invitation.createdAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>
                  {format(new Date(invitation.expiresAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleResend(invitation.id, invitation.email)
                    }
                    disabled={resendInvitation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      handleRevoke(invitation.id, invitation.email)
                    }
                    disabled={revokeInvitation.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
