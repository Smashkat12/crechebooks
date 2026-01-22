'use client';

/**
 * Staff Profile Form Component
 * TASK-PORTAL-025: Staff Portal Profile
 *
 * Multi-section profile form with tabbed interface.
 * Supports both editable and read-only fields based on section.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Briefcase,
  CreditCard,
  Users,
  Pencil,
  X,
  Save,
  Loader2,
  CheckCircle,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building2,
  Hash,
  Lock,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BankingDetailsDisplay, type BankingDetails } from './banking-details';
import { EmergencyContactForm, type EmergencyContact } from './emergency-contact';

// ============================================================================
// Types
// ============================================================================

export interface PersonalInfo {
  fullName: string;
  idNumber: string;
  dateOfBirth: Date | string;
  phone: string;
  email: string;
  address: string;
}

export interface EmploymentInfo {
  position: string;
  department: string;
  startDate: Date | string;
  employmentType: string;
  employeeNumber: string;
  managerName?: string;
}

export interface StaffProfile {
  personal: PersonalInfo;
  employment: EmploymentInfo;
  banking: BankingDetails;
  emergency: EmergencyContact;
  lastUpdated: Date | string;
}

export interface UpdateProfileData {
  phone?: string;
  email?: string;
  address?: string;
  emergency?: EmergencyContact;
}

export interface StaffProfileFormProps {
  profile: StaffProfile;
  onUpdateProfile: (data: UpdateProfileData) => Promise<void>;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// ============================================================================
// Read-Only Field Component
// ============================================================================

interface ReadOnlyFieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isMasked?: boolean;
}

function ReadOnlyField({ icon: Icon, label, value, isMasked }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4" />
        {label}
        <Lock className="h-3 w-3 ml-auto opacity-50" />
      </Label>
      <div className={cn(
        'py-2 px-3 bg-muted rounded-md text-sm',
        isMasked && 'font-mono tracking-wider'
      )}>
        {value || 'Not available'}
      </div>
    </div>
  );
}

// ============================================================================
// Personal Info Section
// ============================================================================

interface PersonalInfoSectionProps {
  info: PersonalInfo;
  onUpdate: (data: { phone?: string; email?: string; address?: string }) => Promise<void>;
}

function PersonalInfoSection({ info, onUpdate }: PersonalInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formData, setFormData] = useState({
    phone: info.phone,
    email: info.email,
    address: info.address,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onUpdate(formData);
      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      phone: info.phone,
      email: info.email,
      address: info.address,
    });
    setErrors({});
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Personal Information</CardTitle>
              <CardDescription>Your personal details and contact information</CardDescription>
            </div>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showSuccess && (
          <Alert className="mb-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              Personal information updated successfully.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Read-only fields */}
          <ReadOnlyField
            icon={User}
            label="Full Name"
            value={info.fullName}
          />
          <ReadOnlyField
            icon={Hash}
            label="ID Number"
            value={info.idNumber}
            isMasked
          />
          <ReadOnlyField
            icon={Calendar}
            label="Date of Birth"
            value={formatDate(info.dateOfBirth)}
          />

          {/* Editable fields */}
          {isEditing ? (
            <form onSubmit={handleSubmit} className="col-span-full space-y-4 pt-4 border-t">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, phone: e.target.value }));
                      if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
                    }}
                    className={cn(errors.phone && 'border-red-500')}
                    placeholder="+27 82 123 4567"
                  />
                  {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, email: e.target.value }));
                      if (errors.email) setErrors((p) => ({ ...p, email: '' }));
                    }}
                    className={cn(errors.email && 'border-red-500')}
                    placeholder="you@example.com"
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Residential Address <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, address: e.target.value }));
                      if (errors.address) setErrors((p) => ({ ...p, address: '' }));
                    }}
                    className={cn(errors.address && 'border-red-500')}
                    placeholder="Street address, suburb, city, postal code"
                    rows={3}
                  />
                  {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4" />
                  Phone Number
                </Label>
                <div className="py-2 px-3 bg-muted rounded-md text-sm font-mono">
                  {info.phone || 'Not set'}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
                <div className="py-2 px-3 bg-muted rounded-md text-sm">
                  {info.email || 'Not set'}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  Residential Address
                </Label>
                <div className="py-2 px-3 bg-muted rounded-md text-sm">
                  {info.address || 'Not set'}
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Employment Info Section
// ============================================================================

interface EmploymentInfoSectionProps {
  info: EmploymentInfo;
}

function EmploymentInfoSection({ info }: EmploymentInfoSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-lg">Employment Information</CardTitle>
            <CardDescription>Your employment details at the organisation</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
            Employment details are managed by HR. Contact HR if any information is incorrect.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField
            icon={Briefcase}
            label="Position"
            value={info.position}
          />
          <ReadOnlyField
            icon={Building2}
            label="Department"
            value={info.department}
          />
          <ReadOnlyField
            icon={Calendar}
            label="Start Date"
            value={formatDate(info.startDate)}
          />
          <ReadOnlyField
            icon={User}
            label="Employment Type"
            value={info.employmentType}
          />
          <ReadOnlyField
            icon={Hash}
            label="Employee Number"
            value={info.employeeNumber}
          />
          {info.managerName && (
            <ReadOnlyField
              icon={User}
              label="Manager"
              value={info.managerName}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function StaffProfileForm({ profile, onUpdateProfile, className }: StaffProfileFormProps) {
  const handleUpdatePersonal = async (data: { phone?: string; email?: string; address?: string }) => {
    await onUpdateProfile(data);
  };

  const handleUpdateEmergency = async (emergency: EmergencyContact) => {
    await onUpdateProfile({ emergency });
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">
          View and manage your personal information
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Last updated: {formatDate(profile.lastUpdated)}
        </p>
      </div>

      {/* Tabbed Sections */}
      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="personal" className="gap-2">
            <User className="h-4 w-4 hidden sm:inline" />
            Personal
          </TabsTrigger>
          <TabsTrigger value="employment" className="gap-2">
            <Briefcase className="h-4 w-4 hidden sm:inline" />
            Employment
          </TabsTrigger>
          <TabsTrigger value="banking" className="gap-2">
            <CreditCard className="h-4 w-4 hidden sm:inline" />
            Banking
          </TabsTrigger>
          <TabsTrigger value="emergency" className="gap-2">
            <Users className="h-4 w-4 hidden sm:inline" />
            Emergency
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <PersonalInfoSection
            info={profile.personal}
            onUpdate={handleUpdatePersonal}
          />
        </TabsContent>

        <TabsContent value="employment">
          <EmploymentInfoSection info={profile.employment} />
        </TabsContent>

        <TabsContent value="banking">
          <BankingDetailsDisplay details={profile.banking} />
        </TabsContent>

        <TabsContent value="emergency">
          <EmergencyContactForm
            contact={profile.emergency}
            onSave={handleUpdateEmergency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default StaffProfileForm;
