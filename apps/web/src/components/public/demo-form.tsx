'use client';

import * as React from 'react';
import { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface DemoFormProps {
  className?: string;
}

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  crecheName: string;
  childrenCount: string;
  province: string;
  currentSoftware: string;
  challenges: string[];
  preferredTime: string;
  marketingConsent: boolean;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  crecheName?: string;
  childrenCount?: string;
  province?: string;
}

const childrenCountOptions = [
  { value: '', label: 'Select number of children' },
  { value: '1-30', label: '1-30 children' },
  { value: '31-50', label: '31-50 children' },
  { value: '51-100', label: '51-100 children' },
  { value: '100+', label: '100+ children' },
];

const provinceOptions = [
  { value: '', label: 'Select province' },
  { value: 'eastern-cape', label: 'Eastern Cape' },
  { value: 'free-state', label: 'Free State' },
  { value: 'gauteng', label: 'Gauteng' },
  { value: 'kwazulu-natal', label: 'KwaZulu-Natal' },
  { value: 'limpopo', label: 'Limpopo' },
  { value: 'mpumalanga', label: 'Mpumalanga' },
  { value: 'north-west', label: 'North West' },
  { value: 'northern-cape', label: 'Northern Cape' },
  { value: 'western-cape', label: 'Western Cape' },
];

const preferredTimeOptions = [
  { value: '', label: 'Select preferred time' },
  { value: 'morning', label: 'Morning (9am - 12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm - 5pm)' },
  { value: 'evening', label: 'Evening (5pm - 7pm)' },
];

const challengeOptions = [
  { id: 'invoicing', label: 'Manual invoicing taking too long' },
  { id: 'payments', label: 'Chasing late payments' },
  { id: 'sars', label: 'SARS compliance stress' },
  { id: 'payroll', label: 'Staff payroll management' },
  { id: 'reporting', label: 'Financial reporting' },
  { id: 'bookkeeping', label: 'No time for bookkeeping' },
];

