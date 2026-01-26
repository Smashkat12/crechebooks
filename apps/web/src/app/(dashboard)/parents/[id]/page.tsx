'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, UserPlus, MessageSquare, CheckCircle2, XCircle, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useParent, useParentChildren, useCreateChild, useSendOnboardingInvite } from '@/hooks/use-parents';
import { useFeeStructures } from '@/hooks/use-fee-structures';
import { useSendInvoices } from '@/hooks/use-invoices';
import { Skeleton } from '@/components/ui/skeleton';
import { EnrollmentStatus } from '@crechebooks/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { EnrollmentSuccessModal, type EnrollmentData } from '@/components/enrollments';

interface ParentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ParentDetailPage({ params }: ParentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: parent, isLoading, error } = useParent(id);
  const { data: children, refetch: refetchChildren } = useParentChildren(id);
  const { data: feeStructuresData } = useFeeStructures();
  const createChildMutation = useCreateChild();
  const sendInvoicesMutation = useSendInvoices();
  const sendOnboardingInvite = useSendOnboardingInvite();
  const { toast } = useToast();

  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentData | null>(null);
  const [childForm, setChildForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '' as '' | 'MALE' | 'FEMALE' | 'OTHER',
    feeStructureId: '',
    startDate: new Date().toISOString().split('T')[0],
    medicalNotes: '',
    emergencyContact: '',
    emergencyPhone: '',
  });

  const feeStructures = feeStructuresData?.fee_structures ?? [];

  const handleAddChild = async () => {
    if (!childForm.firstName || !childForm.lastName || !childForm.dateOfBirth || !childForm.feeStructureId) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await createChildMutation.mutateAsync({
        parentId: id,
        firstName: childForm.firstName,
        lastName: childForm.lastName,
        dateOfBirth: childForm.dateOfBirth,
        gender: childForm.gender || undefined,
        feeStructureId: childForm.feeStructureId,
        startDate: childForm.startDate,
        medicalNotes: childForm.medicalNotes || undefined,
        emergencyContact: childForm.emergencyContact || undefined,
        emergencyPhone: childForm.emergencyPhone || undefined,
      });

      // Close the add child dialog
      setIsAddChildOpen(false);

      // Reset form
      setChildForm({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        gender: '',
        feeStructureId: '',
        startDate: new Date().toISOString().split('T')[0],
        medicalNotes: '',
        emergencyContact: '',
        emergencyPhone: '',
      });

      // Refresh children list
      refetchChildren();

      // Show success modal with enrollment and invoice details (TASK-BILL-023)
      setEnrollmentResult(result.data);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to add child:', error);
      toast({
        title: 'Error',
        description: 'Failed to add child. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSendOnboardingInvite = async () => {
    try {
      await sendOnboardingInvite.mutateAsync(id);
      toast({
        title: 'Invite Sent',
        description: 'Onboarding invite email has been sent to the parent.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to send onboarding invite. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle viewing an invoice (TASK-BILL-023)
  const handleViewInvoice = (invoiceId: string) => {
    setShowSuccessModal(false);
    router.push(`/invoices/${invoiceId}`);
  };

  // Handle sending an invoice (TASK-BILL-023)
  const handleSendInvoice = async (invoiceId: string) => {
    try {
      await sendInvoicesMutation.mutateAsync({
        invoiceIds: [invoiceId],
        method: 'email',
      });
      toast({
        title: 'Invoice Sent',
        description: 'The invoice has been sent to the parent.',
      });
      setShowSuccessModal(false);
    } catch (error) {
      console.error('Failed to send invoice:', error);
      toast({
        title: 'Error',
        description: 'Failed to send invoice. Please try again.',
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
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!parent) {
    throw new Error('Parent not found');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/parents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {parent.firstName} {parent.lastName}
            </h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {parent.email}
              </span>
              {parent.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {parent.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSendOnboardingInvite}
            disabled={sendOnboardingInvite.isPending}
          >
            {sendOnboardingInvite.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Onboarding Invite
          </Button>
          <Link href={`/parents/${id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{parent.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{parent.phone ?? 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">WhatsApp</p>
              <div className="flex items-center gap-2">
                <p className="font-medium">{parent.whatsapp ?? 'Not provided'}</p>
                {/* TASK-WA-004: WhatsApp opt-in status indicator */}
                {parent.whatsapp && (
                  (parent as unknown as { whatsappOptIn?: boolean }).whatsappOptIn ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Opted In
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Opted In
                    </Badge>
                  )
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium">{parent.address ?? 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Preferred Communication</p>
              <p className="font-medium">{parent.preferredContact ?? 'Email'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Children ({children?.length ?? 0})</CardTitle>
            <Dialog open={isAddChildOpen} onOpenChange={setIsAddChildOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Child
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Child</DialogTitle>
                  <DialogDescription>
                    Add a new child and enroll them in a fee structure.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={childForm.firstName}
                        onChange={(e) => setChildForm({ ...childForm, firstName: e.target.value })}
                        placeholder="First name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={childForm.lastName}
                        onChange={(e) => setChildForm({ ...childForm, lastName: e.target.value })}
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={childForm.dateOfBirth}
                        onChange={(e) => setChildForm({ ...childForm, dateOfBirth: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select
                        value={childForm.gender}
                        onValueChange={(value) => setChildForm({ ...childForm, gender: value as 'MALE' | 'FEMALE' | 'OTHER' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="feeStructure">Fee Structure *</Label>
                      <Select
                        value={childForm.feeStructureId}
                        onValueChange={(value) => setChildForm({ ...childForm, feeStructureId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select fee structure" />
                        </SelectTrigger>
                        <SelectContent>
                          {feeStructures.map((fs) => (
                            <SelectItem key={fs.id} value={fs.id}>
                              {fs.name} - R{fs.amount.toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date *</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={childForm.startDate}
                        onChange={(e) => setChildForm({ ...childForm, startDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContact">Emergency Contact</Label>
                      <Input
                        id="emergencyContact"
                        value={childForm.emergencyContact}
                        onChange={(e) => setChildForm({ ...childForm, emergencyContact: e.target.value })}
                        placeholder="Contact name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                      <Input
                        id="emergencyPhone"
                        value={childForm.emergencyPhone}
                        onChange={(e) => setChildForm({ ...childForm, emergencyPhone: e.target.value })}
                        placeholder="0821234567"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medicalNotes">Medical Notes</Label>
                    <Textarea
                      id="medicalNotes"
                      value={childForm.medicalNotes}
                      onChange={(e) => setChildForm({ ...childForm, medicalNotes: e.target.value })}
                      placeholder="Any allergies, medical conditions, or special needs..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAddChildOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddChild} disabled={createChildMutation.isPending}>
                      {createChildMutation.isPending ? 'Adding...' : 'Add Child'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {children && children.length > 0 ? (
              <div className="space-y-3">
                {children.map((child) => (
                  <div key={child.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{child.firstName} {child.lastName}</p>
                      <p className="text-sm text-muted-foreground">
                        DOB: {new Date(child.dateOfBirth).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <Badge variant={child.status === EnrollmentStatus.ACTIVE ? 'default' : 'secondary'}>
                      {child.status === EnrollmentStatus.ACTIVE ? 'Enrolled' : child.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No children registered</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TASK-BILL-023: Enrollment Success Modal with Invoice */}
      <EnrollmentSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        enrollment={enrollmentResult}
        onViewInvoice={handleViewInvoice}
        onSendInvoice={handleSendInvoice}
        isSendingInvoice={sendInvoicesMutation.isPending}
      />
    </div>
  );
}
