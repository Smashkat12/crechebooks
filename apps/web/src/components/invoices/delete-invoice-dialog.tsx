/**
 * Delete Invoice Confirmation Dialog
 * TASK-FIX-003: Invoice Deletion Handler
 */

'use client';

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
import type { Invoice } from '@/types/invoice';

interface DeleteInvoiceDialogProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DeleteInvoiceDialog({
  invoice,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: DeleteInvoiceDialogProps) {
  if (!invoice) return null;

  const canDelete = invoice.status === 'DRAFT';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {canDelete ? 'Delete Invoice' : 'Cannot Delete Invoice'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {canDelete ? (
              <>
                Are you sure you want to delete invoice{' '}
                <strong>{invoice.invoiceNumber}</strong>? This action cannot
                be undone.
              </>
            ) : (
              <>
                Invoice <strong>{invoice.invoiceNumber}</strong> cannot be
                deleted because it has status <strong>{invoice.status}</strong>.
                Only DRAFT invoices can be deleted. You may want to void this
                invoice instead.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          {canDelete && (
            <AlertDialogAction
              onClick={onConfirm}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
