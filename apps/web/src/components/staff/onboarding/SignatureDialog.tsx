'use client';

/**
 * Signature Dialog Component
 * TASK-STAFF-001: Staff Onboarding - Document Acknowledgement
 *
 * Provides a dialog for staff to acknowledge/sign documents:
 * - Checkbox confirmation ("I have read and agree...")
 * - Full name confirmation
 * - Date auto-filled
 * - Submit acknowledgement
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Info, PenTool } from 'lucide-react';
import { getDocumentTypeLabel, type GeneratedDocumentType } from '@/lib/api/staff-onboarding';

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType?: GeneratedDocumentType;
  onSign: (signedByName: string) => Promise<void>;
  isLoading?: boolean;
}

export function SignatureDialog({
  open,
  onOpenChange,
  documentType,
  onSign,
  isLoading,
}: SignatureDialogProps) {
  const [fullName, setFullName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setFullName('');
      setAcknowledged(false);
      setError(null);
    }
  }, [open]);

  const documentLabel = documentType ? getDocumentTypeLabel(documentType) : 'Document';
  const currentDate = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const getAcknowledgementText = () => {
    switch (documentType) {
      case 'EMPLOYMENT_CONTRACT':
        return 'I have read and understood the terms of this Employment Contract. I agree to be bound by its terms and conditions.';
      case 'POPIA_CONSENT':
        return 'I have read and understood the POPIA Consent Form. I consent to the processing of my personal information as described.';
      case 'WELCOME_PACK':
        return 'I have received and reviewed the Welcome Pack. I acknowledge receipt of all onboarding materials.';
      default:
        return 'I have read and agree to the terms of this document.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (fullName.trim().split(' ').length < 2) {
      setError('Please enter your full name (first and last name)');
      return;
    }

    if (!acknowledged) {
      setError('Please confirm that you have read and agree to the document');
      return;
    }

    try {
      await onSign(fullName.trim());
    } catch (err) {
      setError('Failed to sign document. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            Sign {documentLabel}
          </DialogTitle>
          <DialogDescription>
            Please review and acknowledge the document by typing your full name below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Acknowledgement Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              By signing this document, you confirm that you have read, understood, and agree to
              its contents. This acknowledgement will be recorded for compliance purposes.
            </AlertDescription>
          </Alert>

          {/* Acknowledgement Checkbox */}
          <div className="flex items-start space-x-3 p-4 rounded-lg bg-muted/50 border">
            <Checkbox
              id="acknowledged"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              disabled={isLoading}
            />
            <Label
              htmlFor="acknowledged"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              {getAcknowledgementText()}
            </Label>
          </div>

          {/* Full Name Input */}
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Type your full name to sign <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., John Smith"
              disabled={isLoading}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Enter your name exactly as it appears on your ID document
            </p>
          </div>

          {/* Date (auto-filled) */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Date:</span>
            <span className="font-medium">{currentDate}</span>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !acknowledged || !fullName.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <PenTool className="mr-2 h-4 w-4" />
                  Sign Document
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
