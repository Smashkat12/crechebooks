'use client';

import { useState, useRef } from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';
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
import { TransactionTable } from '@/components/transactions';
import { useAuth } from '@/hooks/use-auth';
import { useImportTransactions } from '@/hooks/use-transactions';
import { apiClient, endpoints } from '@/lib/api';
import { YearSelector } from '@/components/common/year-selector';

export default function TransactionsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const currentYear = new Date().getFullYear();
  // Use 0 to represent "All Years"
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bankAccount, setBankAccount] = useState('fnb-business-001');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportTransactions();

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

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Use optimized export endpoint that returns CSV directly
      const response = await apiClient.get(endpoints.transactions.export, {
        params: selectedYear > 0 ? { year: selectedYear } : {},
        responseType: 'blob',
      });

      // Download the CSV file
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground">
              View and categorize bank transactions
            </p>
          </div>
          <div className="flex items-center gap-4">
            <YearSelector
              value={selectedYear}
              onChange={setSelectedYear}
              startYear={2020}
              endYear={currentYear}
              includeAllYears
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export
              </Button>
              <Button onClick={() => setIsImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import Statement
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <TransactionTable tenantId={tenantId} year={selectedYear} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleImport}>
            <DialogHeader>
              <DialogTitle>Import Bank Statement</DialogTitle>
              <DialogDescription>
                Upload a CSV or PDF bank statement to import transactions
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
