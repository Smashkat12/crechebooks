<task_spec id="TASK-FIX-003" version="2.0">

<metadata>
  <title>Invoice Deletion Handler with Confirmation</title>
  <status>ready</status>
  <layer>presentation</layer>
  <sequence>303</sequence>
  <implements>
    <requirement_ref>REQ-INV-DELETE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/invoices/page.tsx` (implement handleDelete)
  - `apps/web/src/hooks/use-invoices.ts` (add useDeleteInvoice hook)
  - `apps/web/src/lib/api/endpoints.ts` (add delete endpoint if missing)

  **Files to Create:**
  - `apps/web/src/components/invoices/delete-invoice-dialog.tsx` (NEW - confirmation dialog)

  **Current Problem:**
  The invoices page has an empty `handleDelete` function:
  ```typescript
  const handleDelete = (invoice: Invoice) => {
    // TODO: Confirm and delete
  };
  ```

  **Existing Infrastructure:**
  - `AlertDialog` component exists at `apps/web/src/components/ui/alert-dialog.tsx`
  - `useToast` hook available for notifications
  - TanStack Query configured for mutations
  - Similar patterns exist in `SendInvoiceDialog` component
  - Invoice model has `isDeleted` soft-delete flag

  **Business Rule:**
  - Only DRAFT invoices can be deleted
  - Sent/paid invoices must be voided instead

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Delete Invoice Hook Pattern
  ```typescript
  // Add to apps/web/src/hooks/use-invoices.ts
  export function useDeleteInvoice() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, AxiosError, string>({
      mutationFn: async (invoiceId: string) => {
        const { data } = await apiClient.delete<{ success: boolean }>(
          endpoints.invoices.detail(invoiceId),
        );
        return data;
      },
      onSuccess: () => {
        // Invalidate invoice lists to refresh the table
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      },
    });
  }
  ```

  ### 3. Delete Confirmation Dialog Pattern
  ```typescript
  // apps/web/src/components/invoices/delete-invoice-dialog.tsx
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
  ```

  ### 4. Updated Invoices Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/invoices/page.tsx
  'use client';

  import { useState } from 'react';
  import { useRouter } from 'next/navigation';
  import Link from 'next/link';
  import { FileText } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent } from '@/components/ui/card';
  import { InvoiceTable } from '@/components/invoices';
  import { SendInvoiceDialog } from '@/components/invoices/send-invoice-dialog';
  import { DeleteInvoiceDialog } from '@/components/invoices/delete-invoice-dialog';
  import { useDownloadInvoicePdf, useDeleteInvoice } from '@/hooks/use-invoices';
  import { useSendInvoice } from '@/hooks/useSendInvoice';
  import { useToast } from '@/hooks/use-toast';
  import type { Invoice } from '@/types/invoice';

  export default function InvoicesPage() {
    const router = useRouter();
    const { downloadPdf } = useDownloadInvoicePdf();
    const sendInvoice = useSendInvoice();
    const deleteInvoice = useDeleteInvoice();
    const { toast } = useToast();

    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const handleView = (invoice: Invoice) => {
      router.push(`/invoices/${invoice.id}`);
    };

    const handleSend = (invoice: Invoice) => {
      setSelectedInvoice(invoice);
      setSendDialogOpen(true);
    };

    const handleConfirmSend = (channel: 'email' | 'whatsapp') => {
      if (!selectedInvoice) return;

      sendInvoice.mutate(
        { invoiceId: selectedInvoice.id, channel },
        {
          onSuccess: (data) => {
            if (data.data.sent > 0) {
              toast({
                title: 'Invoice sent',
                description: `Invoice sent successfully via ${channel}`,
              });
            }
            if (data.data.failed > 0 && data.data.failures.length > 0) {
              toast({
                title: 'Failed to send',
                description: data.data.failures[0].reason,
                variant: 'destructive',
              });
            }
            setSendDialogOpen(false);
            setSelectedInvoice(null);
          },
          onError: (error) => {
            toast({
              title: 'Failed to send',
              description: error.message || 'An error occurred while sending the invoice',
              variant: 'destructive',
            });
          },
        }
      );
    };

    const handleDownload = async (invoice: Invoice) => {
      try {
        await downloadPdf(invoice.id, invoice.invoiceNumber);
        toast({
          title: 'Download started',
          description: `Downloading ${invoice.invoiceNumber}.pdf`,
        });
      } catch (error) {
        console.error('Download failed:', error);
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Failed to download invoice',
          variant: 'destructive',
        });
      }
    };

    const handleDelete = (invoice: Invoice) => {
      setSelectedInvoice(invoice);
      setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
      if (!selectedInvoice) return;

      deleteInvoice.mutate(selectedInvoice.id, {
        onSuccess: () => {
          toast({
            title: 'Invoice deleted',
            description: `Invoice ${selectedInvoice.invoiceNumber} has been deleted.`,
          });
          setDeleteDialogOpen(false);
          setSelectedInvoice(null);
        },
        onError: (error) => {
          toast({
            title: 'Failed to delete',
            description:
              error.message || 'An error occurred while deleting the invoice',
            variant: 'destructive',
          });
        },
      });
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
            <p className="text-muted-foreground">
              Manage and track invoices
            </p>
          </div>
          <Link href="/invoices/generate">
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Generate Invoices
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <InvoiceTable
              onView={handleView}
              onSend={handleSend}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          </CardContent>
        </Card>

        <SendInvoiceDialog
          invoice={selectedInvoice}
          isOpen={sendDialogOpen}
          onClose={() => setSendDialogOpen(false)}
          onSend={handleConfirmSend}
          isLoading={sendInvoice.isPending}
        />

        <DeleteInvoiceDialog
          invoice={selectedInvoice}
          isOpen={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleConfirmDelete}
          isLoading={deleteInvoice.isPending}
        />
      </div>
    );
  }
  ```

  ### 5. Endpoints Update (if needed)
  ```typescript
  // apps/web/src/lib/api/endpoints.ts
  invoices: {
    list: '/invoices',
    detail: (id: string) => `/invoices/${id}`,  // Used for DELETE
    generate: '/invoices/generate',
    send: '/invoices/send',
    pdf: (id: string) => `/invoices/${id}/pdf`,
  },
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements invoice deletion with a confirmation dialog.

**Business Rules:**
1. Only DRAFT invoices can be deleted
2. Sent, partially paid, paid, or overdue invoices cannot be deleted
3. Deletion is a soft-delete (sets `isDeleted = true` in database)
4. User must confirm deletion before proceeding

**User Experience:**
- Clear confirmation dialog explaining the action
- Informative message if invoice cannot be deleted
- Loading state during deletion
- Success/error toasts after action
</context>

<scope>
  <in_scope>
    - Create DeleteInvoiceDialog component
    - Implement useDeleteInvoice hook
    - Wire handleDelete to show confirmation dialog
    - Invalidate React Query cache on success
    - Show appropriate toasts for success/error
    - Prevent deletion of non-DRAFT invoices
  </in_scope>
  <out_of_scope>
    - Invoice void functionality (separate feature)
    - Bulk deletion
    - Undo deletion
    - Hard delete functionality
    - Archive functionality
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create delete dialog component
# Create apps/web/src/components/invoices/delete-invoice-dialog.tsx

# 2. Add useDeleteInvoice hook
# Edit apps/web/src/hooks/use-invoices.ts

# 3. Update invoices page
# Edit apps/web/src/app/(dashboard)/invoices/page.tsx

# 4. Update component exports if needed
# Edit apps/web/src/components/invoices/index.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Only DRAFT invoices can be deleted
    - Confirmation dialog must be shown before deletion
    - Dialog must explain why non-DRAFT invoices cannot be deleted
    - Delete button must be visually destructive (red)
    - Cache must be invalidated after successful deletion
    - Loading state must be shown during API call
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Manual: Clicking delete shows confirmation dialog
    - Manual: DRAFT invoice can be deleted
    - Manual: Non-DRAFT invoice shows cannot delete message
    - Manual: Success toast after deletion
    - Manual: Invoice list refreshes after deletion
    - Manual: Delete button disabled while loading
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Allow deletion without confirmation
  - Allow deletion of non-DRAFT invoices
  - Use hard delete instead of soft delete
  - Skip cache invalidation after mutation
  - Show technical error messages to users
  - Allow multiple delete actions simultaneously
</anti_patterns>

</task_spec>
