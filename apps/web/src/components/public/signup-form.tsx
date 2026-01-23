'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// South African provinces
const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

interface FormData {
  // Step 1: Creche Information
  crecheName: string;
  tradingName: string;
  province: string;
  childrenCount: string;

  // Step 2: Your Details
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;

  // Step 3: Consent
  marketingConsent: boolean;
  termsAccepted: boolean;
}

interface FormErrors {
  [key: string]: string;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export function SignupForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] = React.useState<FormData>({
    crecheName: '',
    tradingName: '',
    province: '',
    childrenCount: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    marketingConsent: false,
    termsAccepted: false,
  });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [signupSuccess, setSignupSuccess] = React.useState(false);
  const [trialExpiryDate, setTrialExpiryDate] = React.useState('');

  const totalSteps = 3;
  const progressPercentage = (currentStep / totalSteps) * 100;

  // Password strength calculator
  const calculatePasswordStrength = (password: string): PasswordStrength => {
    if (!password) {
      return { score: 0, label: '', color: 'bg-gray-200' };
    }

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 2) {
      return { score, label: 'Weak', color: 'bg-red-500' };
    } else if (score <= 3) {
      return { score, label: 'Fair', color: 'bg-yellow-500' };
    } else if (score <= 4) {
      return { score, label: 'Good', color: 'bg-blue-500' };
    } else {
      return { score, label: 'Strong', color: 'bg-green-500' };
    }
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  // Update form field
  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Validate current step
  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {};

    if (step === 1) {
      if (!formData.crecheName.trim()) {
        newErrors.crecheName = 'Creche name is required';
      }
      if (!formData.province) {
        newErrors.province = 'Province is required';
      }
      if (!formData.childrenCount) {
        newErrors.childrenCount = 'Please select number of children';
      }
    }

    if (step === 2) {
      if (!formData.fullName.trim()) {
        newErrors.fullName = 'Full name is required';
      }
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Invalid email address';
      }
      if (!formData.phone.trim()) {
        newErrors.phone = 'Phone number is required';
      } else if (!/^0\d{9}$/.test(formData.phone.replace(/\s/g, ''))) {
        newErrors.phone = 'Invalid phone number (use 10 digits starting with 0)';
      }
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    if (step === 3) {
      if (!formData.termsAccepted) {
        newErrors.termsAccepted = 'You must accept the terms and conditions';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navigate to next step
  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  // Navigate to previous step
  const previousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep(3)) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/public/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crecheName: formData.crecheName,
          tradingName: formData.tradingName || formData.crecheName,
          province: formData.province,
          childrenCount: parseInt(formData.childrenCount),
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          marketingConsent: formData.marketingConsent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Calculate trial expiry date (14 days from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 14);
      setTrialExpiryDate(expiryDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }));

      setSignupSuccess(true);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'An error occurred during signup',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Success view
  if (signupSuccess) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Welcome to CrecheBooks!</CardTitle>
          <CardDescription>
            Your account has been created successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertDescription>
              Your 14-day free trial has started! You have full access to all
              features until <strong>{trialExpiryDate}</strong>.
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-6 rounded-lg space-y-4">
            <h3 className="font-semibold text-lg">What's Next?</h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  1
                </span>
                <div>
                  <p className="font-medium">Check your email</p>
                  <p className="text-sm text-muted-foreground">
                    We've sent a verification link to {formData.email}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  2
                </span>
                <div>
                  <p className="font-medium">Complete your profile</p>
                  <p className="text-sm text-muted-foreground">
                    Add your creche details and preferences
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                  3
                </span>
                <div>
                  <p className="font-medium">Start exploring</p>
                  <p className="text-sm text-muted-foreground">
                    Set up your first children and start using CrecheBooks
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">
              Trial Benefits
            </h4>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Full access to all features
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Unlimited children and staff
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Complete billing and invoicing
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                Parent portal access
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                No credit card required
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            onClick={() => router.push('/login')}
            size="lg"
            className="w-full sm:w-auto"
          >
            Go to Login
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Multi-step form view
  return (
    <form onSubmit={handleSubmit}>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <div className="space-y-2">
            <CardTitle className="text-2xl">
              {currentStep === 1 && 'Creche Information'}
              {currentStep === 2 && 'Your Details'}
              {currentStep === 3 && 'Review & Confirm'}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 &&
                'Tell us about your creche to get started'}
              {currentStep === 2 &&
                'Create your account to access CrecheBooks'}
              {currentStep === 3 && 'Review your information and start your trial'}
            </CardDescription>
          </div>
          <div className="pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of {totalSteps}
              </span>
              <span className="text-sm text-muted-foreground">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Creche Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crecheName">
                  Creche Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="crecheName"
                  placeholder="e.g., Little Angels Creche"
                  value={formData.crecheName}
                  onChange={(e) => updateField('crecheName', e.target.value)}
                  className={cn(errors.crecheName && 'border-destructive')}
                />
                {errors.crecheName && (
                  <p className="text-sm text-destructive">{errors.crecheName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tradingName">Trading Name (Optional)</Label>
                <Input
                  id="tradingName"
                  placeholder="If different from creche name"
                  value={formData.tradingName}
                  onChange={(e) => updateField('tradingName', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank if same as creche name
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="province">
                  Province <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.province}
                  onValueChange={(value) => updateField('province', value)}
                >
                  <SelectTrigger
                    id="province"
                    className={cn(errors.province && 'border-destructive')}
                  >
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
                  <p className="text-sm text-destructive">{errors.province}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="childrenCount">
                  Number of Children <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.childrenCount}
                  onValueChange={(value) => updateField('childrenCount', value)}
                >
                  <SelectTrigger
                    id="childrenCount"
                    className={cn(errors.childrenCount && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-20">1-20 children</SelectItem>
                    <SelectItem value="21-50">21-50 children</SelectItem>
                    <SelectItem value="51-100">51-100 children</SelectItem>
                    <SelectItem value="100+">100+ children</SelectItem>
                  </SelectContent>
                </Select>
                {errors.childrenCount && (
                  <p className="text-sm text-destructive">
                    {errors.childrenCount}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Your Details */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  className={cn(errors.fullName && 'border-destructive')}
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={cn(errors.email && 'border-destructive')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0821234567"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className={cn(errors.phone && 'border-destructive')}
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter a strong password"
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    className={cn(
                      'pr-10',
                      errors.password && 'border-destructive'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {formData.password && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all',
                            passwordStrength.color
                          )}
                          style={{
                            width: `${(passwordStrength.score / 5) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {passwordStrength.label}
                      </span>
                    </div>
                  </div>
                )}
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      updateField('confirmPassword', e.target.value)
                    }
                    className={cn(
                      'pr-10',
                      errors.confirmPassword && 'border-destructive'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="bg-muted p-4 rounded-lg space-y-4">
                <h3 className="font-semibold">Creche Information</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Creche Name:</dt>
                    <dd className="font-medium">{formData.crecheName}</dd>
                  </div>
                  {formData.tradingName && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Trading Name:</dt>
                      <dd className="font-medium">{formData.tradingName}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Province:</dt>
                    <dd className="font-medium">{formData.province}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Children:</dt>
                    <dd className="font-medium">{formData.childrenCount}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-4">
                <h3 className="font-semibold">Your Details</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name:</dt>
                    <dd className="font-medium">{formData.fullName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email:</dt>
                    <dd className="font-medium">{formData.email}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phone:</dt>
                    <dd className="font-medium">{formData.phone}</dd>
                  </div>
                </dl>
              </div>

              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">🎉 14-Day Free Trial</p>
                    <ul className="space-y-1 text-sm">
                      <li>✓ Full access to all features</li>
                      <li>✓ No credit card required</li>
                      <li>✓ Cancel anytime</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="marketingConsent"
                    checked={formData.marketingConsent}
                    onCheckedChange={(checked) =>
                      updateField('marketingConsent', checked as boolean)
                    }
                  />
                  <Label
                    htmlFor="marketingConsent"
                    className="text-sm font-normal cursor-pointer"
                  >
                    I'd like to receive updates, tips, and special offers via
                    email
                  </Label>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="termsAccepted"
                    checked={formData.termsAccepted}
                    onCheckedChange={(checked) =>
                      updateField('termsAccepted', checked as boolean)
                    }
                    className={cn(errors.termsAccepted && 'border-destructive')}
                  />
                  <Label
                    htmlFor="termsAccepted"
                    className="text-sm font-normal cursor-pointer"
                  >
                    I agree to the{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      className="text-primary underline hover:no-underline"
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      className="text-primary underline hover:no-underline"
                    >
                      Privacy Policy
                    </a>{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                </div>
                {errors.termsAccepted && (
                  <p className="text-sm text-destructive">
                    {errors.termsAccepted}
                  </p>
                )}
              </div>

              {errors.submit && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.submit}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between gap-4">
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={previousStep}
              disabled={isLoading}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          <div className="flex-1" />

          {currentStep < totalSteps ? (
            <Button type="button" onClick={nextStep} disabled={isLoading}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button type="submit" disabled={isLoading} size="lg">
              {isLoading ? 'Creating Account...' : 'Start Free Trial'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
