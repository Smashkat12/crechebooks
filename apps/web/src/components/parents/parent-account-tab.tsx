'use client';

import { useMemo, useState } from 'react';
import { Download, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useParentLedger,
  useDownloadParentLedgerPdf,
  type ParentLedgerParams,
} from '@/hooks/use-parent-ledger';
import {
  useParentAccount,
  useGenerateStatement,
  useFinalizeStatement,
  useDeliverStatement,
  formatCentsToRands,
} from '@/hooks/use-statements';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

type PresetPeriod =
  | 'last-3-months'
  | 'current-month'
  | 'ytd'
  | 'last-12-months'
  | 'all-time'
  | 'custom';

interface ParentAccountTabProps {
  parentId: string;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

function startOfYearIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
}

function resolvePresetParams(preset: PresetPeriod): ParentLedgerParams {
  switch (preset) {
    case 'last-3-months':
      // Defaults on the API match this — omitting both lets the server pick.
      return {};
    case 'current-month':
      return { periodStart: startOfMonthIso(), periodEnd: todayIso() };
    case 'ytd':
      return { periodStart: startOfYearIso(), periodEnd: todayIso() };
    case 'last-12-months':
      return { periodStart: monthsAgoIso(12), periodEnd: todayIso() };
    case 'all-time':
      // 10-year window comfortably covers any creche.
      return { periodStart: monthsAgoIso(120), periodEnd: todayIso() };
    case 'custom':
      // Caller maintains custom range state separately.
      return {};
  }
}

const lineTypeLabels: Record<string, string> = {
  OPENING_BALANCE: 'Opening Balance',
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  CREDIT_NOTE: 'Credit Note',
  ADJUSTMENT: 'Adjustment',
  CLOSING_BALANCE: 'Closing Balance',
};

