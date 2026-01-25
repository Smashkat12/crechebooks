'use client';

/**
 * Staff Self-Onboarding - Tax Information
 * Allows staff to enter their tax number and tax status
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
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

const taxStatusOptions = [
  { value: 'A', label: 'Normal - Directive not applicable' },
  { value: 'B', label: 'Director of a private company' },
  { value: 'C', label: 'Income at 25% tax directive' },
  { value: 'D', label: 'Income at 45% tax directive' },
  { value: 'E', label: 'Exempt from tax' },
];

export default function TaxInfoPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    taxNumber: '',
    taxStatus: 'A',
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
        if (data.tax) {
          setFormData({
            taxNumber: data.tax.taxNumber || '',
            taxStatus: data.tax.taxStatus || 'A',
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch current data:', err);
    } finally {
      setIsLoading(false);
    }
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

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/onboarding/tax`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save tax information');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/staff/onboarding');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tax information');
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
          <h1 className="text-2xl font-bold">Tax Information</h1>
          <p className="text-muted-foreground">
            Enter your South African tax details
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
            Tax information saved successfully! Redirecting...
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>SARS Tax Details</CardTitle>
              <CardDescription>
                Your tax number is required for payroll processing
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="taxNumber">Tax Number (10 digits)</Label>
              <Input
                id="taxNumber"
                placeholder="0123456789"
                value={formData.taxNumber}
                onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                maxLength={10}
                pattern="[0-9]{10}"
              />
              <p className="text-xs text-muted-foreground">
                Your 10-digit SARS tax reference number
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxStatus">Tax Status</Label>
              <Select
                value={formData.taxStatus}
                onValueChange={(value) => setFormData({ ...formData, taxStatus: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tax status" />
                </SelectTrigger>
                <SelectContent>
                  {taxStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the tax directive that applies to you
              </p>
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
                  'Save Tax Information'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> If you don&apos;t have a tax number, you can apply for one at your nearest SARS branch or online at{' '}
            <a
              href="https://www.sars.gov.za"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              www.sars.gov.za
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
