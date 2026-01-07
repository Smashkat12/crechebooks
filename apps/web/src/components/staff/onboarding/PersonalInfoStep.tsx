'use client';

/**
 * Personal Info Step
 * TASK-STAFF-001: Staff Onboarding - Step 1
 *
 * Collects basic personal information including:
 * - Name, ID number, date of birth
 * - Contact details (email, phone)
 * - Emergency contact information
 * - Address details
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useStaff } from '@/hooks/use-staff';

interface PersonalInfoStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

export function PersonalInfoStep({ staffId, onComplete, isSubmitting, isEditing }: PersonalInfoStepProps) {
  const { data: staff } = useStaff(staffId);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    idNumber: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    streetAddress: '',
    suburb: '',
    city: '',
    province: '',
    postalCode: '',
  });

  // Pre-populate form with existing staff data
  useEffect(() => {
    if (staff) {
      setFormData((prev) => ({
        ...prev,
        firstName: staff.firstName || prev.firstName,
        lastName: staff.lastName || prev.lastName,
        idNumber: staff.idNumber || prev.idNumber,
        dateOfBirth: staff.dateOfBirth
          ? new Date(staff.dateOfBirth).toISOString().split('T')[0]
          : prev.dateOfBirth,
        email: staff.email || prev.email,
        phone: staff.phone || prev.phone,
      }));
    }
  }, [staff]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onComplete(formData);
  };

  // Validate SA ID number format (13 digits)
  const isValidIdNumber = (id: string) => /^\d{13}$/.test(id);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Details Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Personal Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="Enter first name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Enter last name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idNumber">SA ID Number *</Label>
            <Input
              id="idNumber"
              name="idNumber"
              value={formData.idNumber}
              onChange={handleChange}
              placeholder="13-digit ID number"
              maxLength={13}
              pattern="\d{13}"
              required
            />
            {formData.idNumber && !isValidIdNumber(formData.idNumber) && (
              <p className="text-xs text-destructive">ID number must be 13 digits</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth *</Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      </div>

      {/* Contact Details Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Contact Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="e.g., 082 123 4567"
              required
            />
          </div>
        </div>
      </div>

      {/* Emergency Contact Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Emergency Contact
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="emergencyContactName">Contact Name *</Label>
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              value={formData.emergencyContactName}
              onChange={handleChange}
              placeholder="Full name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">Contact Phone *</Label>
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              value={formData.emergencyContactPhone}
              onChange={handleChange}
              placeholder="Phone number"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContactRelationship">Relationship *</Label>
            <Input
              id="emergencyContactRelationship"
              name="emergencyContactRelationship"
              value={formData.emergencyContactRelationship}
              onChange={handleChange}
              placeholder="e.g., Spouse, Parent"
              required
            />
          </div>
        </div>
      </div>

      {/* Address Section */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Residential Address
        </h4>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street Address *</Label>
            <Textarea
              id="streetAddress"
              name="streetAddress"
              value={formData.streetAddress}
              onChange={handleChange}
              placeholder="Street address, unit/apartment number"
              rows={2}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="suburb">Suburb</Label>
              <Input
                id="suburb"
                name="suburb"
                value={formData.suburb}
                onChange={handleChange}
                placeholder="Suburb"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="City"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="province">Province *</Label>
              <Input
                id="province"
                name="province"
                value={formData.province}
                onChange={handleChange}
                placeholder="Province"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code *</Label>
              <Input
                id="postalCode"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                placeholder="Postal code"
                maxLength={4}
                required
              />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Update & Return' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
