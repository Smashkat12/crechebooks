'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { UserList } from '@/components/settings/UserList';
import { InviteUserModal } from '@/components/settings/InviteUserModal';
import { PendingInvitations } from '@/components/settings/PendingInvitations';
import { UserPlus } from 'lucide-react';
import { UserRole } from '@/hooks/useTenantUsers';

export default function UsersSettingsPage() {
  const { user } = useAuth();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // Get current tenant ID from user session
  // This should come from your auth context or session
  const currentTenantId = user?.tenantId || '';
  const currentUserRole = (user?.role as UserRole) || UserRole.VIEWER;

  // Only OWNER and ADMIN can access this page
  const canManageUsers =
    currentUserRole === UserRole.OWNER || currentUserRole === UserRole.ADMIN;

  if (!canManageUsers) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-2">
            You do not have permission to manage users
          </p>
        </div>
      </div>
    );
  }

  if (!currentTenantId || !user?.id) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage users and invitations for your tenant
          </p>
        </div>
        <Button onClick={() => setInviteModalOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      <UserList
        tenantId={currentTenantId}
        currentUserId={user.id}
        currentUserRole={currentUserRole}
      />

      <PendingInvitations tenantId={currentTenantId} />

      <InviteUserModal
        tenantId={currentTenantId}
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
      />
    </div>
  );
}
