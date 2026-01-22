'use client';

/**
 * Profile Form Component
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * Form for editing parent contact information:
 * - Full name field
 * - Email field (read-only)
 * - Phone number with SA validation
 * - Alternative phone number
 * - Address fields (street, city, postal code)
 * - Save button with loading state
 */

import { useState, useCallback } from 'react';
import { Loader2, User, Mail, Phone, MapPin, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ParentProfile } from '@/hooks/parent-portal/use-parent-profile';

interface ProfileFormProps {
  profile: ParentProfile;
  onSave: (data: Partial<ParentProfile>) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Validate South African phone number
 * Accepts formats: +27 XX XXX XXXX, 0XX XXX XXXX, 27XXXXXXXXX, 0XXXXXXXXX
 */
function validateSAPhoneNumber(phone: string): boolean {
  if (!phone) return true; // Empty is valid (optional field)

  // Remove all spaces, dashes, and parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Check for valid SA phone patterns
  const patterns = [
    /^0[1-9][0-9]{8}$/, // 0XX XXX XXXX (10 digits starting with 0)
    /^\+27[1-9][0-9]{8}$/, // +27 XX XXX XXXX
    /^27[1-9][0-9]{8}$/, // 27XXXXXXXXX
  ];

  return patterns.some((pattern) => pattern.test(cleaned));
}

/**
 * Format phone number for display
 */
function formatPhoneNumber(phone: string): string {
  if (!phone) return '';

  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Format as 0XX XXX XXXX or +27 XX XXX XXXX
  if (cleaned.startsWith('+27')) {
    const digits = cleaned.slice(3);
    if (digits.length >= 9) {
      return `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
    }
  } else if (cleaned.startsWith('27')) {
    const digits = cleaned.slice(2);
    if (digits.length >= 9) {
      return `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
    }
  } else if (cleaned.startsWith('0')) {
    if (cleaned.length >= 10) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
    }
  }

  return phone;
}

export function ProfileForm({ profile, onSave, isLoading = false }: ProfileFormProps) {
  // Form state
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone || '');
  const [alternativePhone, setAlternativePhone] = useState(profile.alternativePhone || '');
  const [street, setStreet] = useState(profile.address?.street || '');
  const [city, setCity] = useState(profile.address?.city || '');
  const [postalCode, setPostalCode] = useState(profile.address?.postalCode || '');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (phone && !validateSAPhoneNumber(phone)) {
      newErrors.phone = 'Please enter a valid South African phone number';
    }

    if (alternativePhone && !validateSAPhoneNumber(alternativePhone)) {
      newErrors.alternativePhone = 'Please enter a valid South African phone number';
    }

    if (postalCode && !/^\d{4}$/.test(postalCode)) {
      newErrors.postalCode = 'Postal code must be 4 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [firstName, lastName, phone, alternativePhone, postalCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    await onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      alternativePhone: alternativePhone.trim() || undefined,
      address: {
        street: street.trim() || undefined,
        city: city.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
      },
    });
  };

  const hasChanges =
    firstName !== profile.firstName ||
    lastName !== profile.lastName ||
    phone !== (profile.phone || '') ||
    alternativePhone !== (profile.alternativePhone || '') ||
    street !== (profile.address?.street || '') ||
    city !== (profile.address?.city || '') ||
    postalCode !== (profile.address?.postalCode || '');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Contact Information
        </CardTitle>
        <CardDescription>
          Update your contact details. Email cannot be changed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed. Contact your creche to update.
            </p>
          </div>

          {/* Phone Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhone(formatPhoneNumber(phone))}
                placeholder="082 123 4567"
                className={errors.phone ? 'border-destructive' : ''}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternativePhone">Alternative Phone</Label>
              <Input
                id="alternativePhone"
                type="tel"
                value={alternativePhone}
                onChange={(e) => setAlternativePhone(e.target.value)}
                onBlur={() => setAlternativePhone(formatPhoneNumber(alternativePhone))}
                placeholder="011 987 6543"
                className={errors.alternativePhone ? 'border-destructive' : ''}
              />
              {errors.alternativePhone && (
                <p className="text-sm text-destructive">{errors.alternativePhone}</p>
              )}
            </div>
          </div>

          {/* Address Fields */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Address
            </Label>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="street" className="text-sm">Street Address</Label>
                <Input
                  id="street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="123 Main Road"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-sm">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Johannesburg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode" className="text-sm">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="2000"
                    maxLength={4}
                    className={errors.postalCode ? 'border-destructive' : ''}
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-destructive">{errors.postalCode}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Phone Format Info */}
          <Alert className="bg-muted">
            <Phone className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Phone numbers should be in South African format: 082 123 4567 or +27 82 123 4567
            </AlertDescription>
          </Alert>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              disabled={isLoading || !hasChanges}
              className="min-w-32"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
