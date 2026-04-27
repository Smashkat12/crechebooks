'use client';

/**
 * Parent Portal — Edit Child Info Page
 * Roadmap feature #9 (API: b82fc49)
 *
 * Allows parents to self-serve update the three whitelisted fields
 * on their child's record:
 *   - medicalNotes   (allergies, conditions, dietary)
 *   - emergencyContact (free text name)
 *   - emergencyPhone  (SA phone format)
 *
 * All changes are audit-logged server-side with via: 'parent-portal'.
 * Fields managed by the creche (name, DOB) are not exposed here.
 */

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Baby,
  Loader2,
  Phone,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useParentChild,
  useUpdateParentChild,
} from '@/hooks/parent-portal/use-parent-profile';

// ============================================================================
// SA Phone validation — mirrors DTO regex on the server
// ============================================================================

/**
 * Returns true for a valid SA phone number or an empty string (field is optional).
 * Accepts: +27XXXXXXXXX, 0XXXXXXXXX (9 digits after prefix)
 */
function isValidSAPhone(value: string): boolean {
  if (!value.trim()) return true;
  const cleaned = value.replace(/[\s\-\(\)]/g, '');
  return /^(\+27|0)[1-9][0-9]{8}$/.test(cleaned);
}

// ============================================================================
// Edit form inner component
// ============================================================================

function EditChildFormContent({ childId }: { childId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const {
    data: child,
    isLoading,
    isError,
    error,
  } = useParentChild(childId);

  const updateMutation = useUpdateParentChild(childId);

  // Controlled field state — initialised from query data once loaded
  const [medicalNotes, setMedicalNotes] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  // Populate form once child data arrives
  useEffect(() => {
    if (child && !hydrated) {
      setMedicalNotes(child.medicalNotes ?? '');
      setEmergencyContact(child.emergencyContact ?? '');
      setEmergencyPhone(child.emergencyPhone ?? '');
      setHydrated(true);
    }
  }, [child, hydrated]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (medicalNotes.length > 2000) {
      newErrors.medicalNotes = 'Must be 2000 characters or fewer';
    }

    if (emergencyContact.length > 200) {
      newErrors.emergencyContact = 'Must be 200 characters or fewer';
    }

    if (emergencyPhone.length > 20) {
      newErrors.emergencyPhone = 'Must be 20 characters or fewer';
    } else if (!isValidSAPhone(emergencyPhone)) {
      newErrors.emergencyPhone =
        'Enter a valid SA number: +27821234567 or 0821234567';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [medicalNotes, emergencyContact, emergencyPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await updateMutation.mutateAsync({
        medicalNotes: medicalNotes.trim() || undefined,
        emergencyContact: emergencyContact.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
      });

      toast({
        title: 'Saved',
        description: 'Child information updated successfully.',
      });

      router.push(`/parent/children/${childId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save changes';

      // 403: parent doesn't own this child
      if (message.includes('403') || message.toLowerCase().includes('forbidden')) {
        toast({
          title: 'Access denied',
          description: "You don't have access to update this child",
          variant: 'destructive',
        });
        router.push('/parent/children');
        return;
      }

      // Surface any 400 / validation messages from the API
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (isError || !child) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/parent/children')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Children
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error?.message || 'Failed to load child information. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const childFullName = `${child.firstName} ${child.lastName}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/parent/children/${childId}`)}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Baby className="h-6 w-6" />
          Edit child info
        </h1>
        <p className="text-muted-foreground mt-1">{childFullName}</p>
      </div>

      {/* Managed-by-creche notice */}
      <Alert>
        <AlertDescription>
          Some fields are managed by the creche office. To update your child&apos;s
          name or date of birth, please contact the office.
        </AlertDescription>
      </Alert>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Health &amp; Emergency Details
          </CardTitle>
          <CardDescription>
            Update medical information and emergency contacts for {child.firstName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Medical Notes / Allergies */}
            <div className="space-y-2">
              <Label htmlFor="medicalNotes">Medical notes / allergies</Label>
              <Textarea
                id="medicalNotes"
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                placeholder="Allergies, conditions, medications, dietary requirements"
                maxLength={2000}
                rows={4}
                className={errors.medicalNotes ? 'border-destructive' : ''}
              />
              <div className="flex items-center justify-between">
                {errors.medicalNotes ? (
                  <p className="text-sm text-destructive">{errors.medicalNotes}</p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground ml-auto">
                  {medicalNotes.length}/2000
                </p>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-2">
              <Label htmlFor="emergencyContact" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Emergency contact
              </Label>
              <Input
                id="emergencyContact"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. Grandmother Mary Smith"
                maxLength={200}
                className={errors.emergencyContact ? 'border-destructive' : ''}
              />
              {errors.emergencyContact && (
                <p className="text-sm text-destructive">{errors.emergencyContact}</p>
              )}
            </div>

            {/* Emergency Phone */}
            <div className="space-y-2">
              <Label htmlFor="emergencyPhone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Emergency phone
              </Label>
              <Input
                id="emergencyPhone"
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+27821234567 or 0821234567"
                maxLength={20}
                className={errors.emergencyPhone ? 'border-destructive' : ''}
              />
              {errors.emergencyPhone && (
                <p className="text-sm text-destructive">{errors.emergencyPhone}</p>
              )}
              <p className="text-xs text-muted-foreground">
                South African format: +27 82 123 4567 or 082 123 4567
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/parent/children/${childId}`)}
                disabled={updateMutation.isPending}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="w-full sm:w-auto min-w-32"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Audit footnote */}
          <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
            Changes are logged for the creche admin&apos;s records.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Loading fallback
// ============================================================================

function EditChildLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// ============================================================================
// Page export — params come from the [id] segment
// ============================================================================

export default function EditChildPage() {
  const params = useParams<{ id: string }>();
  const childId = params?.id ?? '';

  return (
    <Suspense fallback={<EditChildLoadingFallback />}>
      <EditChildFormContent childId={childId} />
    </Suspense>
  );
}
