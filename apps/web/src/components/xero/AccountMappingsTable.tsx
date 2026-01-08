'use client';

/**
 * Xero Account Mappings Table
 * TASK-STAFF-003: Manage payroll account mappings
 */

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  useAccountMappings,
  useCreateAccountMapping,
  useUpdateAccountMapping,
  useDeleteAccountMapping,
  type AccountMapping,
} from '@/hooks/use-xero-payroll';
import { useToast } from '@/hooks/use-toast';

const ACCOUNT_TYPES = [
  { value: 'SALARY_EXPENSE', label: 'Gross Salary (Expense)' },
  { value: 'PAYE_PAYABLE', label: 'PAYE Tax (Liability)' },
  { value: 'UIF_PAYABLE', label: 'UIF Employee (Liability)' },
  { value: 'UIF_EMPLOYER_EXPENSE', label: 'UIF Employer (Expense)' },
  { value: 'SDL_EXPENSE', label: 'SDL (Expense)' },
  { value: 'NET_PAY_CLEARING', label: 'Net Salary (Liability)' },
  { value: 'PENSION_PAYABLE', label: 'Pension Employee (Liability)' },
  { value: 'PENSION_EXPENSE', label: 'Pension Employer (Expense)' },
  { value: 'BONUS_EXPENSE', label: 'Bonus (Expense)' },
  { value: 'OVERTIME_EXPENSE', label: 'Overtime (Expense)' },
  { value: 'OTHER_DEDUCTION', label: 'Other Deductions (Liability)' },
] as const;

interface FormData {
  accountType: string;
  xeroAccountCode: string;
  xeroAccountName: string;
  xeroAccountId: string;
  description: string;
}

const initialFormData: FormData = {
  accountType: '',
  xeroAccountCode: '',
  xeroAccountName: '',
  xeroAccountId: '',
  description: '',
};

export function AccountMappingsTable() {
  const { toast } = useToast();
  const { data: mappings, isLoading, refetch } = useAccountMappings();
  const { mutateAsync: createMapping, isPending: isCreating } =
    useCreateAccountMapping();
  const { mutateAsync: updateMapping, isPending: isUpdating } =
    useUpdateAccountMapping();
  const { mutateAsync: deleteMapping, isPending: isDeleting } =
    useDeleteAccountMapping();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);

  const handleAdd = async () => {
    if (!formData.accountType || !formData.xeroAccountCode || !formData.xeroAccountName) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createMapping({
        accountType: formData.accountType,
        xeroAccountCode: formData.xeroAccountCode,
        xeroAccountName: formData.xeroAccountName,
        xeroAccountId: formData.xeroAccountId || formData.xeroAccountCode,
        description: formData.description || undefined,
        isActive: true,
      });
      setShowAddDialog(false);
      setFormData(initialFormData);
      toast({
        title: 'Mapping Created',
        description: 'Account mapping has been created successfully.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create account mapping.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    try {
      await deleteMapping(id);
      toast({
        title: 'Mapping Deleted',
        description: 'Account mapping has been deleted.',
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete account mapping.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (mapping: AccountMapping) => {
    try {
      await updateMapping({
        id: mapping.id,
        data: { isActive: !mapping.isActive },
      });
      toast({
        title: mapping.isActive ? 'Mapping Deactivated' : 'Mapping Activated',
        description: `Account mapping is now ${mapping.isActive ? 'inactive' : 'active'}.`,
      });
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update account mapping.',
        variant: 'destructive',
      });
    }
  };

  const getAccountTypeLabel = (value: string) => {
    return ACCOUNT_TYPES.find((t) => t.value === value)?.label || value;
  };

  const isBusy = isCreating || isUpdating || isDeleting;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Account Mappings</h2>
          <p className="text-sm text-muted-foreground">
            Map payroll components to Xero chart of accounts
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button disabled={isBusy}>
              <Plus className="w-4 h-4 mr-2" />
              Add Mapping
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Account Mapping</DialogTitle>
              <DialogDescription>
                Map a payroll component to a Xero account for journal posting.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="accountType">Account Type *</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(v) =>
                    setFormData({ ...formData, accountType: v })
                  }
                >
                  <SelectTrigger id="accountType">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="xeroAccountCode">Xero Account Code *</Label>
                <Input
                  id="xeroAccountCode"
                  value={formData.xeroAccountCode}
                  onChange={(e) =>
                    setFormData({ ...formData, xeroAccountCode: e.target.value })
                  }
                  placeholder="e.g., 6000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xeroAccountName">Xero Account Name *</Label>
                <Input
                  id="xeroAccountName"
                  value={formData.xeroAccountName}
                  onChange={(e) =>
                    setFormData({ ...formData, xeroAccountName: e.target.value })
                  }
                  placeholder="e.g., Salaries & Wages"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xeroAccountId">Xero Account ID</Label>
                <Input
                  id="xeroAccountId"
                  value={formData.xeroAccountId}
                  onChange={(e) =>
                    setFormData({ ...formData, xeroAccountId: e.target.value })
                  }
                  placeholder="Leave empty to use account code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setFormData(initialFormData);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isCreating}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Mapping
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Type</TableHead>
              <TableHead>Xero Code</TableHead>
              <TableHead>Xero Account Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Loading mappings...
                  </p>
                </TableCell>
              </TableRow>
            ) : !mappings || mappings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No mappings configured. Add mappings to enable journal posting.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-medium">
                    {getAccountTypeLabel(mapping.accountType)}
                  </TableCell>
                  <TableCell className="font-mono">
                    {mapping.xeroAccountCode}
                  </TableCell>
                  <TableCell>{mapping.xeroAccountName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={mapping.isActive ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => handleToggleActive(mapping)}
                    >
                      {mapping.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(mapping.id)}
                      disabled={isBusy}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
