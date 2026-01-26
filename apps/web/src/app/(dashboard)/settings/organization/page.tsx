'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant, useUpdateTenant, type ClosureDate } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Calendar, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { SA_BANKS, SA_PROVINCES, SA_ACCOUNT_TYPES } from '@/lib/utils/constants';

const organizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  tradingName: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email'),
  // TASK-BILL-043: Bank details for invoice/statement PDF generation
  bankName: z.string().max(100).optional(),
  bankAccountHolder: z.string().max(200).optional(),
  bankAccountNumber: z.string().max(50).optional(),
  bankBranchCode: z.string().max(20).optional(),
  bankAccountType: z.string().max(30).optional(),
  bankSwiftCode: z.string().max(20).optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

const closureDateSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
});

type ClosureDateFormData = z.infer<typeof closureDateSchema>;

export default function OrganizationSettingsPage() {
  const { toast } = useToast();
  const { data: tenant, isLoading, error } = useTenant();
  const updateTenantMutation = useUpdateTenant();

  const [closureDates, setClosureDates] = useState<ClosureDate[]>([]);
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [newClosureDate, setNewClosureDate] = useState<ClosureDateFormData>({
    date: '',
    description: '',
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
  });

  // Track whether form has finished initial load to avoid overwriting existing data
  const formLoaded = useRef(false);

  // Auto-populate branch code and SWIFT code when bank name changes (user action only)
  const selectedBankName = watch('bankName');
  useEffect(() => {
    if (!selectedBankName || !formLoaded.current) return;
    const bank = SA_BANKS.find((b) => b.name === selectedBankName);
    if (bank) {
      setValue('bankBranchCode', bank.branchCode, { shouldDirty: true });
      if (bank.swiftCode) {
        setValue('bankSwiftCode', bank.swiftCode, { shouldDirty: true });
      }
    }
  }, [selectedBankName, setValue]);

  // Load tenant data into form when it arrives
  useEffect(() => {
    if (tenant) {
      reset({
        name: tenant.name || '',
        tradingName: tenant.tradingName || '',
        registrationNumber: tenant.registrationNumber || '',
        vatNumber: tenant.vatNumber || '',
        addressLine1: tenant.addressLine1 || '',
        addressLine2: tenant.addressLine2 || '',
        city: tenant.city || '',
        province: tenant.province || '',
        postalCode: tenant.postalCode || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        // TASK-BILL-043: Bank details
        bankName: tenant.bankName || '',
        bankAccountHolder: tenant.bankAccountHolder || '',
        bankAccountNumber: tenant.bankAccountNumber || '',
        bankBranchCode: tenant.bankBranchCode || '',
        bankAccountType: tenant.bankAccountType || '',
        bankSwiftCode: tenant.bankSwiftCode || '',
      });

      // Load closure dates - handle both array of strings and array of objects
      if (tenant.closureDates) {
        const normalized = (tenant.closureDates as unknown[]).map((item) => {
          if (typeof item === 'string') {
            return { date: item, description: 'Closure' };
          }
          return item as ClosureDate;
        });
        setClosureDates(normalized);
      }

      // Mark form as loaded so auto-populate only triggers on user actions
      setTimeout(() => { formLoaded.current = true; }, 100);
    }
  }, [tenant, reset]);

  const onSubmit = async (data: OrganizationFormData) => {
    if (!tenant) return;

    try {
      await updateTenantMutation.mutateAsync({
        tenantId: tenant.id,
        data: {
          ...data,
          closureDates,
        },
      });
      toast({
        title: 'Success',
        description: 'Organization details updated successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update organization details',
        variant: 'destructive',
      });
    }
  };

  const handleAddClosureDate = () => {
    const result = closureDateSchema.safeParse(newClosureDate);
    if (!result.success) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in both date and description',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicates
    if (closureDates.some((cd) => cd.date === newClosureDate.date)) {
      toast({
        title: 'Duplicate Date',
        description: 'This date is already added',
        variant: 'destructive',
      });
      return;
    }

    setClosureDates([...closureDates, newClosureDate]);
    setNewClosureDate({ date: '', description: '' });
    setShowClosureForm(false);
  };

  const handleRemoveClosureDate = (dateToRemove: string) => {
    setClosureDates(closureDates.filter((cd) => cd.date !== dateToRemove));
  };

  const handleSaveClosureDates = async () => {
    if (!tenant) return;

    try {
      await updateTenantMutation.mutateAsync({
        tenantId: tenant.id,
        data: {
          closureDates,
        },
      });
      toast({
        title: 'Success',
        description: 'Closure dates saved successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save closure dates',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">
            Failed to load organization details. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Update your creche&apos;s information. This information will be used on invoices, statements, and communications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input id="name" {...register('name')} placeholder="Elle Elephant Creche" />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tradingName">Trading Name</Label>
                <Input id="tradingName" {...register('tradingName')} placeholder="Elle Elephant" />
                <p className="text-xs text-muted-foreground">Used on documents if different from organization name</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Registration Number</Label>
                <Input id="registrationNumber" {...register('registrationNumber')} placeholder="e.g. 2024/123456/07" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatNumber">VAT Number</Label>
                <Input id="vatNumber" {...register('vatNumber')} placeholder="4XXXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" {...register('phone')} placeholder="+27..." />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="addressLine1">Address Line 1 *</Label>
                <Input id="addressLine1" {...register('addressLine1')} placeholder="Street address" />
                {errors.addressLine1 && (
                  <p className="text-sm text-destructive">{errors.addressLine1.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="addressLine2">Address Line 2</Label>
                <Input id="addressLine2" {...register('addressLine2')} placeholder="Apt, suite, etc." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input id="city" {...register('city')} />
                {errors.city && (
                  <p className="text-sm text-destructive">{errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Province *</Label>
                <Select
                  value={watch('province') || ''}
                  onValueChange={(value) => setValue('province', value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select province" />
                  </SelectTrigger>
                  <SelectContent>
                    {SA_PROVINCES.map((province) => (
                      <SelectItem key={province} value={province}>
                        {province}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.province && (
                  <p className="text-sm text-destructive">{errors.province.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code *</Label>
                <Input id="postalCode" {...register('postalCode')} />
                {errors.postalCode && (
                  <p className="text-sm text-destructive">{errors.postalCode.message}</p>
                )}
              </div>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || updateTenantMutation.isPending || !isDirty}
            >
              {(isSubmitting || updateTenantMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* TASK-BILL-043: Banking Details Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Banking Details
          </CardTitle>
          <CardDescription>
            Configure your banking details for invoice and statement payment instructions. These details will appear on all invoices and statements sent to parents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Select
                  value={watch('bankName') || ''}
                  onValueChange={(value) => setValue('bankName', value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {SA_BANKS.map((bank) => (
                      <SelectItem key={bank.name} value={bank.name}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Branch code and SWIFT code will be auto-filled</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountHolder">Account Holder Name</Label>
                <Input id="bankAccountHolder" {...register('bankAccountHolder')} placeholder="e.g., Elle Elephant Creche PTY LTD" />
                <p className="text-xs text-muted-foreground">Name as it appears on the account</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountNumber">Account Number</Label>
                <Input id="bankAccountNumber" {...register('bankAccountNumber')} placeholder="e.g., 1234567890" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankBranchCode">Branch Code</Label>
                <Input id="bankBranchCode" {...register('bankBranchCode')} placeholder="e.g., 051001" />
                <p className="text-xs text-muted-foreground">Universal branch code or specific branch</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountType">Account Type</Label>
                <Select
                  value={watch('bankAccountType') || ''}
                  onValueChange={(value) => setValue('bankAccountType', value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SA_ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankSwiftCode">SWIFT/BIC Code</Label>
                <Input id="bankSwiftCode" {...register('bankSwiftCode')} placeholder="e.g., SBZAZAJJ" />
                <p className="text-xs text-muted-foreground">For international transfers (optional)</p>
              </div>
            </div>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> These banking details will be displayed on invoices and statements to facilitate parent payments. Please ensure accuracy to avoid payment issues. If not configured, invoices will display a message asking parents to contact you for payment details.
              </p>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || updateTenantMutation.isPending || !isDirty}
            >
              {(isSubmitting || updateTenantMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Banking Details'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closure Dates</CardTitle>
          <CardDescription>
            Configure public holidays and closure periods when fees may be adjusted. These dates will be excluded from billing calculations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {closureDates.length === 0 && !showClosureForm ? (
            <p className="text-muted-foreground text-center py-4">
              No closure dates configured. Add dates when the creche will be closed.
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {closureDates
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((closureDate) => (
                  <div
                    key={closureDate.date}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {format(new Date(closureDate.date), 'dd MMMM yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {closureDate.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveClosureDate(closureDate.date)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {showClosureForm ? (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="closureDate">Date</Label>
                  <Input
                    id="closureDate"
                    type="date"
                    value={newClosureDate.date}
                    onChange={(e) =>
                      setNewClosureDate({ ...newClosureDate, date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closureDescription">Description</Label>
                  <Input
                    id="closureDescription"
                    placeholder="e.g., Christmas Day, Staff Training"
                    value={newClosureDate.description}
                    onChange={(e) =>
                      setNewClosureDate({ ...newClosureDate, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddClosureDate}>Add Date</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowClosureForm(false);
                    setNewClosureDate({ date: '', description: '' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowClosureForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Closure Date
            </Button>
          )}

          {closureDates.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <Button
                onClick={handleSaveClosureDates}
                disabled={updateTenantMutation.isPending}
              >
                {updateTenantMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Closure Dates'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
