'use client';

/**
 * TASK-ACCT-UI-005: Quote Action Dialogs
 * Dialogs for quote actions: send, accept, decline, convert.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import type { Quote } from '@/hooks/use-quotes';

interface SendQuoteDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function SendQuoteDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: SendQuoteDialogProps) {
  if (!quote) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Quote</DialogTitle>
          <DialogDescription>
            Send quote {quote.quoteNumber} to {quote.recipientName}?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Recipient Email:</span>
            <span className="font-medium">{quote.recipientEmail}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-mono font-medium">{formatCurrency(quote.totalCents / 100)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valid For:</span>
            <span>{quote.validityDays} days</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AcceptQuoteDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function AcceptQuoteDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: AcceptQuoteDialogProps) {
  if (!quote) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept Quote</DialogTitle>
          <DialogDescription>
            Mark quote {quote.quoteNumber} as accepted by {quote.recipientName}?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-mono font-medium">{formatCurrency(quote.totalCents / 100)}</span>
          </div>
          {quote.childName && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Child:</span>
              <span>{quote.childName}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
            {isLoading ? 'Processing...' : 'Mark Accepted'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeclineQuoteDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function DeclineQuoteDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: DeclineQuoteDialogProps) {
  const [reason, setReason] = useState('');

  if (!quote) return null;

  const handleConfirm = () => {
    onConfirm(reason);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline Quote</DialogTitle>
          <DialogDescription>
            Mark quote {quote.quoteNumber} as declined?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              placeholder="Enter decline reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Mark Declined'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConvertQuoteDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dueDate?: string, notes?: string) => void;
  isLoading?: boolean;
}

export function ConvertQuoteDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: ConvertQuoteDialogProps) {
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  if (!quote) return null;

  const handleConfirm = () => {
    onConfirm(dueDate || undefined, notes || undefined);
    setDueDate('');
    setNotes('');
  };

  // Default due date to 14 days from now
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 14);
  const defaultDueDateStr = defaultDueDate.toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert Quote to Invoice</DialogTitle>
          <DialogDescription>
            Create an invoice from quote {quote.quoteNumber} for {quote.recipientName}?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-mono font-medium">{formatCurrency(quote.totalCents / 100)}</span>
          </div>
          {quote.childName && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Child:</span>
              <span>{quote.childName}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="due-date">Invoice Due Date</Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate || defaultDueDateStr}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="convert-notes">Notes (optional)</Label>
            <Textarea
              id="convert-notes"
              placeholder="Additional notes for the invoice..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Converting...' : 'Convert to Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
