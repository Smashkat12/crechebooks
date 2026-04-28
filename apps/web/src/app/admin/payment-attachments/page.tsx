'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAdminAttachments,
  usePendingAttachments,
} from '@/hooks/admin/use-payment-attachments';
import { PaymentAttachmentReviewDialog } from '@/components/admin/PaymentAttachmentReviewDialog';
import type {
  AdminAttachment,
  AttachmentReviewStatus,
  AdminAttachmentFilters,
} from '@/lib/api/payment-attachments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToDec(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AttachmentReviewStatus }) {
  if (status === 'APPROVED') {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 gap-1">
        <XCircle className="h-3 w-3" />
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

// ─── Attachment row ────────────────────────────────────────────────────────────

function AttachmentRow({
  attachment,
  onReview,
}: {
  attachment: AdminAttachment;
  onReview: (att: AdminAttachment) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {attachment.parent.first_name} {attachment.parent.last_name}
        <div className="text-xs text-muted-foreground">
          {attachment.parent.email}
        </div>
      </TableCell>
      <TableCell className="max-w-[140px] truncate text-sm">
        {attachment.filename}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(attachment.uploadedAt)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {attachment.payment
          ? `${attachment.payment.reference} · ${centsToDec(attachment.payment.amount)}`
          : '—'}
      </TableCell>
      <TableCell>
        <StatusBadge status={attachment.reviewStatus} />
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onReview(attachment)}
        >
          Review
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Pending tab ──────────────────────────────────────────────────────────────

function PendingTab({
  onReview,
}: {
  onReview: (att: AdminAttachment) => void;
}) {
  const { data: attachments, isLoading } = usePendingAttachments();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!attachments || attachments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 text-green-500/60" />
        <p>No proofs pending review</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parent</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Linked payment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attachments.map((att) => (
            <AttachmentRow key={att.id} attachment={att} onReview={onReview} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── All tab ──────────────────────────────────────────────────────────────────

function AllTab({ onReview }: { onReview: (att: AdminAttachment) => void }) {
  const [statusFilter, setStatusFilter] = useState<AttachmentReviewStatus | 'ALL'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const filters: AdminAttachmentFilters = {};
  if (statusFilter !== 'ALL') filters.status = statusFilter;
  if (fromDate) filters.from = fromDate;
  if (toDate) filters.to = toDate;

  const { data: attachments, isLoading } = useAdminAttachments(filters);

  const filtered = (attachments ?? []).filter((att) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      att.parent.first_name.toLowerCase().includes(needle) ||
      att.parent.last_name.toLowerCase().includes(needle) ||
      att.parent.email.toLowerCase().includes(needle) ||
      att.filename.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search parent or filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as AttachmentReviewStatus | 'ALL')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-0.5">
          <label className="text-xs text-muted-foreground">From</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-36 text-sm"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-xs text-muted-foreground">To</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-36 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <FileText className="h-10 w-10 text-muted-foreground/40" />
          <p>No attachments match your filters</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent</TableHead>
                <TableHead>Filename</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Linked payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((att) => (
                <AttachmentRow key={att.id} attachment={att} onReview={onReview} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentAttachmentsPage() {
  const [selectedAttachment, setSelectedAttachment] =
    useState<AdminAttachment | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Payment proofs</h1>
        <p className="text-muted-foreground">
          Review and approve proof of payment submitted by parents
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending review</TabsTrigger>
          <TabsTrigger value="all">All attachments</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <PendingTab onReview={(att) => setSelectedAttachment(att)} />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllTab onReview={(att) => setSelectedAttachment(att)} />
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      {selectedAttachment && (
        <PaymentAttachmentReviewDialog
          attachment={selectedAttachment}
          open={!!selectedAttachment}
          onOpenChange={(open) => {
            if (!open) setSelectedAttachment(null);
          }}
        />
      )}
    </div>
  );
}
