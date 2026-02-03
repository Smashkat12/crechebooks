'use client';

/**
 * TASK-FIX-005: Bank Fee Configuration Settings Page
 * Allows tenants to configure bank fees for different South African banks
 */
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Save, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useBankFeeConfig,
  useSupportedBanks,
  useUpdateBankFeeConfig,
  useApplyBankPreset,
  formatFeeAmount,
  type FeeRule,
} from '@/hooks/use-bank-fees';

/**
 * Fee type display names
 */
const FEE_TYPE_LABELS: Record<string, string> = {
  TRANSACTION_FEE: 'Transaction Fee',
  MONTHLY_FEE: 'Monthly Fee',
  ATM_FEE: 'ATM Fee',
  CASH_DEPOSIT_FEE: 'Cash Deposit Fee',
  CARD_TRANSACTION_FEE: 'Card Transaction Fee',
  INTER_BANK_FEE: 'Inter-Bank Fee',
  INSUFFICIENT_FUNDS_FEE: 'Insufficient Funds Fee',
  STATEMENT_FEE: 'Statement Fee',
  ADT_DEPOSIT_FEE: 'ADT Deposit Fee',
  EFT_DEBIT_FEE: 'EFT Debit Fee',
  EFT_CREDIT_FEE: 'EFT Credit Fee',
};

/**
 * Transaction type display names
 */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  CASH_DEPOSIT: 'Cash Deposit',
  ATM_DEPOSIT: 'ATM Deposit',
  ADT_DEPOSIT: 'ADT Deposit',
  EFT_CREDIT: 'EFT Credit',
  EFT_DEBIT: 'EFT Debit',
  CARD_PURCHASE: 'Card Purchase',
  CASH_WITHDRAWAL: 'Cash Withdrawal',
  ATM_WITHDRAWAL: 'ATM Withdrawal',
  DEBIT_ORDER: 'Debit Order',
  TRANSFER: 'Transfer',
  UNKNOWN: 'Unknown',
};

export default function BankFeesSettingsPage() {
  const { toast } = useToast();
  const [selectedPresetBank, setSelectedPresetBank] = useState<string>('');
  const [editedRules, setEditedRules] = useState<FeeRule[] | null>(null);

  const { data: config, isLoading: configLoading, error: configError } = useBankFeeConfig();
  const { data: banks, isLoading: banksLoading } = useSupportedBanks();
  const updateConfigMutation = useUpdateBankFeeConfig();
  const applyPresetMutation = useApplyBankPreset();

  const displayRules = editedRules ?? config?.feeRules ?? [];

  const handleRuleFeeChange = (index: number, newAmount: string) => {
    const rules = [...displayRules];
    rules[index] = {
      ...rules[index],
      fixedAmountCents: Math.round(parseFloat(newAmount || '0') * 100),
    };
    setEditedRules(rules);
  };

  const handleRuleActiveChange = (index: number, isActive: boolean) => {
    const rules = [...displayRules];
    rules[index] = {
      ...rules[index],
      isActive,
    };
    setEditedRules(rules);
  };

  const handleApplyPreset = async () => {
    if (!selectedPresetBank) {
      toast({
        title: 'Select a bank',
        description: 'Please select a bank to apply its preset fees.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await applyPresetMutation.mutateAsync(selectedPresetBank);
      setEditedRules(null);
      toast({
        title: 'Bank preset applied',
        description: `The fee structure for ${banks?.find(b => b.code === selectedPresetBank)?.name || selectedPresetBank} has been applied.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to apply bank preset. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveChanges = async () => {
    if (!editedRules) return;

    try {
      await updateConfigMutation.mutateAsync({
        feeRules: editedRules,
        isEnabled: config?.isEnabled,
      });
      setEditedRules(null);
      toast({
        title: 'Changes saved',
        description: 'Your bank fee configuration has been updated.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleEnabled = async () => {
    try {
      await updateConfigMutation.mutateAsync({
        isEnabled: !config?.isEnabled,
      });
      toast({
        title: config?.isEnabled ? 'Bank fees disabled' : 'Bank fees enabled',
        description: config?.isEnabled
          ? 'Bank fee tracking has been disabled.'
          : 'Bank fee tracking has been enabled.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update configuration. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (configLoading || banksLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (configError) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Failed to load bank fee configuration: {configError.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bank Selection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Bank Fee Configuration
              </CardTitle>
              <CardDescription>
                Configure bank transaction fees for accurate expense tracking.
                Current bank: {config?.bankName || 'Not set'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="fees-enabled" className="text-sm">
                Enable fee tracking
              </Label>
              <Switch
                id="fees-enabled"
                checked={config?.isEnabled ?? false}
                onCheckedChange={handleToggleEnabled}
                disabled={updateConfigMutation.isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="bank-preset">Apply Bank Preset</Label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={selectedPresetBank}
                  onValueChange={setSelectedPresetBank}
                >
                  <SelectTrigger id="bank-preset" className="flex-1">
                    <SelectValue placeholder="Select a bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks?.map((bank) => (
                      <SelectItem key={bank.code} value={bank.code}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetBank || applyPresetMutation.isPending}
                >
                  {applyPresetMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Apply
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This will replace all current fee rules with the selected bank&apos;s default fees.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fee Rules Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fee Rules</CardTitle>
              <CardDescription>
                Configure individual fee amounts. All amounts are in South African Rand (ZAR).
              </CardDescription>
            </div>
            {editedRules && (
              <Button
                onClick={handleSaveChanges}
                disabled={updateConfigMutation.isPending}
              >
                {updateConfigMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {displayRules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fee rules configured. Apply a bank preset to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Transaction Types</TableHead>
                  <TableHead className="text-right">Amount (R)</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRules.map((rule, index) => (
                  <TableRow key={rule.id || index}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {FEE_TYPE_LABELS[rule.feeType] || rule.feeType}
                        </div>
                        {rule.description && (
                          <div className="text-xs text-muted-foreground">
                            {rule.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.transactionTypes.map((type) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {TRANSACTION_TYPE_LABELS[type] || type}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-muted-foreground">R</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 text-right"
                          value={(rule.fixedAmountCents / 100).toFixed(2)}
                          onChange={(e) => handleRuleFeeChange(index, e.target.value)}
                        />
                      </div>
                      {rule.percentageRate !== undefined && rule.percentageRate > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          + {(rule.percentageRate * 100).toFixed(2)}%
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) => handleRuleActiveChange(index, checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Bank</dt>
                <dd className="text-lg font-semibold">{config.bankName || 'Not configured'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={config.isEnabled ? 'default' : 'secondary'}>
                    {config.isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Active Rules</dt>
                <dd className="text-lg font-semibold">
                  {displayRules.filter((r) => r.isActive).length} / {displayRules.length}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Default Fee</dt>
                <dd className="text-lg font-semibold">
                  {formatFeeAmount(config.defaultTransactionFeeCents)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
