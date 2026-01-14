'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant, useUpdateTenant, type ClosureDate } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const organizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email'),
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
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
  });

  // Load tenant data into form when it arrives
  useEffect(() => {
    if (tenant) {
      reset({
        name: tenant.name || '',
        registrationNumber: tenant.registrationNumber || '',
        vatNumber: tenant.vatNumber || '',
        addressLine1: tenant.addressLine1 || '',
        addressLine2: tenant.addressLine2 || '',
        city: tenant.city || '',
        province: tenant.province || '',
        postalCode: tenant.postalCode || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
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
                <Input id="name" {...register('name')} placeholder="Elle Elephant" />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Registration Number</Label>
                <Input id="registrationNumber" {...register('registrationNumber')} />
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
                <Input id="province" {...register('province')} />
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
