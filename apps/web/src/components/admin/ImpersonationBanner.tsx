'use client';

/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * Banner component shown when super admin is impersonating a tenant
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useCurrentImpersonation,
  useEndImpersonation,
  formatTimeRemaining,
  type ImpersonationRole,
} from '@/hooks/use-impersonation';
import { AlertTriangle, Building2, Clock, LogOut, Shield, UserCog, Calculator, Eye } from 'lucide-react';

const ROLE_ICONS: Record<ImpersonationRole, typeof Shield> = {
  OWNER: Shield,
  ADMIN: UserCog,
  ACCOUNTANT: Calculator,
  VIEWER: Eye,
};

export function ImpersonationBanner() {
  const { data, isLoading } = useCurrentImpersonation();
  const endImpersonation = useEndImpersonation();
  const { toast } = useToast();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Update time remaining every second
  useEffect(() => {
    if (data?.isImpersonating && data.timeRemaining !== undefined) {
      setTimeRemaining(data.timeRemaining);

      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [data?.isImpersonating, data?.timeRemaining]);

  const handleExit = async () => {
    try {
      await endImpersonation.mutateAsync();
      toast({
        title: 'Impersonation Ended',
        description: 'You have returned to the admin portal.',
      });
    } catch (error) {
      toast({
        title: 'Failed to End Impersonation',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Don't render anything while loading or if not impersonating
  if (isLoading || !data?.isImpersonating || !data.session) {
    return null;
  }

  const session = data.session;
  const RoleIcon = ROLE_ICONS[session.assumedRole];
  const displayTimeRemaining = timeRemaining ?? data.timeRemaining ?? 0;
  const isExpiringSoon = displayTimeRemaining < 600; // Less than 10 minutes

  return (
    <div className="sticky top-0 z-[60] w-full bg-amber-500 text-amber-950 shadow-md">
      <div className="container flex items-center justify-between py-2 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Impersonation Active</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 border-l border-amber-600/30 pl-3">
            <Building2 className="h-4 w-4" />
            <span className="font-medium">{session.tenantName}</span>
          </div>

          <Badge
            variant="outline"
            className="border-amber-700 text-amber-900 bg-amber-100/50 gap-1"
          >
            <RoleIcon className="h-3 w-3" />
            {session.assumedRole}
          </Badge>

          <div className={`hidden md:flex items-center gap-1 text-sm ${isExpiringSoon ? 'text-red-800 font-medium' : ''}`}>
            <Clock className="h-4 w-4" />
            <span>{formatTimeRemaining(displayTimeRemaining)}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExit}
          disabled={endImpersonation.isPending}
          className="bg-white/90 hover:bg-white border-amber-700 text-amber-900 hover:text-amber-950 gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">
            {endImpersonation.isPending ? 'Exiting...' : 'Exit Impersonation'}
          </span>
          <span className="sm:hidden">Exit</span>
        </Button>
      </div>

      {/* Mobile-only second row for additional info */}
      <div className="sm:hidden flex items-center justify-between px-4 pb-2 text-xs">
        <div className="flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          <span>{session.tenantName}</span>
        </div>
        <div className={`flex items-center gap-1 ${isExpiringSoon ? 'text-red-800 font-medium' : ''}`}>
          <Clock className="h-3 w-3" />
          <span>{formatTimeRemaining(displayTimeRemaining)}</span>
        </div>
      </div>
    </div>
  );
}
