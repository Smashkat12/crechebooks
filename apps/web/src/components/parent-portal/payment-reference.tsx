'use client';

/**
 * Payment Reference Component
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * Auto-generate unique payment reference for EFT payments:
 * - Format: parentId-YYYYMMDD-XXX
 * - Copy to clipboard functionality
 * - Visual instruction text
 */

import { useState, useCallback, useEffect } from 'react';
import { Copy, Check, RefreshCw, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { generatePaymentReference } from '@/hooks/parent-portal/use-parent-payments';

interface PaymentReferenceProps {
  parentId: string;
  onReferenceChange?: (reference: string) => void;
}

export function PaymentReference({ parentId, onReferenceChange }: PaymentReferenceProps) {
  const [reference, setReference] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Generate initial reference on mount
  useEffect(() => {
    const newRef = generatePaymentReference(parentId);
    setReference(newRef);
    onReferenceChange?.(newRef);
  }, [parentId, onReferenceChange]);

  const regenerateReference = useCallback(() => {
    const newRef = generatePaymentReference(parentId);
    setReference(newRef);
    onReferenceChange?.(newRef);
    toast({
      title: 'New reference generated',
      description: 'Your payment reference has been updated',
    });
  }, [parentId, onReferenceChange, toast]);

  const copyReference = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Payment reference copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
  }, [reference, toast]);

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Hash className="h-4 w-4 text-blue-600" />
          Payment Reference
        </CardTitle>
        <CardDescription className="text-xs">
          Use this reference when making EFT payments to ensure your payment is allocated correctly
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white dark:bg-background rounded-lg border border-blue-200 px-4 py-3">
            <span className="font-mono text-lg font-bold text-blue-900 dark:text-blue-100">
              {reference}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={copyReference}
            title="Copy reference"
            className="border-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-blue-600" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={regenerateReference}
            title="Generate new reference"
            className="border-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900"
          >
            <RefreshCw className="h-4 w-4 text-blue-600" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          <span className="font-medium">Important:</span> Always include this reference in your
          payment description. Payments without a valid reference may take longer to allocate.
        </p>
      </CardContent>
    </Card>
  );
}
