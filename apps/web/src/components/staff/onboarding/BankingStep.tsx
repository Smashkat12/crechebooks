'use client';

/**
 * Banking Step
 * TASK-STAFF-001: Staff Onboarding - Step 4
 *
 * Collects banking information for salary payments:
 * - Bank name and account type
 * - Account number and branch code
 * - Payment verification details
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStaff } from '@/hooks/use-staff';

interface BankingStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

const SA_BANKS = [
  { value: 'ABSA', label: 'ABSA Bank', branchCode: '632005' },
  { value: 'CAPITEC', label: 'Capitec Bank', branchCode: '470010' },
  { value: 'FNB', label: 'First National Bank', branchCode: '250655' },
  { value: 'NEDBANK', label: 'Nedbank', branchCode: '198765' },
  { value: 'STANDARD', label: 'Standard Bank', branchCode: '051001' },
  { value: 'INVESTEC', label: 'Investec', branchCode: '580105' },
  { value: 'AFRICAN_BANK', label: 'African Bank', branchCode: '430000' },
  { value: 'BIDVEST', label: 'Bidvest Bank', branchCode: '462005' },
  { value: 'DISCOVERY', label: 'Discovery Bank', branchCode: '679000' },
  { value: 'TYME', label: 'TymeBank', branchCode: '678910' },
  { value: 'OTHER', label: 'Other', branchCode: '' },
];

const ACCOUNT_TYPES = [
  { value: 'CURRENT', label: 'Current/Cheque Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'TRANSMISSION', label: 'Transmission Account' },
];

const PAYMENT_METHODS = [
  { value: 'EFT', label: 'Electronic Funds Transfer (EFT)' },
  { value: 'CASH', label: 'Cash Payment' },
];

export function BankingStep({ staffId, onComplete, isSubmitting, isEditing }: BankingStepProps) {
  const { data: staff } = useStaff(staffId);

  const [formData, setFormData] = useState({
    paymentMethod: 'EFT',
    bankName: '',
    accountType: '',
    accountNumber: '',
    branchCode: '',
    accountHolderName: '',
    confirmAccountNumber: '',
  });

  // Pre-populate form with existing staff data
  useEffect(() => {
    if (staff) {
      // Find bank by name if available
      const bankEntry = SA_BANKS.find((b) => b.label === staff.bankName || b.value === staff.bankName);
      setFormData((prev) => ({
        ...prev,
        bankName: bankEntry?.value || prev.bankName,
        accountNumber: staff.bankAccount || prev.accountNumber,
        confirmAccountNumber: staff.bankAccount || prev.confirmAccountNumber,
        branchCode: staff.bankBranchCode || prev.branchCode,
        accountHolderName: `${staff.firstName} ${staff.lastName}` || prev.accountHolderName,
      }));
    }
  }, [staff]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto-fill branch code for known banks
      if (name === 'bankName') {
        const bank = SA_BANKS.find((b) => b.value === value);
        if (bank && bank.branchCode) {
          updated.branchCode = bank.branchCode;
        }
      }

      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate account numbers match
    if (formData.paymentMethod === 'EFT' && formData.accountNumber !== formData.confirmAccountNumber) {
      alert('Account numbers do not match');
      return;
    }

    await onComplete(formData);
  };

  const isCashPayment = formData.paymentMethod === 'CASH';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Banking details are used for salary payments. Please ensure accuracy to avoid payment
          delays.
        </AlertDescription>
      </Alert>

      {/* Payment Method Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Payment Method
        </h4>
        <div className="space-y-2">
          <Label htmlFor="paymentMethod">Payment Method *</Label>
          <Select
            value={formData.paymentMethod}
            onValueChange={(value) => handleSelectChange('paymentMethod', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCashPayment && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cash payments are discouraged and may have tax implications. EFT is the recommended
              payment method for compliance purposes.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Bank Account Section (only for EFT) */}
      {!isCashPayment && (
        <>
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Bank Account Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name *</Label>
                <Select
                  value={formData.bankName}
                  onValueChange={(value) => handleSelectChange('bankName', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {SA_BANKS.map((bank) => (
                      <SelectItem key={bank.value} value={bank.value}>
                        {bank.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountType">Account Type *</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(value) => handleSelectChange('accountType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchCode">Branch Code *</Label>
                <Input
                  id="branchCode"
                  name="branchCode"
                  value={formData.branchCode}
                  onChange={handleChange}
                  placeholder="6-digit branch code"
                  maxLength={6}
                  required={!isCashPayment}
                />
                <p className="text-xs text-muted-foreground">
                  Universal branch codes are pre-filled for major banks
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountHolderName">Account Holder Name *</Label>
                <Input
                  id="accountHolderName"
                  name="accountHolderName"
                  value={formData.accountHolderName}
                  onChange={handleChange}
                  placeholder="Name as it appears on the account"
                  required={!isCashPayment}
                />
              </div>
            </div>
          </div>

          {/* Account Number Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Account Number
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Account Number *</Label>
                <Input
                  id="accountNumber"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleChange}
                  placeholder="Enter account number"
                  required={!isCashPayment}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmAccountNumber">Confirm Account Number *</Label>
                <Input
                  id="confirmAccountNumber"
                  name="confirmAccountNumber"
                  value={formData.confirmAccountNumber}
                  onChange={handleChange}
                  placeholder="Re-enter account number"
                  required={!isCashPayment}
                />
                {formData.accountNumber &&
                  formData.confirmAccountNumber &&
                  formData.accountNumber !== formData.confirmAccountNumber && (
                    <p className="text-xs text-destructive">Account numbers do not match</p>
                  )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Update & Return' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
