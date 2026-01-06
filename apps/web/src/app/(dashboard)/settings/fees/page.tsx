'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  useFeeStructures,
  useCreateFeeStructure,
  useDeleteFeeStructure,
  type FeeType,
} from '@/hooks/use-fee-structures';

const FEE_TYPES: { value: FeeType; label: string }[] = [
  { value: 'FULL_DAY', label: 'Full Day' },
  { value: 'HALF_DAY', label: 'Half Day' },
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'CUSTOM', label: 'Custom' },
];

export default function FeeStructuresSettingsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fee_type: 'FULL_DAY' as FeeType,
    amount: '',
    registration_fee: '',
    vat_inclusive: true,
    sibling_discount_percent: '',
    effective_from: new Date().toISOString().split('T')[0],
  });

  const { data, isLoading, error } = useFeeStructures();
  const createMutation = useCreateFeeStructure();
  const deleteMutation = useDeleteFeeStructure();

  const feeStructures = data?.fee_structures ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        fee_type: formData.fee_type,
        amount: parseFloat(formData.amount),
        registration_fee: formData.registration_fee
          ? parseFloat(formData.registration_fee)
          : undefined,
        vat_inclusive: formData.vat_inclusive,
        sibling_discount_percent: formData.sibling_discount_percent
          ? parseFloat(formData.sibling_discount_percent)
          : undefined,
        effective_from: formData.effective_from,
      });

      setIsDialogOpen(false);
      setFormData({
        name: '',
        description: '',
        fee_type: 'FULL_DAY',
        amount: '',
        registration_fee: '',
        vat_inclusive: true,
        sibling_discount_percent: '',
        effective_from: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error('Failed to create fee structure:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to deactivate this fee structure?')) {
      try {
        await deleteMutation.mutateAsync(id);
      } catch (err) {
        console.error('Failed to delete fee structure:', err);
      }
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Failed to load fee structures: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fee Structures</CardTitle>
              <CardDescription>
                Manage monthly fees for different enrollment types
              </CardDescription>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Fee Structure
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feeStructures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fee structures defined. Add one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Registration Fee</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Sibling Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeStructures.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{fee.name}</div>
                        {fee.description && (
                          <div className="text-sm text-muted-foreground">
                            {fee.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {FEE_TYPES.find((t) => t.value === fee.fee_type)?.label ?? fee.fee_type}
                    </TableCell>
                    <TableCell>{formatCurrency(fee.amount)}</TableCell>
                    <TableCell>
                      {fee.registration_fee ? formatCurrency(fee.registration_fee) : '-'}
                    </TableCell>
                    <TableCell>
                      {fee.vat_inclusive ? 'Inclusive' : 'Exclusive'}
                    </TableCell>
                    <TableCell>
                      {fee.sibling_discount_percent
                        ? `${fee.sibling_discount_percent}%`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={fee.is_active ? 'default' : 'secondary'}>
                        {fee.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(fee.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add Fee Structure</DialogTitle>
              <DialogDescription>
                Create a new fee structure for child enrollments
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Full Day Care"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="fee_type">Fee Type</Label>
                  <Select
                    value={formData.fee_type}
                    onValueChange={(value: FeeType) =>
                      setFormData({ ...formData, fee_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FEE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Monthly Fee (R)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="registration_fee">Registration Fee (R)</Label>
                <Input
                  id="registration_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.registration_fee}
                  onChange={(e) =>
                    setFormData({ ...formData, registration_fee: e.target.value })
                  }
                  placeholder="0.00 (one-time fee on enrollment)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sibling_discount">Sibling Discount (%)</Label>
                  <Input
                    id="sibling_discount"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formData.sibling_discount_percent}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sibling_discount_percent: e.target.value,
                      })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="effective_from">Effective From</Label>
                  <Input
                    id="effective_from"
                    type="date"
                    value={formData.effective_from}
                    onChange={(e) =>
                      setFormData({ ...formData, effective_from: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