export function DemoForm({ className }: DemoFormProps) {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    crecheName: '',
    childrenCount: '',
    province: '',
    currentSoftware: '',
    challenges: [],
    preferredTime: '',
    marketingConsent: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid work email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[\d\s\+\-\(\)]{10,}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    if (!formData.crecheName.trim()) {
      newErrors.crecheName = 'Creche name is required';
    }

    if (!formData.childrenCount) {
      newErrors.childrenCount = 'Please select the number of children';
    }

    if (!formData.province) {
      newErrors.province = 'Please select your province';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleChallengeChange = (challengeId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      challenges: checked
        ? [...prev.challenges, challengeId]
        : prev.challenges.filter((id) => id !== challengeId),
    }));
  };

  const handleConsentChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, marketingConsent: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setStatus('loading');

    try {
      // Simulate API call - replace with actual endpoint
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In production, this would be an actual API call:
      // const response = await fetch('/api/demo-request', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData),
      // });

      setStatus('success');
      setStatusMessage(
        'Thank you for your demo request! Our team will contact you within 24 hours to schedule your personalised demo.'
      );

      // Reset form after success
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        crecheName: '',
        childrenCount: '',
        province: '',
        currentSoftware: '',
        challenges: [],
        preferredTime: '',
        marketingConsent: false,
      });
    } catch (error) {
      setStatus('error');
      setStatusMessage(
        'Something went wrong. Please try again or email us directly at hello@crechebooks.co.za'
      );
    }
  };

  const resetForm = () => {
    setStatus('idle');
    setStatusMessage('');
    setErrors({});
  };

  // Success state
  if (status === 'success') {
    return (
      <Card className={cn('', className)}>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            Demo Request Submitted!
          </h3>
          <p className="mt-2 text-muted-foreground">{statusMessage}</p>
          <Button onClick={resetForm} variant="outline" className="mt-6">
            Request Another Demo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error alert */}
          {status === 'error' && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{statusMessage}</p>
            </div>
          )}

          {/* Full Name Field */}
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Your full name"
              value={formData.fullName}
              onChange={handleChange}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? 'fullName-error' : undefined}
              className={cn(errors.fullName && 'border-destructive')}
            />
            {errors.fullName && (
              <p id="fullName-error" className="text-sm text-destructive">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* Work Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Work Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your.email@creche.co.za"
              value={formData.email}
              onChange={handleChange}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={cn(errors.email && 'border-destructive')}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          {/* Phone Number Field */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+27 XX XXX XXXX"
              value={formData.phone}
              onChange={handleChange}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              className={cn(errors.phone && 'border-destructive')}
            />
            {errors.phone && (
              <p id="phone-error" className="text-sm text-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          {/* Creche Name Field */}
          <div className="space-y-2">
            <Label htmlFor="crecheName">
              Creche Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="crecheName"
              name="crecheName"
              type="text"
              placeholder="Your creche name"
              value={formData.crecheName}
              onChange={handleChange}
              aria-invalid={!!errors.crecheName}
              aria-describedby={errors.crecheName ? 'crecheName-error' : undefined}
              className={cn(errors.crecheName && 'border-destructive')}
            />
            {errors.crecheName && (
              <p id="crecheName-error" className="text-sm text-destructive">
                {errors.crecheName}
              </p>
            )}
          </div>

          {/* Number of Children Field */}
          <div className="space-y-2">
            <Label htmlFor="childrenCount">
              Number of Children <span className="text-destructive">*</span>
            </Label>
            <select
              id="childrenCount"
              name="childrenCount"
              value={formData.childrenCount}
              onChange={handleChange}
              aria-invalid={!!errors.childrenCount}
              aria-describedby={
                errors.childrenCount ? 'childrenCount-error' : undefined
              }
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                errors.childrenCount && 'border-destructive'
              )}
            >
              {childrenCountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.childrenCount && (
              <p id="childrenCount-error" className="text-sm text-destructive">
                {errors.childrenCount}
              </p>
            )}
          </div>

          {/* Province Field */}
          <div className="space-y-2">
            <Label htmlFor="province">
              Province <span className="text-destructive">*</span>
            </Label>
            <select
              id="province"
              name="province"
              value={formData.province}
              onChange={handleChange}
              aria-invalid={!!errors.province}
              aria-describedby={errors.province ? 'province-error' : undefined}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                errors.province && 'border-destructive'
              )}
            >
              {provinceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.province && (
              <p id="province-error" className="text-sm text-destructive">
                {errors.province}
              </p>
            )}
          </div>

          {/* Current Accounting Software Field */}
          <div className="space-y-2">
            <Label htmlFor="currentSoftware">
              Current Accounting Software (Optional)
            </Label>
            <Input
              id="currentSoftware"
              name="currentSoftware"
              type="text"
              placeholder="e.g., Excel, Xero, Pastel, etc."
              value={formData.currentSoftware}
              onChange={handleChange}
            />
          </div>

          {/* Main Challenges Field */}
          <div className="space-y-3">
            <Label>Main Challenges (Select all that apply)</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {challengeOptions.map((challenge) => (
                <div key={challenge.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`challenge-${challenge.id}`}
                    checked={formData.challenges.includes(challenge.id)}
                    onCheckedChange={(checked) =>
                      handleChallengeChange(challenge.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`challenge-${challenge.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {challenge.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Preferred Demo Time Field */}
          <div className="space-y-2">
            <Label htmlFor="preferredTime">Preferred Demo Time</Label>
            <select
              id="preferredTime"
              name="preferredTime"
              value={formData.preferredTime}
              onChange={handleChange}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              {preferredTimeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Marketing Consent Field */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="marketingConsent"
              checked={formData.marketingConsent}
              onCheckedChange={handleConsentChange}
            />
            <Label
              htmlFor="marketingConsent"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              I agree to receive product updates, tips, and promotional
              communications from CrecheBooks. You can unsubscribe at any time.
            </Label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Book Your Free Demo'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By submitting this form, you agree to our{' '}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </a>
            .
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
