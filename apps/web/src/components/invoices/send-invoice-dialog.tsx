'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Mail, MessageCircle, Loader2 } from 'lucide-react';
import type { Invoice } from '@/types/invoice';

interface SendInvoiceDialogProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (channel: 'email' | 'whatsapp') => void;
  isLoading: boolean;
}

export function SendInvoiceDialog({
  invoice,
  isOpen,
  onClose,
  onSend,
  isLoading,
}: SendInvoiceDialogProps) {
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');

  if (!invoice) return null;

  const handleSend = () => {
    onSend(channel);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Invoice</DialogTitle>
          <DialogDescription>
            Send invoice {invoice.invoiceNumber} to {invoice.parentName}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Delivery Method</Label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-colors ${
                  channel === 'email'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
              >
                <Mail className="h-4 w-4" />
                <span className="font-medium">Email</span>
              </button>
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`w-full flex items-center gap-3 p-3 rounded-md border-2 transition-colors ${
                  channel === 'whatsapp'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="font-medium">WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
