'use client';

/**
 * Parent Portal — Edit Child Info Page
 * Roadmap feature #9 (API: b82fc49, extended in a80459d)
 *
 * Allows parents to self-serve update the following fields on their child's record:
 *   Identity (a80459d):
 *     - firstName    (max 100, normalizeName + sanitize server-side)
 *     - lastName     (max 100, normalizeName + sanitize server-side)
 *     - gender       (MALE | FEMALE | OTHER)
 *   Medical & Emergency (b82fc49):
 *     - medicalNotes   (allergies, conditions, dietary)
 *     - emergencyContact (free text name)
 *     - emergencyPhone  (SA phone format)
 *
 * All changes are audit-logged server-side with via: 'parent-portal'.
 * Identity changes also trigger an admin in-app notification.
 * Date of birth is admin-only and is NOT exposed here.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useParentChild,
  useUpdateParentChild,
  type Gender,
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

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
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
      setFirstName(child.firstName ?? '');
      setLastName(child.lastName ?? '');
      setGender(child.gender ?? '');
      setMedicalNotes(child.medicalNotes ?? '');
      setEmergencyContact(child.emergencyContact ?? '');
      setEmergencyPhone(child.emergencyPhone ?? '');
      setHydrated(true);
    }
  }, [child, hydrated]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    } else if (firstName.length > 100) {
      newErrors.firstName = 'Must be 100 characters or fewer';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    } else if (lastName.length > 100) {
      newErrors.lastName = 'Must be 100 characters or fewer';
    }

    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      newErrors.gender = 'Please select a valid gender';
    }

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
  }, [firstName, lastName, gender, medicalNotes, emergencyContact, emergencyPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await updateMutation.mutateAsync({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        gender: gender || undefined,
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

      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Identity section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Identity
            </CardTitle>
            <CardDescription>
              Name changes are logged for the creche admin&apos;s records. Date of
              birth can only be changed by the creche office.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Amara"
                maxLength={100}
                autoComplete="given-name"
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName}</p>
              )}
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Nkosi"
                maxLength={100}
                autoComplete="family-name"
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName}</p>
              )}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={gender}
                onValueChange={(val) => setGender(val as Gender)}
              >
                <SelectTrigger
                  id="gender"
                  className={errors.gender ? 'border-destructive' : ''}
                >
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.gender && (
                <p className="text-sm text-destructive">{errors.gender}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Medical & Emergency section */}
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
          <CardContent className="space-y-5">
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
          </CardContent>
        </Card>

        {/* Audit footnote */}
        <p className="text-xs text-muted-foreground pt-1">
          All changes are logged for the creche admin&apos;s records.
        </p>
      </form>
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
