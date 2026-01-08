'use client';

/**
 * Payroll Journals Table
 * TASK-STAFF-003: View and manage payroll journals
 */

import { useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  RefreshCw,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  usePayrollJournals,
  usePayrollJournal,
  useGeneratePayrollJournal,
  usePostToXero,
  useSyncJournalStatus,
  useDeletePayrollJournal,
  type PayrollJournal,
} from '@/hooks/use-xero-payroll';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface JournalDetailDialogProps {
  journalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function JournalDetailDialog({
  journalId,
  open,
  onOpenChange,
}: JournalDetailDialogProps) {
  const { data: journal, isLoading } = usePayrollJournal(journalId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Journal Details</DialogTitle>
          <DialogDescription>
            {journal
              ? `Period: ${formatDate(journal.payPeriodStart)} - ${formatDate(journal.payPeriodEnd)}`
              : 'Loading...'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : journal ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <StatusBadge status={journal.status} className="ml-2" />
              </div>
              <div>
                <span className="text-muted-foreground">Xero Journal ID:</span>
                <span className="ml-2 font-mono">
                  {journal.xeroJournalId || '-'}
                </span>
              </div>
              {journal.postedAt && (
                <div>
                  <span className="text-muted-foreground">Posted At:</span>
                  <span className="ml-2">{formatDate(journal.postedAt)}</span>
                </div>
              )}
              {journal.errorMessage && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Error:</span>
                  <span className="ml-2 text-red-500">
                    {journal.errorMessage}
                  </span>
                </div>
              )}
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Xero Code</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journal.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {line.accountType}
                      </TableCell>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="font-mono">
                        {line.xeroAccountCode || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.debitCents > 0
                          ? formatCurrency(line.debitCents / 100)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.creditCents > 0
                          ? formatCurrency(line.creditCents / 100)
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(journal.totalDebitCents / 100)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(journal.totalCreditCents / 100)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            Journal not found
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface StatusBadgeProps {
  status: PayrollJournal['status'];
  className?: string;
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  switch (status) {
    case 'POSTED':
      return (
        <Badge className={`bg-green-500 ${className}`}>
          <CheckCircle className="w-3 h-3 mr-1" />
          Posted
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="secondary" className={className}>
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive" className={className}>
          <AlertCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'DRAFT':
      return (
        <Badge variant="outline" className={className}>
          Draft
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
}

export function PayrollJournalsTable() {
  const { toast } = useToast();
  const { data: journalsResponse, isLoading, refetch } = usePayrollJournals({ limit: 20 });
  const { mutateAsync: generateJournal, isPending: generating } =
    useGeneratePayrollJournal();
  const { mutateAsync: postToXero, isPending: posting } = usePostToXero();
  const { mutateAsync: syncStatus, isPending: syncing } = useSyncJournalStatus();
  const { mutateAsync: deleteJournal, isPending: deleting } =
    useDeletePayrollJournal();

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const journals = journalsResponse?.data || [];

  const handleGenerate = async () => {
    if (!periodStart || !periodEnd) {
      toast({
        title: 'Validation Error',
        description: 'Please select both start and end dates.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await generateJournal({
        payrollPeriodStart: periodStart,
        payrollPeriodEnd: periodEnd,
      });
      setShowGenerateDialog(false);
      setPeriodStart('');
      setPeriodEnd('');
      toast({
        title: 'Journal Generated',
        description: 'Payroll journal has been generated successfully.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate payroll journal.',
        variant: 'destructive',
      });
    }
  };

  const handlePost = async (journalId: string) => {
    try {
      await postToXero(journalId);
      toast({
        title: 'Journal Posted',
        description: 'Payroll journal has been posted to Xero.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to post journal to Xero.',
        variant: 'destructive',
      });
    }
  };

  const handleSync = async (journalId: string) => {
    try {
      await syncStatus(journalId);
      toast({
        title: 'Status Synced',
        description: 'Journal status has been synced from Xero.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync journal status.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (journalId: string) => {
    if (!confirm('Are you sure you want to delete this draft journal?')) {
      return;
    }

    try {
      await deleteJournal(journalId);
      toast({
        title: 'Journal Deleted',
        description: 'Draft journal has been deleted.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete journal.',
        variant: 'destructive',
      });
    }
  };

  const isBusy = generating || posting || syncing || deleting;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Payroll Journals</h2>
          <p className="text-sm text-muted-foreground">
            Generate and post payroll journals to Xero
          </p>
        </div>
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogTrigger asChild>
            <Button disabled={isBusy}>
              <Plus className="w-4 h-4 mr-2" />
              Generate Journal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Payroll Journal</DialogTitle>
              <DialogDescription>
                Create a new payroll journal for a specific period.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Period Start *</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period End *</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowGenerateDialog(false);
                  setPeriodStart('');
                  setPeriodEnd('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!periodStart || !periodEnd || generating}
              >
                {generating && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Generate Journal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total Debit</TableHead>
              <TableHead className="text-right">Total Credit</TableHead>
              <TableHead>Posted At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Loading journals...
                  </p>
                </TableCell>
              </TableRow>
            ) : journals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No journals found. Generate a journal to get started.
                </TableCell>
              </TableRow>
            ) : (
              journals.map((journal) => (
                <TableRow key={journal.id}>
                  <TableCell>
                    {formatDate(journal.payPeriodStart)} -{' '}
                    {formatDate(journal.payPeriodEnd)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={journal.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(journal.totalDebitCents / 100)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(journal.totalCreditCents / 100)}
                  </TableCell>
                  <TableCell>
                    {journal.postedAt ? formatDate(journal.postedAt) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedJournalId(journal.id)}
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {journal.status === 'PENDING' && !journal.xeroJournalId && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePost(journal.id)}
                            disabled={isBusy}
                            title="Post to Xero"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(journal.id)}
                            disabled={isBusy}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                      {journal.status === 'PENDING' && journal.xeroJournalId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSync(journal.id)}
                          disabled={isBusy}
                          title="Sync Status"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      {journal.status === 'FAILED' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePost(journal.id)}
                          disabled={isBusy}
                          title="Retry Post"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedJournalId && (
        <JournalDetailDialog
          journalId={selectedJournalId}
          open={!!selectedJournalId}
          onOpenChange={(open) => !open && setSelectedJournalId(null)}
        />
      )}
    </div>
  );
}
