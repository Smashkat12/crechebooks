/**
 * Enrollment Success Modal
 * TASK-BILL-023: Enrollment Invoice UI Integration
 *
 * Displays enrollment success with invoice details after a child is enrolled.
 * Allows viewing or sending the invoice immediately.
 */

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, FileText, Send, ExternalLink } from 'lucide-react';

/**
 * Invoice summary for display in the modal
 */
export interface EnrollmentInvoice {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  status: string;
}

/**
 * Enrollment data for display in the modal
 */
export interface EnrollmentData {
  child: {
    id: string;
    first_name: string;
    last_name: string;
  };
  enrollment: {
    id: string;
    fee_structure: {
      id: string;
      name: string;
      amount: number;
    };
    start_date: string;
    status: string;
  };
  invoice: EnrollmentInvoice | null;
}

export interface EnrollmentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollment: EnrollmentData | null;
  onViewInvoice: (invoiceId: string) => void;
  onSendInvoice: (invoiceId: string) => void;
  isSendingInvoice?: boolean;
}

/**
 * Format currency in ZAR
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function EnrollmentSuccessModal({
  isOpen,
  onClose,
  enrollment,
  onViewInvoice,
  onSendInvoice,
  isSendingInvoice = false,
}: EnrollmentSuccessModalProps) {
  if (!enrollment) {
    return null;
  }

  const { child, enrollment: enrollmentData, invoice } = enrollment;
  const childName = `${child.first_name} ${child.last_name}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <DialogTitle className="text-lg">Enrollment Successful</DialogTitle>
              <DialogDescription className="mt-1">
                {childName} has been enrolled successfully
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Enrollment Details */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <h4 className="font-medium text-sm text-muted-foreground mb-3">
            Enrollment Details
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee Structure:</span>
              <span className="font-medium">{enrollmentData.fee_structure.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Fee:</span>
              <span className="font-medium">
                {formatCurrency(enrollmentData.fee_structure.amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date:</span>
              <span className="font-medium">{formatDate(enrollmentData.start_date)}</span>
            </div>
          </div>
        </div>

        {/* Invoice Details */}
        {invoice && (
          <div className="border rounded-lg p-4 bg-blue-50/50 border-blue-200">
            <h4 className="font-medium text-sm text-blue-800 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Enrollment Invoice Created
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Invoice Number:</span>
                <span className="font-mono font-medium text-blue-900">
                  {invoice.invoice_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Total Amount:</span>
                <span className="font-semibold text-blue-900">
                  {formatCurrency(invoice.total)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Due Date:</span>
                <span className="font-medium text-blue-900">
                  {formatDate(invoice.due_date)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* No Invoice Warning */}
        {!invoice && (
          <div className="border rounded-lg p-4 bg-yellow-50/50 border-yellow-200">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Invoice generation is pending or failed.
              You can generate it manually from the Invoices page.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {invoice && (
            <>
              <Button
                variant="outline"
                onClick={() => onViewInvoice(invoice.id)}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View Invoice
              </Button>
              <Button
                onClick={() => onSendInvoice(invoice.id)}
                disabled={isSendingInvoice}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {isSendingInvoice ? 'Sending...' : 'Send Invoice'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
