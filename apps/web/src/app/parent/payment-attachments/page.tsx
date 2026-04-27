'use client';

import { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  useParentAttachments,
  useDeleteParentAttachment,
  useDownloadAttachmentUrl,
} from '@/hooks/parent-portal/use-parent-payment-attachments';
import { ProofOfPaymentUploader } from '@/components/parent/ProofOfPaymentUploader';
import type { AttachmentReviewStatus } from '@/lib/api/payment-attachments';

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
      Pending review
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentPaymentAttachmentsPage() {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: attachments, isLoading, error } = useParentAttachments();
  const { mutate: deleteAttachment } = useDeleteParentAttachment();
  const { getDownloadUrl } = useDownloadAttachmentUrl();

  async function handleDownload(id: string, _filename: string) {
    try {
      const { downloadUrl } = await getDownloadUrl(id);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not fetch download link. Please try again.',
        variant: 'destructive',
      });
    }
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    deleteAttachment(id, {
      onSuccess: () => {
        toast({ title: 'Proof deleted', description: 'The file has been removed.' });
        setDeletingId(null);
      },
      onError: () => {
        toast({
          title: 'Delete failed',
          description: 'Could not delete proof. Please try again.',
          variant: 'destructive',
        });
        setDeletingId(null);
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            My Proof of Payments
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload proof of payment for the admin team to review
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 flex-shrink-0">
              <Upload className="h-4 w-4" />
              Upload proof
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload proof of payment</DialogTitle>
            </DialogHeader>
            <ProofOfPaymentUploader
              onSuccess={() => setUploadOpen(false)}
              onCancel={() => setUploadOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message || 'Failed to load attachments. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && (!attachments || attachments.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium">No proofs uploaded yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your proof of payment and the admin team will confirm
                it against your account.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Upload your first proof
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!isLoading && attachments && attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">{attachments.length} proof{attachments.length !== 1 ? 's' : ''} uploaded</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attachments.map((att) => (
                    <TableRow key={att.id}>
                      <TableCell className="font-medium max-w-[160px] truncate">
                        {att.filename}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(att.uploadedAt).toLocaleDateString('en-ZA', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={att.reviewStatus} />
                        {att.reviewStatus === 'REJECTED' && att.reviewNote && (
                          <p className="text-xs text-destructive mt-1">
                            {att.reviewNote}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {att.payment ? att.payment.reference : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Download"
                            onClick={() => handleDownload(att.id, att.filename)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {att.reviewStatus === 'PENDING' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Delete"
                              disabled={deletingId === att.id}
                              onClick={() => handleDelete(att.id)}
                            >
                              {deletingId === att.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
