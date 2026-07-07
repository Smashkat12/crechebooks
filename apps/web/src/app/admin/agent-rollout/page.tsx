'use client';

/**
 * Admin — Agent Rollout Console
 *
 * SUPER_ADMIN surface for flipping per-tenant SDK-agent modes between
 * DISABLED / SHADOW / PRIMARY, promoting via the automated criteria checker,
 * and hitting the safety brake for a whole tenant.
 *
 * Backs POST /admin/agent-rollout/:tenantId/:agentType and its siblings.
 */

import { useMemo, useState } from 'react';
import {
  AGENT_TYPE_LABELS,
  AgentRolloutRow,
  AgentType,
  RolloutMode,
  useAgentRollout,
  usePromoteAgent,
  useRollbackAllAgents,
  useSetAgentMode,
} from '@/hooks/use-admin-agent-rollout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { Bot, ShieldAlert, ArrowUpCircle } from 'lucide-react';

const MODE_COLOURS: Record<RolloutMode, string> = {
  DISABLED: 'bg-gray-100 text-gray-800',
  SHADOW: 'bg-blue-100 text-blue-800',
  PRIMARY: 'bg-green-100 text-green-800',
};

type PendingConfirm =
  | {
      kind: 'primary';
      row: AgentRolloutRow;
      reason: string;
      force: boolean;
    }
  | {
      kind: 'promote';
      row: AgentRolloutRow;
      reason: string;
    }
  | {
      kind: 'rollback';
      tenantId: string;
      tenantName: string;
      reason: string;
    }
  | null;

