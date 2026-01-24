'use client';

/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * Dialog component for super admins to select a tenant and role to impersonate
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useTenantsForImpersonation,
  useStartImpersonation,
  type ImpersonationRole,
  type TenantForImpersonation,
} from '@/hooks/use-impersonation';
import {
  Building2,
  Users,
  Baby,
  Search,
  ArrowRightCircle,
  Shield,
  Eye,
  Calculator,
  UserCog,
} from 'lucide-react';

const ROLE_INFO: Record<ImpersonationRole, { icon: typeof Shield; label: string; description: string }> = {
  OWNER: {
    icon: Shield,
    label: 'Owner',
    description: 'Full access to all tenant features and settings',
  },
  ADMIN: {
    icon: UserCog,
    label: 'Admin',
    description: 'Manage users, settings, and daily operations',
  },
  ACCOUNTANT: {
    icon: Calculator,
    label: 'Accountant',
    description: 'Access to financial data, invoices, and reports',
  },
  VIEWER: {
    icon: Eye,
    label: 'Viewer',
    description: 'Read-only access to tenant data',
  },
};

interface TenantCardProps {
  tenant: TenantForImpersonation;
  isSelected: boolean;
  onSelect: () => void;
}

function TenantCard({ tenant, isSelected, onSelect }: TenantCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">{tenant.name}</span>
          </div>
          {tenant.tradingName && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              Trading as: {tenant.tradingName}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 truncate">{tenant.email}</p>
        </div>
        <Badge
          variant={tenant.subscriptionStatus === 'ACTIVE' ? 'default' : 'secondary'}
          className="ml-2 flex-shrink-0"
        >
          {tenant.subscriptionStatus}
        </Badge>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {tenant.userCount} users
        </span>
        <span className="flex items-center gap-1">
          <Baby className="h-3 w-3" />
          {tenant.childCount} children
        </span>
      </div>
    </button>
  );
}

export function TenantSwitcher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<TenantForImpersonation | null>(null);
  const [selectedRole, setSelectedRole] = useState<ImpersonationRole | null>(null);
  const [reason, setReason] = useState('');
  const { toast } = useToast();

  const { data, isLoading } = useTenantsForImpersonation(search);
  const startImpersonation = useStartImpersonation();

  const filteredTenants = useMemo(() => {
    if (!data?.tenants) return [];
    return data.tenants;
  }, [data?.tenants]);

  const handleStart = async () => {
    if (!selectedTenant || !selectedRole) {
      toast({
        title: 'Selection Required',
        description: 'Please select a tenant and role to continue.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await startImpersonation.mutateAsync({
        tenantId: selectedTenant.id,
        role: selectedRole,
        reason: reason.trim() || undefined,
      });

      toast({
        title: 'Impersonation Started',
        description: `Now viewing ${selectedTenant.name} as ${ROLE_INFO[selectedRole].label}`,
      });

      setOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Failed to Start Impersonation',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setSelectedTenant(null);
    setSelectedRole(null);
    setReason('');
    setSearch('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowRightCircle className="h-4 w-4" />
          Switch to Tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Switch to Tenant View
          </DialogTitle>
          <DialogDescription>
            Select a tenant and role to view the platform as that user type. This creates an
            impersonation session that will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tenants by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tenant List */}
          <div>
            <Label className="text-sm font-medium">Select Tenant</Label>
            <ScrollArea className="h-[200px] mt-2 rounded-md border p-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Building2 className="h-8 w-8 mb-2" />
                  <p>No tenants found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTenants.map((tenant) => (
                    <TenantCard
                      key={tenant.id}
                      tenant={tenant}
                      isSelected={selectedTenant?.id === tenant.id}
                      onSelect={() => setSelectedTenant(tenant)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Role Selection */}
          {selectedTenant && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Role</Label>
              <Select
                value={selectedRole || ''}
                onValueChange={(value) => setSelectedRole(value as ImpersonationRole)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role to assume..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedTenant.availableRoles.map((role) => {
                    const info = ROLE_INFO[role];
                    const Icon = info.icon;
                    return (
                      <SelectItem key={role} value={role}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{info.label}</span>
                          <span className="text-muted-foreground text-xs">
                            - {info.description}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason (Optional) */}
          {selectedTenant && selectedRole && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Reason <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="Enter a reason for this impersonation session (for audit purposes)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{reason.length}/500 characters</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={!selectedTenant || !selectedRole || startImpersonation.isPending}
            >
              {startImpersonation.isPending ? 'Starting...' : 'Start Impersonation'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
