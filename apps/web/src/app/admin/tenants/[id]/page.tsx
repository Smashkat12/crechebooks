'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAdminTenant, useSuspendTenant, useActivateTenant, useUpdateTenant } from '@/hooks/use-admin-tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, Users, Baby, Calendar, Mail, Phone, MapPin, Pause, Play, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  TRIAL: 'bg-blue-100 text-blue-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TenantDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: tenant, isLoading, error } = useAdminTenant(id);
  const { toast } = useToast();
  const suspendMutation = useSuspendTenant();
  const activateMutation = useActivateTenant();
  const updateMutation = useUpdateTenant();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const handleSuspend = async () => {
    if (confirm(`Suspend tenant "${tenant?.name}"? This will disable access for all users.`)) {
      await suspendMutation.mutateAsync({ id });
      toast({ title: 'Tenant suspended' });
    }
  };

  const handleActivate = async () => {
    await activateMutation.mutateAsync(id);
    toast({ title: 'Tenant activated' });
  };

  const handleEditOpen = () => {
    if (tenant) {
      setEditForm({
        name: tenant.name || '',
        email: tenant.email || '',
        phone: tenant.phone || '',
      });
      setIsEditOpen(true);
    }
  };

  const handleEditSave = async () => {
    await updateMutation.mutateAsync({ id, dto: editForm });
    toast({ title: 'Tenant updated' });
    setIsEditOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-6">
        <Link href="/admin/tenants" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Tenant not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/tenants" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{tenant.name}</h1>
              <Badge className={statusColors[tenant.subscriptionStatus] || 'bg-gray-100'}>
                {tenant.subscriptionStatus}
              </Badge>
            </div>
            <p className="text-muted-foreground">{tenant.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={handleEditOpen}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Tenant</DialogTitle>
                <DialogDescription>Update tenant information</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {tenant.subscriptionStatus === 'SUSPENDED' ? (
            <Button onClick={handleActivate} disabled={activateMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Activate
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleSuspend} disabled={suspendMutation.isPending}>
              <Pause className="mr-2 h-4 w-4" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.userCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Children</CardTitle>
            <Baby className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.childrenCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={statusColors[tenant.subscriptionStatus] || 'bg-gray-100'}>
              {tenant.subscriptionStatus}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Primary contact details for the tenant</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{tenant.email}</p>
              </div>
            </div>
            {tenant.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{tenant.phone}</p>
                </div>
              </div>
            )}
            {tenant.addressLine1 && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">
                    {tenant.addressLine1}
                    {tenant.city && `, ${tenant.city}`}
                    {tenant.province && `, ${tenant.province}`}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Owner Information */}
        <Card>
          <CardHeader>
            <CardTitle>Owner Information</CardTitle>
            <CardDescription>Primary owner of the tenant account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.ownerName && (
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{tenant.ownerName}</p>
              </div>
            )}
            {tenant.ownerEmail && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{tenant.ownerEmail}</p>
              </div>
            )}
            {!tenant.ownerName && !tenant.ownerEmail && (
              <p className="text-muted-foreground">No owner assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>Legal and registration details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.tradingName && (
              <div>
                <p className="text-sm text-muted-foreground">Trading Name</p>
                <p className="font-medium">{tenant.tradingName}</p>
              </div>
            )}
            {tenant.registrationNumber && (
              <div>
                <p className="text-sm text-muted-foreground">Registration Number</p>
                <p className="font-medium">{tenant.registrationNumber}</p>
              </div>
            )}
            {tenant.vatNumber && (
              <div>
                <p className="text-sm text-muted-foreground">VAT Number</p>
                <p className="font-medium">{tenant.vatNumber}</p>
              </div>
            )}
            {!tenant.tradingName && !tenant.registrationNumber && !tenant.vatNumber && (
              <p className="text-muted-foreground">No business information available</p>
            )}
          </CardContent>
        </Card>

        {/* Subscription & Integrations */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription & Integrations</CardTitle>
            <CardDescription>Subscription status and connected services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Subscription Status</p>
              <Badge className={statusColors[tenant.subscriptionStatus] || 'bg-gray-100'}>
                {tenant.subscriptionStatus}
              </Badge>
            </div>
            {tenant.trialExpiresAt && (
              <div>
                <p className="text-sm text-muted-foreground">Trial Expires</p>
                <p className="font-medium">{format(new Date(tenant.trialExpiresAt), 'PPP')}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Xero Connection</p>
              <p className="font-medium">
                {tenant.xeroConnectedAt
                  ? `Connected ${formatDistanceToNow(new Date(tenant.xeroConnectedAt), { addSuffix: true })}`
                  : 'Not connected'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Tenant ID</p>
              <p className="font-mono text-sm">{tenant.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm">{format(new Date(tenant.createdAt), 'PPpp')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm">{format(new Date(tenant.updatedAt), 'PPpp')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