export default function AgentRolloutPage() {
  const [periodDays] = useState(7);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingConfirm>(null);

  const { data, isLoading, isError } = useAgentRollout(periodDays);
  const setMode = useSetAgentMode();
  const promote = usePromoteAgent();
  const rollback = useRollbackAllAgents();
  const { toast } = useToast();

  const groupedByTenant = useMemo(() => {
    const filter = search.trim().toLowerCase();
    const map = new Map<
      string,
      { tenantId: string; tenantName: string; rows: AgentRolloutRow[] }
    >();
    for (const row of data?.rows ?? []) {
      if (
        filter &&
        !row.tenantName.toLowerCase().includes(filter) &&
        !row.tenantId.toLowerCase().includes(filter)
      ) {
        continue;
      }
      const entry = map.get(row.tenantId) ?? {
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        rows: [],
      };
      entry.rows.push(row);
      map.set(row.tenantId, entry);
    }
    return Array.from(map.values());
  }, [data?.rows, search]);

  const handleSetMode = (row: AgentRolloutRow, newMode: RolloutMode) => {
    if (newMode === row.mode) return;
    const reason = window.prompt(
      `Reason for setting ${row.agentType} to ${newMode} for ${row.tenantName}?`,
      '',
    );
    if (!reason) return;

    if (newMode === 'PRIMARY') {
      // Require explicit confirmation for PRIMARY. If criteria are not met,
      // the operator has to pick "force" to bypass — safer default.
      setPending({
        kind: 'primary',
        row,
        reason,
        force: !row.meetsPromotionCriteria,
      });
      return;
    }

    setMode.mutate(
      {
        tenantId: row.tenantId,
        agentType: row.agentType,
        mode: newMode,
        reason,
      },
      {
        onSuccess: (res) => {
          if (res.success) {
            toast({
              title: 'Mode updated',
              description: `${AGENT_TYPE_LABELS[row.agentType]} is now ${res.newMode}`,
            });
          } else {
            toast({
              title: 'Update failed',
              description: res.reason ?? 'Unknown error',
              variant: 'destructive',
            });
          }
        },
        onError: (err) => {
          toast({
            title: 'Update failed',
            description: err instanceof Error ? err.message : String(err),
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handlePromote = (row: AgentRolloutRow) => {
    const reason = window.prompt(
      `Reason for auto-promoting ${row.agentType} for ${row.tenantName}?`,
      'Criteria met — promote to PRIMARY',
    );
    if (!reason) return;
    setPending({ kind: 'promote', row, reason });
  };

  const handleRollback = (tenantId: string, tenantName: string) => {
    const reason = window.prompt(
      `Reason for rolling back ALL agents to DISABLED for ${tenantName}? (safety brake)`,
      'Emergency rollback',
    );
    if (!reason) return;
    setPending({ kind: 'rollback', tenantId, tenantName, reason });
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === 'primary') {
      setMode.mutate(
        {
          tenantId: pending.row.tenantId,
          agentType: pending.row.agentType,
          mode: 'PRIMARY',
          reason: pending.reason,
          force: pending.force,
        },
        {
          onSuccess: (res) => {
            toast({
              title: res.success ? 'Promoted to PRIMARY' : 'Promotion blocked',
              description: res.success
                ? `${AGENT_TYPE_LABELS[pending.row.agentType]} is now PRIMARY`
                : (res.reason ?? 'Promotion criteria not met'),
              variant: res.success ? undefined : 'destructive',
            });
            setPending(null);
          },
          onError: (err) => {
            toast({
              title: 'Update failed',
              description: err instanceof Error ? err.message : String(err),
              variant: 'destructive',
            });
            setPending(null);
          },
        },
      );
    } else if (pending.kind === 'promote') {
      promote.mutate(
        {
          tenantId: pending.row.tenantId,
          agentType: pending.row.agentType,
          reason: pending.reason,
        },
        {
          onSuccess: (res) => {
            toast({
              title: res.success ? 'Auto-promoted' : 'Promotion blocked',
              description: res.success
                ? `${AGENT_TYPE_LABELS[pending.row.agentType]} is now PRIMARY`
                : (res.reason ?? 'Criteria not met'),
              variant: res.success ? undefined : 'destructive',
            });
            setPending(null);
          },
          onError: (err) => {
            toast({
              title: 'Update failed',
              description: err instanceof Error ? err.message : String(err),
              variant: 'destructive',
            });
            setPending(null);
          },
        },
      );
    } else if (pending.kind === 'rollback') {
      rollback.mutate(
        { tenantId: pending.tenantId, reason: pending.reason },
        {
          onSuccess: (res) => {
            toast({
              title: res.success ? 'Rollback complete' : 'Partial rollback',
              description: `All 5 agents set to DISABLED for ${pending.tenantName}`,
              variant: res.success ? undefined : 'destructive',
            });
            setPending(null);
          },
          onError: (err) => {
            toast({
              title: 'Rollback failed',
              description: err instanceof Error ? err.message : String(err),
              variant: 'destructive',
            });
            setPending(null);
          },
        },
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            Agent Rollout
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Flip SDK agents between DISABLED (heuristic only), SHADOW (LLM runs
            in the background and its output is logged) and PRIMARY (LLM output
            is used, heuristic is fallback). Every change is audit-logged.
          </p>
        </div>
        <Input
          placeholder="Filter tenants…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          data-testid="filter-input"
        />
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Loading rollout state…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-red-600">
            Failed to load rollout state.
          </CardContent>
        </Card>
      )}

      {!isLoading && groupedByTenant.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No tenants match your filter.
          </CardContent>
        </Card>
      )}

      {groupedByTenant.map((tenant) => (
        <Card key={tenant.tenantId} data-testid={`tenant-${tenant.tenantId}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{tenant.tenantName}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {tenant.tenantId}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                handleRollback(tenant.tenantId, tenant.tenantName)
              }
              disabled={rollback.isPending}
            >
              <ShieldAlert className="h-4 w-4 mr-2" />
              Rollback all
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Match rate</TableHead>
                  <TableHead className="text-right">Decisions ({periodDays}d)</TableHead>
                  <TableHead>Criteria</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.rows.map((row) => (
                  <TableRow
                    key={`${row.tenantId}-${row.agentType}`}
                    data-testid={`row-${row.tenantId}-${row.agentType}`}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {AGENT_TYPE_LABELS[row.agentType as AgentType]}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {row.flagKey}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={MODE_COLOURS[row.mode]}>
                        {row.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalDecisions > 0 ? `${row.matchRate}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalDecisions}
                    </TableCell>
                    <TableCell>
                      {row.meetsPromotionCriteria ? (
                        <Badge className="bg-green-100 text-green-800">
                          Ready
                        </Badge>
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          title={row.promotionBlockers.join('\n')}
                        >
                          {row.promotionBlockers[0] ?? '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={row.mode}
                          onValueChange={(v) =>
                            handleSetMode(row, v as RolloutMode)
                          }
                        >
                          <SelectTrigger
                            className="w-[120px]"
                            data-testid={`mode-select-${row.tenantId}-${row.agentType}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DISABLED">DISABLED</SelectItem>
                            <SelectItem value="SHADOW">SHADOW</SelectItem>
                            <SelectItem value="PRIMARY">PRIMARY</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePromote(row)}
                          disabled={
                            row.mode === 'PRIMARY' ||
                            !row.meetsPromotionCriteria ||
                            promote.isPending
                          }
                          data-testid={`promote-${row.tenantId}-${row.agentType}`}
                        >
                          <ArrowUpCircle className="h-4 w-4 mr-1" />
                          Auto-promote
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === 'rollback'
                ? `Disable ALL agents for ${pending.tenantName}?`
                : pending?.kind === 'promote'
                  ? `Promote ${pending.row.agentType} to PRIMARY?`
                  : pending?.kind === 'primary'
                    ? `Set ${pending.row.agentType} to PRIMARY?`
                    : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'rollback' && (
                <>
                  All 5 SDK agents will be set to DISABLED. This is a safety
                  brake and takes effect immediately.
                </>
              )}
              {pending?.kind === 'promote' && (
                <>
                  Automated promotion via RolloutPromotionService will only
                  succeed if go/no-go criteria (match rate, comparisons,
                  period) are met. Reason:{' '}
                  <em>{pending.reason}</em>
                </>
              )}
              {pending?.kind === 'primary' && (
                <>
                  PRIMARY mode means the LLM output is used for real. Heuristic
                  becomes the fallback path only.
                  {pending.force ? (
                    <span className="text-red-600 font-semibold">
                      {' '}
                      Force override enabled — promotion criteria are NOT met.
                    </span>
                  ) : (
                    ' Promotion criteria are met.'
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPending}
              data-testid="confirm-action"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
