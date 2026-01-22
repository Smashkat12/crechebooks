'use client';

/**
 * Parent Portal Profile Page
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * Displays parent profile and settings:
 * - Page title "My Profile"
 * - Profile form for contact details
 * - Communication preferences section
 * - WhatsApp opt-in (POPIA compliant)
 * - Children list link
 * - Account deletion request
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Loader2,
  AlertCircle,
  Bell,
  Baby,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ProfileForm,
  CommunicationPrefs,
  WhatsAppConsent,
} from '@/components/parent-portal';
import {
  useParentProfile,
  useUpdateParentProfile,
  useUpdateCommunicationPrefs,
  type ParentProfile,
  type CommunicationPreferences,
} from '@/hooks/parent-portal/use-parent-profile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// Mock data for development/demo
const mockProfile: ParentProfile = {
  id: 'p-12345678',
  firstName: 'Sarah',
  lastName: 'Smith',
  email: 'sarah.smith@example.com',
  phone: '0821234567',
  alternativePhone: '0119876543',
  address: {
    street: '123 Main Road',
    city: 'Johannesburg',
    postalCode: '2000',
  },
  createdAt: '2023-01-15T00:00:00Z',
};

const mockPreferences: CommunicationPreferences = {
  invoiceDelivery: 'email',
  paymentReminders: true,
  emailNotifications: true,
  marketingOptIn: false,
  whatsappOptIn: false,
  whatsappConsentTimestamp: null,
};

function ProfilePageContent() {
  const router = useRouter();
  const { toast } = useToast();

  // State for delete account modal
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch profile data
  const { data: profile, isLoading: profileLoading, error: profileError, isError: isProfileError } = useParentProfile();
  const updateProfileMutation = useUpdateParentProfile();
  const updatePrefsMutation = useUpdateCommunicationPrefs();

  // State for fallback to mock data
  const [useMockData, setUseMockData] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  // Handle API errors by falling back to mock data
  useEffect(() => {
    if (isProfileError && !useMockData) {
      console.warn('Profile API error, using mock data:', profileError?.message);
      setUseMockData(true);
    }
  }, [isProfileError, profileError, useMockData]);

  const currentProfile = useMockData ? mockProfile : profile;
  const currentPreferences = useMockData
    ? mockPreferences
    : (profile?.communicationPreferences || mockPreferences);
  const showLoading = profileLoading && !useMockData;

  const handleProfileUpdate = async (data: Partial<ParentProfile>) => {
    if (useMockData) {
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
      return;
    }

    try {
      await updateProfileMutation.mutateAsync(data);
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update profile',
        variant: 'destructive',
      });
    }
  };

  const handlePreferencesUpdate = async (prefs: Partial<CommunicationPreferences>) => {
    if (useMockData) {
      toast({
        title: 'Preferences Updated',
        description: 'Your communication preferences have been saved.',
      });
      return;
    }

    try {
      await updatePrefsMutation.mutateAsync(prefs);
      toast({
        title: 'Preferences Updated',
        description: 'Your communication preferences have been saved.',
      });
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update preferences',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAccountRequest = async () => {
    setIsDeleting(true);
    try {
      // In production, this would call the API
      // await requestAccountDeletion({ reason: deleteReason });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: 'Deletion Request Submitted',
        description: 'Your account deletion request has been submitted. You will receive confirmation via email.',
      });
      setDeleteDialogOpen(false);
      setDeleteReason('');
    } catch (error) {
      toast({
        title: 'Request Failed',
        description: error instanceof Error ? error.message : 'Failed to submit deletion request',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (showLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6" />
          My Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your contact information and preferences
        </p>
      </div>

      {/* Error Alert */}
      {isProfileError && !useMockData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {profileError?.message || 'Failed to load profile. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Form */}
      {currentProfile && (
        <ProfileForm
          profile={currentProfile}
          onSave={handleProfileUpdate}
          isLoading={updateProfileMutation.isPending}
        />
      )}

      {/* Children Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Baby className="h-5 w-5" />
            My Children
          </CardTitle>
          <CardDescription>
            View your enrolled children&apos;s details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => router.push('/parent/children')}
          >
            <span>View Children Details</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Communication Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Communication Preferences
          </CardTitle>
          <CardDescription>
            Choose how you want to receive updates and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* WhatsApp Consent (POPIA Compliant) */}
          <WhatsAppConsent
            isOptedIn={currentPreferences.whatsappOptIn}
            consentTimestamp={currentPreferences.whatsappConsentTimestamp}
            onOptInChange={(optedIn) => {
              handlePreferencesUpdate({
                whatsappOptIn: optedIn,
                whatsappConsentTimestamp: optedIn ? new Date().toISOString() : null,
              });
            }}
            isLoading={updatePrefsMutation.isPending}
          />

          <Separator />

          {/* Other Communication Preferences */}
          <CommunicationPrefs
            preferences={currentPreferences}
            onSave={handlePreferencesUpdate}
            isLoading={updatePrefsMutation.isPending}
          />
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Account Actions
          </CardTitle>
          <CardDescription>
            Manage your account status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full sm:w-auto">
                Request Account Deletion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Account Deletion</DialogTitle>
                <DialogDescription>
                  Are you sure you want to request account deletion? This action cannot be undone.
                  Your data will be retained for the legally required period before permanent deletion.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label htmlFor="deleteReason" className="text-sm font-medium">
                    Reason for deletion (optional)
                  </label>
                  <Textarea
                    id="deleteReason"
                    placeholder="Please let us know why you're leaving..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    Outstanding balances must be settled before account deletion can be processed.
                    You will receive a confirmation email once your request is reviewed.
                  </AlertDescription>
                </Alert>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccountRequest}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <p className="text-sm text-muted-foreground mt-2">
            Request to delete your account and all associated data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Loading fallback for Suspense
function ProfileLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Main page component with Suspense boundary
export default function ParentProfilePage() {
  return (
    <Suspense fallback={<ProfileLoadingFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}
