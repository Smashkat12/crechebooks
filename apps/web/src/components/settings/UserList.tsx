'use client';

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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserRow } from './UserRow';
import { useTenantUsers, UserRole } from '@/hooks/useTenantUsers';

interface UserListProps {
  tenantId: string;
  currentUserId: string;
  currentUserRole: UserRole;
}

export function UserList({
  tenantId,
  currentUserId,
  currentUserRole,
}: UserListProps) {
  const { data: users, isLoading } = useTenantUsers(tenantId);

  const canModify =
    currentUserRole === UserRole.OWNER || currentUserRole === UserRole.ADMIN;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tenant Users</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  if (!users || users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tenant Users</CardTitle>
          <CardDescription>No users found</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant Users</CardTitle>
        <CardDescription>
          Manage user access and roles for this tenant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentUserId={currentUserId}
                tenantId={tenantId}
                canModify={canModify}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
