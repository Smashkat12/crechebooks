'use client';

import { use, useState, useEffect } from 'react';
import { ArrowLeft, Save, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useParent, useUpdateParent } from '@/hooks/use-parents';
import { useToast } from '@/hooks/use-toast';

interface ParentEditPageProps {
  params: Promise<{ id: string }>;
}

export default function ParentEditPage({ params }: ParentEditPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: parent, isLoading, error } = useParent(id);
  const updateParentMutation = useUpdateParent();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    whatsappNumber: '',
    address: '',
    preferredCommunication: 'EMAIL' as 'EMAIL' | 'WHATSAPP' | 'BOTH',
    /** TASK-WA-004: WhatsApp opt-in consent (POPIA compliant) */
    whatsappOptIn: false,
  });

  useEffect(() => {
    if (parent) {
      setFormData({
        firstName: parent.firstName || '',
        lastName: parent.lastName || '',
        email: parent.email || '',
        phone: parent.phone || '',
        whatsappNumber: parent.whatsapp || '',
        address: parent.address || '',
        preferredCommunication: (parent.preferredContact as 'EMAIL' | 'WHATSAPP' | 'BOTH') || 'EMAIL',
        // TASK-WA-004: WhatsApp opt-in from parent record
        whatsappOptIn: (parent as unknown as { whatsappOptIn?: boolean }).whatsappOptIn ?? false,
      });
    }
  }, [parent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateParentMutation.mutateAsync({
        id,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        whatsappNumber: formData.whatsappNumber || undefined,
        address: formData.address || undefined,
        preferredCommunication: formData.preferredCommunication,
        // TASK-WA-004: WhatsApp opt-in consent
        whatsappOptIn: formData.whatsappOptIn,
      });

      toast({
        title: 'Parent Updated',
        description: 'Parent information has been updated successfully.',
      });

      router.push(`/parents/${id}`);
    } catch (error) {
      console.error('Failed to update parent:', error);
      toast({
        title: 'Error',
        description: 'Failed to update parent. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (error) {
    throw new Error(`Failed to load parent: ${error.message}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!parent) {
    throw new Error('Parent not found');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/parents/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Parent</h1>
          <p className="text-muted-foreground">
            Update {parent.firstName} {parent.lastName}&apos;s information
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Parent Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Enter first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Enter last name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="parent@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0821234567"
                />
                <p className="text-sm text-muted-foreground">South African mobile number</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Number</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  placeholder="0821234567"
                />
                <p className="text-sm text-muted-foreground">For invoice notifications</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full residential address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredCommunication">Preferred Communication *</Label>
              <Select
                value={formData.preferredCommunication}
                onValueChange={(value) => setFormData({ ...formData, preferredCommunication: value as 'EMAIL' | 'WHATSAPP' | 'BOTH' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">Email Only</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp Only</SelectItem>
                  <SelectItem value="BOTH">Email and WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* TASK-WA-004: WhatsApp Opt-In Consent Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              WhatsApp Notifications
            </CardTitle>
            <CardDescription>
              Receive invoices, statements, and payment reminders via WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-3 rounded-lg border p-4 bg-muted/50">
              <Checkbox
                id="whatsappOptIn"
                checked={formData.whatsappOptIn}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, whatsappOptIn: checked === true })
                }
                disabled={!formData.whatsappNumber}
                className="mt-1"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="whatsappOptIn"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  I consent to receive WhatsApp messages
                </Label>
                <p className="text-sm text-muted-foreground">
                  By checking this box, I agree to receive invoices, monthly statements, and payment
                  reminders via WhatsApp to the number provided above. I understand I can withdraw
                  this consent at any time by unchecking this box.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  This consent is required under the Protection of Personal Information Act (POPIA).
                  Your WhatsApp number will only be used for billing-related communications.
                </p>
              </div>
            </div>
            {!formData.whatsappNumber && (
              <p className="text-sm text-amber-600">
                Please enter a WhatsApp number above to enable WhatsApp notifications.
              </p>
            )}
            {formData.whatsappOptIn && formData.whatsappNumber && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <MessageSquare className="h-4 w-4" />
                WhatsApp notifications are enabled for {formData.whatsappNumber}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex justify-end gap-4">
              <Link href={`/parents/${id}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={updateParentMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateParentMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
