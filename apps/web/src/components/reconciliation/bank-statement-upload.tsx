'use client';

import * as React from 'react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReconcileBankStatement, type BankStatementReconciliationResult } from '@/hooks/use-reconciliation';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BankStatementUploadProps {
  onSuccess?: (result: BankStatementReconciliationResult) => void;
  onCancel?: () => void;
}

export function BankStatementUpload({ onSuccess, onCancel }: BankStatementUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [bankAccount, setBankAccount] = useState('');
  const reconcile = useReconcileBankStatement();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please upload a bank statement PDF file.',
        variant: 'destructive',
      });
      return;
    }

    if (!bankAccount.trim()) {
      toast({
        title: 'Bank account required',
        description: 'Please enter a bank account name or identifier.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await reconcile.mutateAsync({
        file,
        bankAccount: bankAccount.trim(),
      });

      toast({
        title: 'Bank statement processed',
        description: `Found ${result.matchSummary.total} transactions. ${result.matchSummary.matched} matched, ${result.matchSummary.inBankOnly} unmatched.`,
      });

      onSuccess?.(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process bank statement';
      toast({
        title: 'Processing failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="bankAccount">Bank Account</Label>
        <Input
          id="bankAccount"
          value={bankAccount}
          onChange={(e) => setBankAccount(e.target.value)}
          placeholder="e.g., FNB Business Account"
          required
        />
        <p className="text-sm text-muted-foreground">
          Enter the name or identifier for your bank account
        </p>
      </div>

      <div className="space-y-2">
        <Label>Bank Statement (PDF)</Label>
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-primary bg-primary/5'
              : file
                ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                : 'border-muted-foreground/25 hover:border-primary'
          )}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-10 w-10 text-green-600" />
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                Remove file
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">
                {isDragActive ? 'Drop the file here' : 'Drag & drop your bank statement'}
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse (PDF only, max 10MB)
              </p>
            </div>
          )}
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          The bank statement will be parsed to extract transactions and match them against your
          imported transactions. This may take up to 2 minutes for large statements.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={reconcile.isPending || !file}>
          {reconcile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {reconcile.isPending ? 'Processing...' : 'Upload & Reconcile'}
        </Button>
      </div>
    </form>
  );
}
