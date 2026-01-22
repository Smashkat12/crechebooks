'use client';

/**
 * Emergency Contact Component
 * TASK-PORTAL-025: Staff Portal Profile
 *
 * Editable emergency contact form with validation.
 * Allows staff to update their emergency contact information.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Pencil, X, Save, Loader2, CheckCircle, Phone, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface EmergencyContact {
  contactName: string;
  relationship: string;
  contactPhone: string;
  alternatePhone?: string;
}

export interface EmergencyContactProps {
  contact: EmergencyContact;
  onSave: (contact: EmergencyContact) => Promise<void>;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const RELATIONSHIP_OPTIONS = [
  'Spouse',
  'Partner',
  'Parent',
  'Sibling',
  'Child',
  'Relative',
  'Friend',
  'Other',
];

// ============================================================================
// Helper Functions
// ============================================================================

const formatPhoneNumber = (phone: string): string => {
  // Simple formatting for South African numbers
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('27')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
};

// ============================================================================
// Display Mode Component
// ============================================================================

interface DisplayModeProps {
  contact: EmergencyContact;
  onEdit: () => void;
}

function DisplayMode({ contact, onEdit }: DisplayModeProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Contact Name
          </p>
          <p className="font-medium">{contact.contactName || 'Not set'}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Relationship</p>
          <p className="font-medium">{contact.relationship || 'Not set'}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Phone Number
          </p>
          <p className="font-medium font-mono">
            {contact.contactPhone ? formatPhoneNumber(contact.contactPhone) : 'Not set'}
          </p>
        </div>
        {contact.alternatePhone && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Alternate Phone</p>
            <p className="font-medium font-mono">
              {formatPhoneNumber(contact.alternatePhone)}
            </p>
          </div>
        )}
      </div>

      <Button variant="outline" onClick={onEdit} className="gap-2">
        <Pencil className="h-4 w-4" />
        Edit Emergency Contact
      </Button>
    </div>
  );
}

// ============================================================================
// Edit Mode Component
// ============================================================================

interface EditModeProps {
  contact: EmergencyContact;
  onSave: (contact: EmergencyContact) => Promise<void>;
  onCancel: () => void;
}

function EditMode({ contact, onSave, onCancel }: EditModeProps) {
  const [formData, setFormData] = useState<EmergencyContact>(contact);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof EmergencyContact, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof EmergencyContact, string>> = {};

    if (!formData.contactName.trim()) {
      newErrors.contactName = 'Contact name is required';
    }

    if (!formData.relationship) {
      newErrors.relationship = 'Relationship is required';
    }

    if (!formData.contactPhone.trim()) {
      newErrors.contactPhone = 'Phone number is required';
    } else if (formData.contactPhone.replace(/\D/g, '').length < 10) {
      newErrors.contactPhone = 'Please enter a valid phone number';
    }

    if (formData.alternatePhone && formData.alternatePhone.replace(/\D/g, '').length < 10) {
      newErrors.alternatePhone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave(formData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof EmergencyContact, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Contact Name */}
        <div className="space-y-2">
          <Label htmlFor="contactName">
            Contact Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="contactName"
            value={formData.contactName}
            onChange={(e) => handleChange('contactName', e.target.value)}
            placeholder="Full name of emergency contact"
            className={cn(errors.contactName && 'border-red-500')}
          />
          {errors.contactName && (
            <p className="text-xs text-red-500">{errors.contactName}</p>
          )}
        </div>

        {/* Relationship */}
        <div className="space-y-2">
          <Label htmlFor="relationship">
            Relationship <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.relationship}
            onValueChange={(value) => handleChange('relationship', value)}
          >
            <SelectTrigger className={cn(errors.relationship && 'border-red-500')}>
              <SelectValue placeholder="Select relationship" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.relationship && (
            <p className="text-xs text-red-500">{errors.relationship}</p>
          )}
        </div>

        {/* Phone Number */}
        <div className="space-y-2">
          <Label htmlFor="contactPhone">
            Phone Number <span className="text-red-500">*</span>
          </Label>
          <Input
            id="contactPhone"
            type="tel"
            value={formData.contactPhone}
            onChange={(e) => handleChange('contactPhone', e.target.value)}
            placeholder="+27 82 123 4567"
            className={cn(errors.contactPhone && 'border-red-500')}
          />
          {errors.contactPhone && (
            <p className="text-xs text-red-500">{errors.contactPhone}</p>
          )}
        </div>

        {/* Alternate Phone */}
        <div className="space-y-2">
          <Label htmlFor="alternatePhone">Alternate Phone (Optional)</Label>
          <Input
            id="alternatePhone"
            type="tel"
            value={formData.alternatePhone || ''}
            onChange={(e) => handleChange('alternatePhone', e.target.value)}
            placeholder="+27 11 123 4567"
            className={cn(errors.alternatePhone && 'border-red-500')}
          />
          {errors.alternatePhone && (
            <p className="text-xs text-red-500">{errors.alternatePhone}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
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
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EmergencyContactForm({ contact, onSave, className }: EmergencyContactProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = async (updatedContact: EmergencyContact) => {
    await onSave(updatedContact);
    setIsEditing(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-lg">Emergency Contact</CardTitle>
            <CardDescription>
              Person to contact in case of an emergency
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showSuccess && (
          <Alert className="mb-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              Emergency contact updated successfully.
            </AlertDescription>
          </Alert>
        )}

        {isEditing ? (
          <EditMode
            contact={contact}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <DisplayMode
            contact={contact}
            onEdit={() => setIsEditing(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default EmergencyContactForm;
