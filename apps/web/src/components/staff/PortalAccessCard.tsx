'use client';

import { useState } from 'react';
import { Loader2, Send, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils/format';
import {
  useStaffInviteStatus,
  useSendStaffInvite,
  useRevokeStaffInvite,
} from '@/hooks/admin/use-staff-invite';
import type { StaffInviteStatus } from '@/lib/api/staff';

interface PortalAccessCardProps {
  staffId: string;
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  className?: string;
}

const STATUS_META: Record<StaffInviteStatus, StatusMeta> = {
  NOT_INVITED: { label: 'Not invited', variant: 'secondary' },
  PENDING: { label: 'Invite pending', variant: 'outline', className: 'border-amber-500 text-amber-700 bg-amber-50' },
  ACCEPTED: { label: 'Active', variant: 'default', className: 'bg-green-600 text-white hover:bg-green-600' },
  EXPIRED: { label: 'Invite expired', variant: 'destructive' },
  REVOKED: { label: 'Invite revoked', variant: 'secondary' },
};

export function PortalAccessCard({ staffId }: PortalAccessCardProps) {
  const { data: inviteStatus, isLoading } = useStaffInviteStatus(staffId);
  const sendInvite = useSendStaffInvite(staffId);
  const revokeInvite = useRevokeStaffInvite(staffId);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const handleSend = () => {
    sendInvite.mutate();
  };

  const handleRevoke = () => {
    if (!inviteStatus?.invitationId) return;
    revokeInvite.mutate(inviteStatus.invitationId, {
      onSuccess: () => setRevokeOpen(false),
    });
  };

  const status = inviteStatus?.status ?? 'NOT_INVITED';
  const meta = STATUS_META[status];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Portal Access</CardTitle>
          {isLoading ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <Badge
              variant={meta.variant}
              className={meta.className}
            >
              {meta.label}
              {status === 'PENDING' && inviteStatus?.expiresAt && (
                <span className="ml-1 font-normal">
                  — expires {formatDate(inviteStatus.expiresAt)}
                </span>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Sub-text */}
            {status === 'ACCEPTED' && inviteStatus?.acceptedAt && (
              <p className="text-sm text-muted-foreground">
                Accepted on {formatDate(inviteStatus.acceptedAt)}
              </p>
            )}
            {status === 'NOT_INVITED' && (
              <p className="text-sm text-muted-foreground">
                Send an invite to give this staff member access to the staff portal.
              </p>
            )}
            {(status === 'EXPIRED' || status === 'REVOKED') && inviteStatus?.createdAt && (
              <p className="text-sm text-muted-foreground">
                Last invite sent {formatDate(inviteStatus.createdAt)}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-1">
              {status === 'NOT_INVITED' && (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sendInvite.isPending}
                >
                  {sendInvite.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send invite
                </Button>
              )}

              {status === 'PENDING' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSend}
                    disabled={sendInvite.isPending}
                  >
                    {sendInvite.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Resend invite
                  </Button>

                  <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={revokeInvite.isPending}
                      >
                        {revokeInvite.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Revoke invite
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The pending invite link will be invalidated. You can
                          send a new invitation at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleRevoke}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              {(status === 'EXPIRED' || status === 'REVOKED') && (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sendInvite.isPending}
                >
                  {sendInvite.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send new invite
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
