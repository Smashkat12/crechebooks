'use client';

/**
 * SarsReadinessChecklist
 *
 * Displays the next SARS filing deadline and any blocking data-completeness
 * issues (uncategorised transactions, unreconciled bank lines, missing payslips,
 * VAT gaps).  Read-only.  Sits at the top of /sars hub page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSarsReadiness, SarsReadiness, ReadinessBlocker } from '@/lib/api/sars';

// ─── Severity styling ──────────────────────────────────────────────────────

const severityConfig = {
  critical: {
    icon: AlertCircle,
    rowClass: 'border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20',
    iconClass: 'text-red-500',
    badgeVariant: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    rowClass: 'border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20',
    iconClass: 'text-amber-500',
    badgeVariant: 'outline' as const,
  },
  info: {
    icon: Info,
    rowClass: 'border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950/20',
    iconClass: 'text-blue-500',
    badgeVariant: 'secondary' as const,
  },
} as const;

// ─── Sub-components ────────────────────────────────────────────────────────

function BlockerRow({ blocker }: { blocker: ReadinessBlocker }) {
  const cfg = severityConfig[blocker.severity];
  const Icon = cfg.icon;

  return (
    <div className={cn('flex items-start gap-3 rounded-md p-3', cfg.rowClass)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cfg.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{blocker.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{blocker.description}</p>
      </div>
      {blocker.deepLinkUrl && (
        <Link href={blocker.deepLinkUrl} className="shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs">
            Fix
          </Button>
        </Link>
      )}
    </div>
  );
}

function DeadlineCountdown({ data }: { data: SarsReadiness }) {
  const { nextDeadline } = data;
  const overdue = nextDeadline.daysRemaining < 0;
  const urgent = nextDeadline.daysRemaining >= 0 && nextDeadline.daysRemaining <= 5;

  const daysLabel = overdue
    ? `${Math.abs(nextDeadline.daysRemaining)} day${Math.abs(nextDeadline.daysRemaining) === 1 ? '' : 's'} overdue`
    : nextDeadline.daysRemaining === 0
    ? 'Due today'
    : `${nextDeadline.daysRemaining} day${nextDeadline.daysRemaining === 1 ? '' : 's'} remaining`;

  const badgeVariant = overdue || urgent ? 'destructive' : 'secondary';

  // Format due date nicely
  const dueFormatted = new Date(nextDeadline.dueDate).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="text-sm font-semibold">{nextDeadline.type}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          period {nextDeadline.period}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Due {dueFormatted}</span>
        <Badge variant={badgeVariant} className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {daysLabel}
        </Badge>
      </div>
    </div>
  );
}

function ReadyState({ type }: { type: string }) {
  const href = type === 'EMP201' ? '/sars/emp201' : type === 'VAT201' ? '/sars/vat201' : '/sars';
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:text-left">
      <CheckCircle2 className="h-8 w-8 shrink-0 text-green-500" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-green-700 dark:text-green-400">Ready to file</p>
        <p className="text-xs text-muted-foreground">
          No critical issues found for the {type} period.
        </p>
      </div>
      <Link href={href}>
        <Button size="sm" variant="default">
          Prepare {type}
        </Button>
      </Link>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  /** Optional YYYY-MM period override — defaults to API auto-detect */
  period?: string;
}

export function SarsReadinessChecklist({ period }: Props) {
  const [data, setData] = useState<SarsReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getSarsReadiness(period)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Failed to load readiness data';
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Filing Readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-sm">Checking readiness…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Deadline countdown */}
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <DeadlineCountdown data={data} />
            </div>

            {/* Blockers list */}
            {data.blockers.length > 0 ? (
              <div className="space-y-2">
                {data.blockers.map((blocker, i) => (
                  <BlockerRow key={i} blocker={blocker} />
                ))}
              </div>
            ) : (
              <ReadyState type={data.nextDeadline.type} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
