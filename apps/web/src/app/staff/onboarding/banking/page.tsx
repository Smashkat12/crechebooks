'use client';

/**
 * Staff Self-Onboarding - Banking Details
 * Allows staff to enter their bank account details for salary payments
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const bankOptions = [
  { value: 'ABSA', label: 'ABSA Bank', branchCode: '632005' },
  { value: 'FNB', label: 'First National Bank (FNB)', branchCode: '250655' },
  { value: 'NEDBANK', label: 'Nedbank', branchCode: '198765' },
  { value: 'STANDARD', label: 'Standard Bank', branchCode: '051001' },
  { value: 'CAPITEC', label: 'Capitec Bank', branchCode: '470010' },
  { value: 'INVESTEC', label: 'Investec Bank', branchCode: '580105' },
  { value: 'AFRICAN', label: 'African Bank', branchCode: '430000' },
  { value: 'BIDVEST', label: 'Bidvest Bank', branchCode: '462005' },
  { value: 'DISCOVERY', label: 'Discovery Bank', branchCode: '679000' },
  { value: 'TYME', label: 'TymeBank', branchCode: '678910' },
  { value: 'OTHER', label: 'Other', branchCode: '' },
];

const accountTypeOptions = [
  { value: 'CHEQUE', label: 'Cheque/Current Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'TRANSMISSION', label: 'Transmission Account' },
];

export default function BankingDetailsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    bankName: '',
    bankAccount: '',
    bankBranchCode: '',
    bankAccountType: 'CHEQUE',
  });

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchCurrentData(token);
  }, [router]);

  const fetchCurrentData = async (token: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/staff-portal/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.banking) {
          setFormData({
            bankName: data.banking.bankName || '',
            bankAccount: '', // Don't pre-fill account number for security
            bankBranchCode: data.banking.branchCode || '',
            bankAccountType: data.banking.accountType || 'CHEQUE',
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch current data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBankChange = (value: string) => {
    const selectedBank = bankOptions.find((b) => b.value === value);
    setFormData({
      ...formData,
      bankName: selectedBank?.label || value,
      bankBranchCode: selectedBank?.branchCode || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    // Validate
    if (!formData.bankName || !formData.bankAccount || !formData.bankBranchCode) {
      setError('Please fill in all required fields');
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/onboarding/banking`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save banking details');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/staff/onboarding');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save banking details');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/staff/onboarding">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Banking Details</h1>
          <p className="text-muted-foreground">
            Enter your bank account for salary payments
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Banking details saved successfully! Redirecting...
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Building className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Bank Account Information</CardTitle>
              <CardDescription>
                Your salary will be paid into this account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name *</Label>
              <Select
                value={bankOptions.find((b) => b.label === formData.bankName)?.value || 'OTHER'}
                onValueChange={handleBankChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent>
                  {bankOptions.map((bank) => (
                    <SelectItem key={bank.value} value={bank.value}>
                      {bank.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankAccount">Account Number *</Label>
              <Input
                id="bankAccount"
                placeholder="Enter your account number"
                value={formData.bankAccount}
                onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankBranchCode">Branch Code *</Label>
              <Input
                id="bankBranchCode"
                placeholder="e.g., 250655"
                value={formData.bankBranchCode}
                onChange={(e) => setFormData({ ...formData, bankBranchCode: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Universal branch code for your bank
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankAccountType">Account Type *</Label>
              <Select
                value={formData.bankAccountType}
                onValueChange={(value) => setFormData({ ...formData, bankAccountType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  {accountTypeOptions.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/staff/onboarding')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Banking Details'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Security Note:</strong> Your banking details are encrypted and stored securely.
            They are only used for salary payments and will not be shared with third parties.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
