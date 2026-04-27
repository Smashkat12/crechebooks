'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { ClassGroup, CreateClassGroupDto } from '@/lib/api/class-groups';

interface ClassGroupFormProps {
  /**
   * When provided the form operates in "edit" mode and pre-fills fields.
   */
  initialValues?: ClassGroup;
  onSubmit: (dto: CreateClassGroupDto) => Promise<ClassGroup>;
}

interface FormErrors {
  name?: string;
  code?: string;
  ageMinMonths?: string;
  ageMaxMonths?: string;
  capacity?: string;
  displayOrder?: string;
}

function positiveInt(value: string): number | undefined {
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

export function ClassGroupForm({ initialValues, onSubmit }: ClassGroupFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState({
    name: initialValues?.name ?? '',
    code: initialValues?.code ?? '',
    description: initialValues?.description ?? '',
    ageMinMonths: initialValues?.ageMinMonths != null ? String(initialValues.ageMinMonths) : '',
    ageMaxMonths: initialValues?.ageMaxMonths != null ? String(initialValues.ageMaxMonths) : '',
    capacity: initialValues?.capacity != null ? String(initialValues.capacity) : '',
    displayOrder: initialValues?.displayOrder != null ? String(initialValues.displayOrder) : '0',
    isActive: initialValues?.isActive ?? true,
  });

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!formData.name.trim()) {
      errs.name = 'Name is required';
    } else if (formData.name.length > 120) {
      errs.name = 'Name must be 120 characters or fewer';
    }

    if (formData.code && formData.code.length > 20) {
      errs.code = 'Code must be 20 characters or fewer';
    }

    const minMonths = formData.ageMinMonths ? parseInt(formData.ageMinMonths, 10) : undefined;
    const maxMonths = formData.ageMaxMonths ? parseInt(formData.ageMaxMonths, 10) : undefined;

    if (formData.ageMinMonths && (isNaN(minMonths!) || minMonths! < 0 || minMonths! > 300)) {
      errs.ageMinMonths = 'Must be between 0 and 300';
    }
    if (formData.ageMaxMonths && (isNaN(maxMonths!) || maxMonths! < 0 || maxMonths! > 300)) {
      errs.ageMaxMonths = 'Must be between 0 and 300';
    }
    if (minMonths != null && maxMonths != null && minMonths > maxMonths) {
      errs.ageMaxMonths = 'Max age must be greater than or equal to min age';
    }

    if (formData.capacity) {
      const cap = parseInt(formData.capacity, 10);
      if (isNaN(cap) || cap < 1) {
        errs.capacity = 'Capacity must be a positive number';
      }
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    const dto: CreateClassGroupDto = {
      name: formData.name.trim(),
      code: formData.code.trim() || undefined,
      description: formData.description.trim() || undefined,
      ageMinMonths: formData.ageMinMonths ? positiveInt(formData.ageMinMonths) : undefined,
      ageMaxMonths: formData.ageMaxMonths ? positiveInt(formData.ageMaxMonths) : undefined,
      capacity: formData.capacity ? positiveInt(formData.capacity) : undefined,
      displayOrder: formData.displayOrder ? positiveInt(formData.displayOrder) : 0,
      isActive: formData.isActive,
    };

    setIsPending(true);
    try {
      await onSubmit(dto);
      toast({ title: initialValues ? 'Class group updated' : 'Class group created' });
      router.push('/admin/class-groups');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      const status = axiosErr.response?.status;
      const message = axiosErr.response?.data?.message ?? 'Something went wrong';

      if (status === 409) {
        setErrors({ name: 'A class group with this name already exists' });
      } else {
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    } finally {
      setIsPending(false);
    }
  }

  function field(key: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  const isEdit = !!initialValues;

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Name and code used to identify this group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Toddlers"
                value={formData.name}
                onChange={(e) => field('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="e.g., TOD"
                value={formData.code}
                onChange={(e) => field('code', e.target.value)}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
              <p className="text-xs text-muted-foreground">Short identifier (max 20 characters)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of this class group"
                value={formData.description}
                onChange={(e) => field('description', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Age Range & Capacity */}
        <Card>
          <CardHeader>
            <CardTitle>Age Range &amp; Capacity</CardTitle>
            <CardDescription>Optional constraints for this group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ageMin">Min age (months)</Label>
                <Input
                  id="ageMin"
                  type="number"
                  min={0}
                  max={300}
                  placeholder="e.g., 12"
                  value={formData.ageMinMonths}
                  onChange={(e) => field('ageMinMonths', e.target.value)}
                />
                {errors.ageMinMonths && (
                  <p className="text-xs text-destructive">{errors.ageMinMonths}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageMax">Max age (months)</Label>
                <Input
                  id="ageMax"
                  type="number"
                  min={0}
                  max={300}
                  placeholder="e.g., 36"
                  value={formData.ageMaxMonths}
                  onChange={(e) => field('ageMaxMonths', e.target.value)}
                />
                {errors.ageMaxMonths && (
                  <p className="text-xs text-destructive">{errors.ageMaxMonths}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Example: Toddlers are typically 12–36 months. Leave blank to allow any age.
            </p>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                placeholder="e.g., 20"
                value={formData.capacity}
                onChange={(e) => field('capacity', e.target.value)}
              />
              {errors.capacity && <p className="text-xs text-destructive">{errors.capacity}</p>}
              <p className="text-xs text-muted-foreground">
                Maximum number of children (optional)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display order</Label>
              <Input
                id="displayOrder"
                type="number"
                min={0}
                placeholder="0"
                value={formData.displayOrder}
                onChange={(e) => field('displayOrder', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in lists
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData((prev) => ({ ...prev, isActive: v }))}
              />
              <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/class-groups')}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEdit ? 'Saving...' : 'Creating...'
            : isEdit ? 'Save changes' : 'Create class group'}
        </Button>
      </div>
    </form>
  );
}
