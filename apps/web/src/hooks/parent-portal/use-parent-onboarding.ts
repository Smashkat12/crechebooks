/**
 * Parent Onboarding Hook
 * Extracted from parent/onboarding/page.tsx
 *
 * Encapsulates all state management and API calls for the
 * onboarding wizard: contact info, fee agreement, consents, completion.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Scale,
  Shield,
  CheckCircle2,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export interface OnboardingAction {
  id: string;
  title: string;
  description: string;
  category: string;
  isRequired: boolean;
  isComplete: boolean;
}

export interface GeneratedDocument {
  id: string;
  documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS' | 'WELCOME_PACK';
  fileName: string;
  generatedAt: string;
  signedAt: string | null;
  acknowledged: boolean;
}

export interface OnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  completedCount: number;
  totalRequired: number;
  requiredActions: OnboardingAction[];
  documents: GeneratedDocument[];
}

export interface ProfileFormData {
  phone: string;
  whatsapp: string;
  address: {
    street: string;
    city: string;
    postalCode: string;
  };
}

export interface ConsentFormData {
  mediaConsent: 'internal_only' | 'website' | 'social_media' | 'all' | 'none';
  authorizedCollectors: Array<{
    name: string;
    idNumber: string;
    relationship: string;
  }>;
  acknowledgedFeeAgreement: boolean;
  acknowledgedConsents: boolean;
}

export type Step = 'contact' | 'fee_agreement' | 'consents' | 'complete';

export interface StepConfig {
  id: Step;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ============================================================================
// Constants
// ============================================================================

export const steps: StepConfig[] = [
  { id: 'contact', title: 'Contact Info', icon: Phone },
  { id: 'fee_agreement', title: 'Fee Agreement', icon: Scale },
  { id: 'consents', title: 'Consents', icon: Shield },
  { id: 'complete', title: 'Complete', icon: CheckCircle2 },
];

// ============================================================================
// Helper
// ============================================================================

function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

// ============================================================================
// Hook
// ============================================================================

export function useOnboarding() {
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
    address: { street: '', city: '', postalCode: '' },
  });

  const [consentData, setConsentData] = useState<ConsentFormData>({
    mediaConsent: 'internal_only',
    authorizedCollectors: [{ name: '', idNumber: '', relationship: '' }],
    acknowledgedFeeAgreement: false,
    acknowledgedConsents: false,
  });

  // ---------- Data fetching ----------

  const fetchOnboardingStatus = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/parent-portal/onboarding`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setOnboardingStatus(data);

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
  }, []);

  const fetchProfile = useCallback(async (token: string) => {
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
  }, []);

  useEffect(() => {
    const token = getParentToken();
    if (!token) {
      router.push('/parent/login');
      return;
    }
    fetchOnboardingStatus(token);
    fetchProfile(token);
  }, [router, fetchOnboardingStatus, fetchProfile]);

  // ---------- Handlers ----------

  const handleSaveContact = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const token = getParentToken();
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
      setTimeout(() => setCurrentStep('fee_agreement'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  }, [profileData, router, fetchOnboardingStatus]);

  const handleGenerateDocuments = useCallback(async () => {
    setIsGeneratingDocs(true);
    setError(null);

    const token = getParentToken();
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/v1/parent-portal/onboarding/documents/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchOnboardingStatus(token);
    } catch {
      setError('Failed to generate documents');
    } finally {
      setIsGeneratingDocs(false);
    }
  }, [fetchOnboardingStatus]);

  const handleDownloadDocument = useCallback(async (documentId: string) => {
    const token = getParentToken();
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
    } catch {
      setError('Failed to download document');
    }
  }, []);

  const handleSignDocument = useCallback(async (documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS') => {
    setIsSaving(true);
    setError(null);

    const token = getParentToken();
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
    } catch {
      setError('Failed to sign document');
    } finally {
      setIsSaving(false);
    }
  }, [parentName, consentData, fetchOnboardingStatus]);

  const handleCompleteOnboarding = useCallback(async () => {
    setIsSaving(true);
    const token = getParentToken();
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/v1/parent-portal/onboarding/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      router.push('/parent/dashboard');
    } catch {
      setError('Failed to complete onboarding');
    } finally {
      setIsSaving(false);
    }
  }, [router]);

  const addAuthorizedCollector = useCallback(() => {
    setConsentData((prev) => ({
      ...prev,
      authorizedCollectors: [
        ...prev.authorizedCollectors,
        { name: '', idNumber: '', relationship: '' },
      ],
    }));
  }, []);

  const updateAuthorizedCollector = useCallback(
    (index: number, field: 'name' | 'idNumber' | 'relationship', value: string) => {
      setConsentData((prev) => ({
        ...prev,
        authorizedCollectors: prev.authorizedCollectors.map((c, i) =>
          i === index ? { ...c, [field]: value } : c
        ),
      }));
    },
    []
  );

  return {
    // State
    isLoading,
    isSaving,
    isGeneratingDocs,
    error,
    success,
    onboardingStatus,
    currentStep,
    parentName,
    profileData,
    consentData,
    // Setters
    setCurrentStep,
    setProfileData,
    setConsentData,
    // Handlers
    handleSaveContact,
    handleGenerateDocuments,
    handleDownloadDocument,
    handleSignDocument,
    handleCompleteOnboarding,
    addAuthorizedCollector,
    updateAuthorizedCollector,
  };
}