export function ParentAccountTab({ parentId }: ParentAccountTabProps) {
  const { toast } = useToast();
  const [preset, setPreset] = useState<PresetPeriod>('last-3-months');
  const [customStart, setCustomStart] = useState<string>(monthsAgoIso(3));
  const [customEnd, setCustomEnd] = useState<string>(todayIso());

  const ledgerParams: ParentLedgerParams = useMemo(() => {
    if (preset === 'custom') {
      return { periodStart: customStart, periodEnd: customEnd };
    }
    return resolvePresetParams(preset);
  }, [preset, customStart, customEnd]);

  const {
    data: account,
    isLoading: accountLoading,
  } = useParentAccount(parentId);

  const {
    data: ledger,
    isLoading: ledgerLoading,
    error: ledgerError,
    refetch: refetchLedger,
  } = useParentLedger(parentId, ledgerParams);

  const { downloadPdf } = useDownloadParentLedgerPdf();
  const generateStatement = useGenerateStatement();
  const finalizeStatement = useFinalizeStatement();
  const deliverStatement = useDeliverStatement();

  const handleDownloadPdf = async () => {
    try {
      await downloadPdf(parentId, ledgerParams);
      toast({
        title: 'Download started',
        description: 'Ledger PDF is being downloaded.',
      });
    } catch (error) {
      toast({
        title: 'Download failed',
        description:
          error instanceof Error ? error.message : 'Could not download PDF',
        variant: 'destructive',
      });
    }
  };

  const handleSendToParent = async () => {
    if (!ledger) return;
    try {
      // Mint a Statement record snapshotting the current ledger numbers,
      // finalize it (DRAFT → FINAL), then deliver. This is the only path
      // that creates a persisted Statement; the live view stays read-only.
      const statement = await generateStatement.mutateAsync({
        parentId,
        periodStart: ledger.period_start,
        periodEnd: ledger.period_end,
      });
      await finalizeStatement.mutateAsync(statement.id);
      await deliverStatement.mutateAsync({ statementId: statement.id });
      toast({
        title: 'Statement sent',
        description: `Statement ${statement.statement_number} delivered to ${ledger.parent.name}.`,
      });
    } catch (error) {
      toast({
        title: 'Send failed',
        description:
          error instanceof Error ? error.message : 'Could not send statement',
        variant: 'destructive',
      });
    }
  };

  const sending =
    generateStatement.isPending ||
    finalizeStatement.isPending ||
    deliverStatement.isPending;

  return (
    <div className="space-y-6">
      {/* Account summary card */}
      <Card>
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {accountLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : account ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Outstanding</div>
                <div className="text-xl font-semibold text-red-600">
                  {formatCentsToRands(account.total_outstanding_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Credit</div>
                <div className="text-xl font-semibold text-green-600">
                  {formatCentsToRands(account.credit_balance_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Net</div>
                <div
                  className={`text-xl font-semibold ${
                    account.net_balance_cents > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {formatCentsToRands(account.net_balance_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Oldest Unpaid
                </div>
                <div className="text-sm font-medium">
                  {account.oldest_outstanding_date
                    ? formatDate(account.oldest_outstanding_date)
                    : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No account data.</div>
          )}
        </CardContent>
      </Card>

      {/* Ledger card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Ledger</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchLedger()}
                disabled={ledgerLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={ledgerLoading || !ledger}
              >
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
              <Button
                size="sm"
                onClick={handleSendToParent}
                disabled={ledgerLoading || !ledger || sending}
              >
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Sending…' : 'Send to Parent'}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select
                value={preset}
                onValueChange={(v) => setPreset(v as PresetPeriod)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-3-months">Last 3 months</SelectItem>
                  <SelectItem value="current-month">Current month</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                  <SelectItem value="last-12-months">Last 12 months</SelectItem>
                  <SelectItem value="all-time">All time</SelectItem>
                  <SelectItem value="custom">Custom range…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ledger-start" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="ledger-start"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ledger-end" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="ledger-end"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ledgerError && (
            <div className="text-destructive py-6">
              Failed to load ledger: {ledgerError.message}
            </div>
          )}

          {ledgerLoading && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
              <Skeleton className="h-48" />
            </div>
          )}

          {ledger && !ledgerLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Opening</div>
                  <div className="text-base font-semibold">
                    {formatCentsToRands(ledger.opening_balance_cents)}
                  </div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Charges</div>
                  <div className="text-base font-semibold text-red-600">
                    {formatCentsToRands(ledger.total_charges_cents)}
                  </div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Payments</div>
                  <div className="text-base font-semibold text-green-600">
                    {formatCentsToRands(ledger.total_payments_cents)}
                  </div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Closing</div>
                  <div
                    className={`text-base font-semibold ${
                      ledger.closing_balance_cents > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {formatCentsToRands(ledger.closing_balance_cents)}
                  </div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDate(ledger.period_start)} →{' '}
                {formatDate(ledger.period_end)}
                <Badge variant="outline" className="ml-2">
                  Live
                </Badge>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[120px]">Reference</TableHead>
                      <TableHead className="text-right w-[110px]">
                        Debit
                      </TableHead>
                      <TableHead className="text-right w-[110px]">
                        Credit
                      </TableHead>
                      <TableHead className="text-right w-[120px]">
                        Balance
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.lines.map((line) => (
                      <TableRow
                        key={line.id}
                        className={
                          line.line_type === 'OPENING_BALANCE' ||
                          line.line_type === 'CLOSING_BALANCE'
                            ? 'bg-muted/40 font-medium'
                            : ''
                        }
                      >
                        <TableCell>{formatDate(line.date)}</TableCell>
                        <TableCell>
                          <div>{line.description}</div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {lineTypeLabels[line.line_type] ?? line.line_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.reference_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {line.debit_cents > 0
                            ? formatCentsToRands(line.debit_cents)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {line.credit_cents > 0
                            ? formatCentsToRands(line.credit_cents)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCentsToRands(line.balance_cents)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {ledger.lines.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground py-8"
                        >
                          No transactions in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
