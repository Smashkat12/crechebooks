'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Link2,
  Link2Off,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useReviewAttachment,
  useLinkAttachmentPayment,
  useUnlinkAttachmentPayment,
  useAdminAttachmentDownloadUrl,
} from '@/hooks/admin/use-payment-attachments';
import type { AdminAttachment } from '@/lib/api/payment-attachments';

// Re-use payments list hook to populate link-to-payment dropdown
import { usePaymentsList } from '@/hooks/use-payments';

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

// ─── Props ─────────────────────────────────────────────────────────────────────

interface PaymentAttachmentReviewDialogProps {
  attachment: AdminAttachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PaymentAttachmentReviewDialog({
  attachment,
  open,
  onOpenChange,
}: PaymentAttachmentReviewDialogProps) {
  const { toast } = useToast();

  const [reviewNote, setReviewNote] = useState('');
  const [linkPaymentId, setLinkPaymentId] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { mutate: review, isPending: isReviewing } = useReviewAttachment();
  const { mutate: link, isPending: isLinking } = useLinkAttachmentPayment();
  const { mutate: unlink, isPending: isUnlinking } = useUnlinkAttachmentPayment();
  const { getDownloadUrl } = useAdminAttachmentDownloadUrl();

  // Payments dropdown — unmatched or all recent
  const { data: paymentsResp } = usePaymentsList({ limit: 200 });

  const isImage = attachment.contentType.startsWith('image/');

  // Load preview URL when dialog opens
  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    getDownloadUrl(attachment.id)
      .then(({ downloadUrl }) => {
        if (!cancelled) setPreviewUrl(downloadUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attachment.id, getDownloadUrl]);

  function handleApprove() {
    review(
      { id: attachment.id, status: 'APPROVED', reviewNote: reviewNote.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: 'Approved', description: 'Attachment marked as approved.' });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: 'Failed', description: 'Could not approve. Try again.', variant: 'destructive' });
        },
      },
    );
  }

  function handleReject() {
    if (!reviewNote.trim()) {
      toast({
        title: 'Note required',
        description: 'Please provide a reason for rejection.',
        variant: 'destructive',
      });
      return;
    }
    review(
      { id: attachment.id, status: 'REJECTED', reviewNote: reviewNote.trim() },
      {
        onSuccess: () => {
          toast({ title: 'Rejected', description: 'Attachment marked as rejected.' });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: 'Failed', description: 'Could not reject. Try again.', variant: 'destructive' });
        },
      },
    );
  }

  function handleLink() {
    if (!linkPaymentId) return;
    link(
      { id: attachment.id, paymentId: linkPaymentId },
      {
        onSuccess: () => {
          toast({ title: 'Linked', description: 'Payment linked to attachment.' });
          setLinkPaymentId('');
        },
        onError: () => {
          toast({ title: 'Failed', description: 'Could not link payment. Try again.', variant: 'destructive' });
        },
      },
    );
  }

  function handleUnlink() {
    unlink(attachment.id, {
      onSuccess: () => {
        toast({ title: 'Unlinked', description: 'Payment unlinked from attachment.' });
      },
      onError: () => {
        toast({ title: 'Failed', description: 'Could not unlink. Try again.', variant: 'destructive' });
      },
    });
  }

  const isBusy = isReviewing || isLinking || isUnlinking;
  const isPending = attachment.reviewStatus === 'PENDING';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review proof of payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Parent info */}
          <div className="rounded-lg border p-4 space-y-1 text-sm">
            <p className="font-medium text-base">
              {attachment.parent.first_name} {attachment.parent.last_name}
            </p>
            <p className="text-muted-foreground">{attachment.parent.email}</p>
            <p className="text-muted-foreground">
              Uploaded {formatDate(attachment.uploadedAt)}
              {attachment.uploader && (
                <> by {attachment.uploader.name}</>
              )}
            </p>
            {attachment.note && (
              <p className="italic mt-1">&ldquo;{attachment.note}&rdquo;</p>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-lg border overflow-hidden bg-muted/30">
            {previewLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewUrl ? (
              isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={attachment.filename}
                  className="max-h-64 w-full object-contain"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <p className="text-sm text-muted-foreground">
                    {attachment.filename}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      window.open(previewUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open PDF in new tab
                  </Button>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>

          {/* Linked payment */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Linked payment</p>
            {attachment.payment ? (
              <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div>
                  <span className="font-medium">{attachment.payment.reference}</span>
                  <span className="text-muted-foreground ml-2">
                    {centsToDec(attachment.payment.amount)}
                    {' · '}
                    {formatDate(attachment.payment.paymentDate)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  disabled={isBusy}
                  onClick={handleUnlink}
                >
                  {isUnlinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2Off className="h-4 w-4" />
                  )}
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={linkPaymentId}
                  onValueChange={setLinkPaymentId}
                  disabled={isBusy}
                >
                  <SelectTrigger className="flex-1 text-sm">
                    <SelectValue placeholder="Select a payment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(paymentsResp?.payments ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.reference ?? p.id.slice(0, 8)} —{' '}
                        {centsToDec(p.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={!linkPaymentId || isBusy}
                  onClick={handleLink}
                >
                  {isLinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Link
                </Button>
              </div>
            )}
          </div>

          {/* Review status (if already reviewed) */}
          {!isPending && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">
                  {attachment.reviewStatus === 'APPROVED' ? 'Approved' : 'Rejected'}
                </span>
                {attachment.reviewer && (
                  <> by {attachment.reviewer.name}</>
                )}
                {attachment.reviewedAt && (
                  <> on {formatDate(attachment.reviewedAt)}</>
                )}
                {attachment.reviewNote && (
                  <span className="block mt-1 italic">{attachment.reviewNote}</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Review actions (only for PENDING) */}
          {isPending && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="review-note">
                  Review note{' '}
                  <span className="text-muted-foreground font-normal">
                    (required for rejection)
                  </span>
                </label>
                <textarea
                  id="review-note"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note for the parent..."
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isBusy}
                  onClick={handleReject}
                >
                  {isReviewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={isBusy}
                  onClick={handleApprove}
                >
                  {isReviewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
