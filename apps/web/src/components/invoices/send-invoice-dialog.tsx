import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Invoice } from "@/types/invoice";

interface SendInvoiceDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (options: { email: boolean; whatsapp: boolean; message?: string }) => void;
}

export function SendInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onSend,
}: SendInvoiceDialogProps) {
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [message, setMessage] = useState("");

  const handleSend = () => {
    onSend({
      email: sendEmail,
      whatsapp: sendWhatsApp,
      message: message.trim() || undefined,
    });
    onOpenChange(false);
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Invoice</DialogTitle>
          <DialogDescription>
            Send invoice {invoice.invoiceNumber} to {invoice.parentName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="email"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked === true)}
              />
              <Label
                htmlFor="email"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Mail className="h-4 w-4" />
                Send via Email
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="whatsapp"
                checked={sendWhatsApp}
                onCheckedChange={(checked) => setSendWhatsApp(checked === true)}
              />
              <Label
                htmlFor="whatsapp"
                className="flex items-center gap-2 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" />
                Send via WhatsApp
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Additional Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a personal message to include with the invoice..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          {!sendEmail && !sendWhatsApp && (
            <p className="text-sm text-destructive">
              Please select at least one delivery method
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!sendEmail && !sendWhatsApp}
          >
            Send Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
