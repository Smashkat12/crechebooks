'use client';

/**
 * Parent Onboarding Page
 * Comprehensive onboarding wizard with:
 * - Contact information
 * - Fee agreement review and acceptance
 * - Consent forms (POPIA, medical, media, indemnity)
 * - Document downloads
 * - Welcome pack on completion
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  User,
  Phone,
  MapPin,
  AlertCircle,
  FileText,
  Download,
  Check,
  Shield,
  Heart,
  Camera,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OnboardingAction {
  id: string;
  title: string;
  description: string;
  category: string;
  isRequired: boolean;
  isComplete: boolean;
}

interface GeneratedDocument {
  id: string;
  documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS' | 'WELCOME_PACK';
  fileName: string;
  generatedAt: string;
  signedAt: string | null;
  acknowledged: boolean;
}

interface OnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  completedCount: number;
  totalRequired: number;
  requiredActions: OnboardingAction[];
  documents: GeneratedDocument[];
}

interface ProfileFormData {
  phone: string;
  whatsapp: string;
  address: {
    street: string;
    city: string;
    postalCode: string;
  };
}

interface ConsentFormData {
  mediaConsent: 'internal_only' | 'website' | 'social_media' | 'all' | 'none';
  authorizedCollectors: Array<{
    name: string;
    idNumber: string;
    relationship: string;
  }>;
  acknowledgedFeeAgreement: boolean;
  acknowledgedConsents: boolean;
}

type Step = 'contact' | 'fee_agreement' | 'consents' | 'complete';

export default function ParentOnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('contact');
  const [parentName, setParentName] = useState('');

  const [profileData, setProfileData] = useState<ProfileFormData>({
    phone: '',
    whatsapp: '',
    address: {
      street: '',
      city: '',
      postalCode: '',
    },
  });

  const [consentData, setConsentData] = useState<ConsentFormData>({
    mediaConsent: 'internal_only',
    authorizedCollectors: [{ name: '', idNumber: '', relationship: '' }],
    acknowledgedFeeAgreement: false,
    acknowledgedConsents: false,
  });

  const steps: { id: Step; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'contact', title: 'Contact Info', icon: Phone },
    { id: 'fee_agreement', title: 'Fee Agreement', icon: Scale },
    { id: 'consents', title: 'Consents', icon: Shield },
    { id: 'complete', title: 'Complete', icon: CheckCircle2 },
  ];

  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
      return;
    }
    fetchOnboardingStatus(token);
    fetchProfile(token);
  }, [router]);

  const fetchOnboardingStatus = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/parent-portal/onboarding`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setOnboardingStatus(data);

        // Determine current step based on status
        if (data.status === 'COMPLETED') {
          setCurrentStep('complete');
        } else {
          const contactComplete = data.requiredActions.find(
            (a: OnboardingAction) => a.id === 'contact_phone'
          )?.isComplete;
          const addressComplete = data.requiredActions.find(
            (a: OnboardingAction) => a.id === 'contact_address'
          )?.isComplete;
          const feeAgreementComplete = data.requiredActions.find(
            (a: OnboardingAction) => a.id === 'fee_agreement'
          )?.isComplete;

          if (!contactComplete || !addressComplete) {
            setCurrentStep('contact');
          } else if (!feeAgreementComplete) {
            setCurrentStep('fee_agreement');
          } else {
            setCurrentStep('consents');
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch onboarding status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/parent-portal/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setParentName(`${data.firstName} ${data.lastName}`);
        setProfileData({
          phone: data.phone || '',
          whatsapp: data.alternativePhone || '',
          address: {
            street: data.address?.street || '',
            city: data.address?.city || '',
            postalCode: data.address?.postalCode || '',
          },
        });
      }
    } catch (err) {
      console.warn('Failed to fetch profile:', err);
    }
  };

  const handleSaveContact = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/parent-portal/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: profileData.phone,
          alternativePhone: profileData.whatsapp,
          address: profileData.address,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update profile');
      }

      setSuccess('Contact information saved!');
      await fetchOnboardingStatus(token);

      // Move to next step
      setTimeout(() => setCurrentStep('fee_agreement'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateDocuments = async () => {
    setIsGeneratingDocs(true);
    setError(null);

    const token = localStorage.getItem('parent_session_token');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/v1/parent-portal/onboarding/documents/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      await fetchOnboardingStatus(token);
    } catch (err) {
      setError('Failed to generate documents');
    } finally {
      setIsGeneratingDocs(false);
    }
  };

  const handleDownloadDocument = async (documentId: string) => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/v1/parent-portal/onboarding/documents/${documentId}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to download document');
    }
  };

  const handleSignDocument = async (documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS') => {
    setIsSaving(true);
    setError(null);

    const token = localStorage.getItem('parent_session_token');
    if (!token) return;

    try {
      const body: Record<string, unknown> = {
        documentType,
        signedByName: parentName,
      };

      if (documentType === 'CONSENT_FORMS') {
        body.mediaConsent = consentData.mediaConsent;
        body.authorizedCollectors = consentData.authorizedCollectors.filter(
          (c) => c.name && c.idNumber
        );
      }

      await fetch(`${API_URL}/api/v1/parent-portal/onboarding/documents/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      setSuccess(`${documentType === 'FEE_AGREEMENT' ? 'Fee agreement' : 'Consent forms'} signed!`);
      await fetchOnboardingStatus(token);

      if (documentType === 'FEE_AGREEMENT') {
        setTimeout(() => setCurrentStep('consents'), 1000);
      } else {
        setTimeout(() => setCurrentStep('complete'), 1000);
      }
    } catch (err) {
      setError('Failed to sign document');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setIsSaving(true);
    const token = localStorage.getItem('parent_session_token');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/v1/parent-portal/onboarding/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      router.push('/parent/dashboard');
    } catch (err) {
      setError('Failed to complete onboarding');
    } finally {
      setIsSaving(false);
    }
  };

  const addAuthorizedCollector = () => {
    setConsentData((prev) => ({
      ...prev,
      authorizedCollectors: [
        ...prev.authorizedCollectors,
        { name: '', idNumber: '', relationship: '' },
      ],
    }));
  };

  const updateAuthorizedCollector = (
    index: number,
    field: 'name' | 'idNumber' | 'relationship',
    value: string
  ) => {
    setConsentData((prev) => ({
      ...prev,
      authorizedCollectors: prev.authorizedCollectors.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      ),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Step navigation indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isPast =
          steps.findIndex((s) => s.id === currentStep) > index ||
          currentStep === 'complete';

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
                isActive && 'border-primary bg-primary text-primary-foreground',
                isPast && !isActive && 'border-green-500 bg-green-500 text-white',
                !isActive && !isPast && 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {isPast && !isActive ? (
                <Check className="h-5 w-5" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-16 h-0.5 mx-2',
                  isPast ? 'bg-green-500' : 'bg-muted-foreground/30'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/parent/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Complete Your Profile</h1>
          <p className="text-muted-foreground">
            Please complete the following steps to access all features
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your Progress</CardTitle>
          <CardDescription>Complete all required steps to finish onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {onboardingStatus?.completedCount || 0} of{' '}
              {onboardingStatus?.totalRequired || 0} required steps complete
            </span>
            <span className="font-medium">{onboardingStatus?.percentComplete || 0}%</span>
          </div>
          <Progress value={onboardingStatus?.percentComplete || 0} className="h-2" />
        </CardContent>
      </Card>

      <StepIndicator />

      {/* Step Content */}
      {currentStep === 'contact' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  Provide your contact details for communication
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveContact();
              }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g., 082 123 4567"
                  value={profileData.phone}
                  onChange={(e) =>
                    setProfileData({ ...profileData, phone: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Number (Optional)</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="e.g., 082 123 4567"
                  value={profileData.whatsapp}
                  onChange={(e) =>
                    setProfileData({ ...profileData, whatsapp: e.target.value })
                  }
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <Label>Physical Address *</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street" className="text-sm text-muted-foreground">
                    Street Address
                  </Label>
                  <Input
                    id="street"
                    placeholder="e.g., 123 Main Road"
                    value={profileData.address.street}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        address: { ...profileData.address, street: e.target.value },
                      })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm text-muted-foreground">
                      City
                    </Label>
                    <Input
                      id="city"
                      placeholder="e.g., Johannesburg"
                      value={profileData.address.city}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          address: { ...profileData.address, city: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode" className="text-sm text-muted-foreground">
                      Postal Code
                    </Label>
                    <Input
                      id="postalCode"
                      placeholder="e.g., 2000"
                      value={profileData.address.postalCode}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          address: { ...profileData.address, postalCode: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {currentStep === 'fee_agreement' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Fee Agreement</CardTitle>
                <CardDescription>
                  Review and accept the fee agreement and payment terms
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!onboardingStatus?.documents.find((d) => d.documentType === 'FEE_AGREEMENT') ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Generate your fee agreement to review
                </p>
                <Button onClick={handleGenerateDocuments} disabled={isGeneratingDocs}>
                  {isGeneratingDocs ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Documents'
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium">Fee Agreement</p>
                        <p className="text-sm text-muted-foreground">
                          Payment terms, cancellation policy, and fee structure
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownloadDocument(
                          onboardingStatus.documents.find(
                            (d) => d.documentType === 'FEE_AGREEMENT'
                          )?.id || ''
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Key Terms Summary:</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        Fees are payable in advance by the 1st of each month
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        One calendar month written notice required for withdrawal
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        Late payment fee applies after the 7th of each month
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        Registration fee is non-refundable
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/50">
                  <Checkbox
                    id="fee-agree"
                    checked={consentData.acknowledgedFeeAgreement}
                    onCheckedChange={(checked) =>
                      setConsentData({
                        ...consentData,
                        acknowledgedFeeAgreement: checked as boolean,
                      })
                    }
                  />
                  <div>
                    <Label htmlFor="fee-agree" className="font-medium cursor-pointer">
                      I have read and agree to the fee agreement
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      By checking this box, I confirm that I have read, understood, and agree to
                      all terms and conditions in the fee agreement.
                    </p>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setCurrentStep('contact')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => handleSignDocument('FEE_AGREEMENT')}
                    disabled={!consentData.acknowledgedFeeAgreement || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing...
                      </>
                    ) : (
                      <>
                        Accept &amp; Continue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 'consents' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Consent Forms</CardTitle>
                <CardDescription>
                  POPIA consent, medical consent, and other required permissions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* POPIA Consent Summary */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <h4 className="font-medium">POPIA Consent</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                By continuing, you consent to the collection and processing of personal
                information for enrollment administration, communication, and emergency purposes
                as required by the Protection of Personal Information Act.
              </p>
            </div>

            {/* Medical Consent Summary */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                <h4 className="font-medium">Medical Consent</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Authorization for emergency medical treatment, first aid administration, and
                transport to medical facilities if required.
              </p>
            </div>

            {/* Media Consent */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-purple-600" />
                <h4 className="font-medium">Media Consent</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Select how photographs and videos of your child may be used:
              </p>
              <RadioGroup
                value={consentData.mediaConsent}
                onValueChange={(value) =>
                  setConsentData({
                    ...consentData,
                    mediaConsent: value as ConsentFormData['mediaConsent'],
                  })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="internal_only" id="internal" />
                  <Label htmlFor="internal">Internal use only (developmental records)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="website" id="website" />
                  <Label htmlFor="website">Website and promotional materials</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="social_media" id="social" />
                  <Label htmlFor="social">Social media platforms</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all">All of the above</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none">No photos or videos</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Authorized Collectors */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium">Authorized Collectors</h4>
                </div>
                <Button variant="outline" size="sm" onClick={addAuthorizedCollector}>
                  Add Person
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                In addition to yourself, who is authorized to collect your child?
              </p>
              {consentData.authorizedCollectors.map((collector, index) => (
                <div key={index} className="grid grid-cols-3 gap-3">
                  <Input
                    placeholder="Full Name"
                    value={collector.name}
                    onChange={(e) =>
                      updateAuthorizedCollector(index, 'name', e.target.value)
                    }
                  />
                  <Input
                    placeholder="ID Number"
                    value={collector.idNumber}
                    onChange={(e) =>
                      updateAuthorizedCollector(index, 'idNumber', e.target.value)
                    }
                  />
                  <Input
                    placeholder="Relationship"
                    value={collector.relationship}
                    onChange={(e) =>
                      updateAuthorizedCollector(index, 'relationship', e.target.value)
                    }
                  />
                </div>
              ))}
            </div>

            {/* Download Full Consent Document */}
            {onboardingStatus?.documents.find((d) => d.documentType === 'CONSENT_FORMS') && (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium">Full Consent Document</p>
                    <p className="text-sm text-muted-foreground">
                      Download the complete consent forms for your records
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleDownloadDocument(
                      onboardingStatus.documents.find(
                        (d) => d.documentType === 'CONSENT_FORMS'
                      )?.id || ''
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            )}

            {/* Final Acknowledgement */}
            <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/50">
              <Checkbox
                id="consent-agree"
                checked={consentData.acknowledgedConsents}
                onCheckedChange={(checked) =>
                  setConsentData({
                    ...consentData,
                    acknowledgedConsents: checked as boolean,
                  })
                }
              />
              <div>
                <Label htmlFor="consent-agree" className="font-medium cursor-pointer">
                  I agree to all consent forms
                </Label>
                <p className="text-sm text-muted-foreground">
                  By checking this box, I confirm that I have read and agree to the POPIA
                  consent, medical consent, media consent selections, indemnity, and all
                  terms and conditions.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('fee_agreement')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => handleSignDocument('CONSENT_FORMS')}
                disabled={!consentData.acknowledgedConsents || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    Sign &amp; Complete
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'complete' && (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Onboarding Complete!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Thank you for completing your profile. You will receive a welcome pack via email
              with all the information you need to get started.
            </p>
            <div className="pt-4">
              <Button onClick={handleCompleteOnboarding} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Go to Dashboard'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Why This Is Needed */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Why is this needed?</strong> This information is required for legal
            compliance, emergency situations, and communication about your child&apos;s care.
            The fee agreement protects both you and the school with clear payment terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
