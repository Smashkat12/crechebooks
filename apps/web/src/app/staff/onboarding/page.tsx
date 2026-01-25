'use client';

/**
 * Staff Self-Onboarding Page
 * Allows staff to complete their own onboarding by filling in:
 * - Personal details (contact info, emergency contact)
 * - Tax information
 * - Banking details
 * - Document uploads
 * - Sign employment contract and POPIA consent
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  User,
  Building,
  FileText,
  Upload,
  PenTool,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  currentStep: string;
  percentComplete: number;
  completedSteps: string[];
  pendingSteps: string[];
  requiredActions: {
    id: string;
    title: string;
    description: string;
    category: string;
    isRequired: boolean;
    isComplete: boolean;
  }[];
}

// Default onboarding status when no onboarding exists
function getDefaultOnboardingStatus(): OnboardingStatus {
  return {
    status: 'NOT_STARTED',
    currentStep: 'PERSONAL_INFO',
    percentComplete: 0,
    completedSteps: [],
    pendingSteps: ['PERSONAL_INFO', 'TAX_INFO', 'BANKING', 'DOCUMENTS', 'SIGNATURES'],
    requiredActions: [
      {
        id: 'personal_info',
        title: 'Personal Information',
        description: 'Verify your personal details and emergency contact',
        category: 'personal',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'tax_info',
        title: 'Tax Information',
        description: 'Provide your tax number and tax status',
        category: 'tax',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'banking_details',
        title: 'Banking Details',
        description: 'Enter your bank account for salary payments',
        category: 'banking',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'id_document',
        title: 'Upload ID Document',
        description: 'Upload a copy of your ID or passport',
        category: 'documents',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'proof_of_address',
        title: 'Upload Proof of Address',
        description: 'Utility bill or bank statement (not older than 3 months)',
        category: 'documents',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'employment_contract',
        title: 'Sign Employment Contract',
        description: 'Review and sign your employment contract',
        category: 'signatures',
        isRequired: true,
        isComplete: false,
      },
      {
        id: 'popia_consent',
        title: 'Sign POPIA Consent',
        description: 'Consent to processing of personal information',
        category: 'signatures',
        isRequired: true,
        isComplete: false,
      },
    ],
  };
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  personal: User,
  tax: FileText,
  banking: Building,
  documents: Upload,
  signatures: PenTool,
};

const categoryLabels: Record<string, string> = {
  personal: 'Personal Information',
  tax: 'Tax Information',
  banking: 'Banking Details',
  documents: 'Document Uploads',
  signatures: 'Signatures',
};

interface ActionItemProps {
  action: OnboardingStatus['requiredActions'][0];
  onStart: () => void;
}

function ActionItem({ action, onStart }: ActionItemProps) {
  const Icon = categoryIcons[action.category] || Circle;

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border rounded-lg transition-colors',
        action.isComplete
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-border hover:border-primary/30'
      )}
    >
      <div className="flex items-center gap-3">
        {action.isComplete ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('font-medium', action.isComplete && 'text-muted-foreground')}>
              {action.title}
            </span>
            {action.isRequired && !action.isComplete && (
              <Badge variant="outline" className="text-xs">
                Required
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{action.description}</p>
        </div>
      </div>
      {!action.isComplete && (
        <Button variant="ghost" size="sm" onClick={onStart}>
          Start
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function StaffOnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');

    if (!token) {
      router.push('/staff/login');
      return;
    }

    fetchOnboardingStatus(token);
  }, [router]);

  const fetchOnboardingStatus = async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/onboarding`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('staff_session_token');
          router.push('/staff/login');
          return;
        }
        throw new Error('Failed to fetch onboarding status');
      }

      const data = await response.json();

      // Merge API data with default required actions for display
      const defaultStatus = getDefaultOnboardingStatus();
      const mergedActions = defaultStatus.requiredActions.map(defaultAction => {
        const apiAction = data.requiredActions?.find(
          (a: OnboardingStatus['requiredActions'][0]) => a.id === defaultAction.id || a.id === defaultAction.id.replace('_', '-')
        );
        return apiAction || defaultAction;
      });

      setOnboardingStatus({
        ...data,
        requiredActions: mergedActions.length > 0 ? mergedActions : defaultStatus.requiredActions,
      });
    } catch (err) {
      console.warn('Onboarding API error, using defaults:', err);
      setOnboardingStatus(getDefaultOnboardingStatus());
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartAction = (actionId: string) => {
    // Navigate to the appropriate form based on action
    switch (actionId) {
      case 'personal_info':
        router.push('/staff/profile');
        break;
      case 'tax_info':
        router.push('/staff/onboarding/tax');
        break;
      case 'banking_details':
        router.push('/staff/onboarding/banking');
        break;
      case 'id_document':
      case 'proof_of_address':
        router.push('/staff/onboarding/documents');
        break;
      case 'employment_contract':
      case 'popia_consent':
        router.push('/staff/onboarding/signatures');
        break;
      default:
        break;
    }
  };

  // Group actions by category
  const groupedActions = onboardingStatus?.requiredActions.reduce(
    (acc, action) => {
      if (!acc[action.category]) {
        acc[action.category] = [];
      }
      acc[action.category].push(action);
      return acc;
    },
    {} as Record<string, OnboardingStatus['requiredActions']>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (onboardingStatus?.status === 'COMPLETED') {
    return (
      <div className="space-y-6">
        <Link href="/staff/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold">Onboarding Complete!</h2>
            <p className="text-muted-foreground">
              You have completed all onboarding requirements. Welcome to the team!
            </p>
            <Button asChild>
              <Link href="/staff/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/staff/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Complete Your Onboarding</h1>
          <p className="text-muted-foreground">
            Please complete the following steps to finish setting up your profile
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Progress Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your Progress</CardTitle>
          <CardDescription>
            Complete all required items to finish onboarding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {onboardingStatus?.requiredActions.filter((a) => a.isComplete).length} of{' '}
              {onboardingStatus?.requiredActions.length} complete
            </span>
            <span className="font-medium">{onboardingStatus?.percentComplete}%</span>
          </div>
          <Progress value={onboardingStatus?.percentComplete || 0} className="h-2" />
        </CardContent>
      </Card>

      {/* Action Items by Category */}
      {groupedActions &&
        Object.entries(groupedActions).map(([category, actions]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {categoryLabels[category] || category}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actions.map((action) => (
                <ActionItem
                  key={action.id}
                  action={action}
                  onStart={() => handleStartAction(action.id)}
                />
              ))}
            </CardContent>
          </Card>
        ))}

      {/* Help Section */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Need help completing your onboarding?{' '}
            <Link href="/staff/help" className="text-primary hover:underline">
              Contact HR support
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
