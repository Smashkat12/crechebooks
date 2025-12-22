'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaymentTable } from '@/components/payments';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, queryKeys } from '@/lib/api';

export default function PaymentsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bankAccount, setBankAccount] = useState('fnb-business-001');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await apiClient.post('/payments/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    },
  });

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('bank_account', bankAccount);

    try {
      await importMutation.mutateAsync(formData);
      setIsImportDialogOpen(false);
      setSelectedFile(null);
      setBankAccount('fnb-business-001');
    } catch (err) {
      console.error('Import failed:', err);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
            <p className="text-muted-foreground">
              Track and match incoming payments
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Statement
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <PaymentTable tenantId={tenantId} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleImport}>
            <DialogHeader>
              <DialogTitle>Import Payment Statement</DialogTitle>
              <DialogDescription>
                Upload a CSV or PDF bank statement to import payments
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="file">Statement File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv,.pdf"
                  ref={fileInputRef}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Supported formats: CSV, PDF (max 10MB)
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank_account">Bank Account</Label>
                <Input
                  id="bank_account"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="e.g., fnb-business-001"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsImportDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={importMutation.isPending || !selectedFile}>
                {importMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
