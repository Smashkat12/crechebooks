import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  User,
  FileText,
  Download,
  Shield,
  ShieldAlert,
  Heart,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { OnboardingStatus, ConsentFormData } from '@/hooks/parent-portal/use-parent-onboarding';

interface ConsentsStepProps {
  onboardingStatus: OnboardingStatus | null;
  consentData: ConsentFormData;
  onConsentChange: (data: ConsentFormData) => void;
  onAddCollector: () => void;
  onUpdateCollector: (index: number, field: 'name' | 'idNumber' | 'relationship', value: string) => void;
  onDownload: (documentId: string) => void;
  onSign: (documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS') => void;
  onBack: () => void;
  isSaving: boolean;
}

export function ConsentsStep({
  onboardingStatus,
  consentData,
  onConsentChange,
  onAddCollector,
  onUpdateCollector,
  onDownload,
  onSign,
  onBack,
  isSaving,
}: ConsentsStepProps) {
  const consentDoc = onboardingStatus?.documents.find((d) => d.documentType === 'CONSENT_FORMS');

  return (
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
              onConsentChange({
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
            <Button variant="outline" size="sm" onClick={onAddCollector}>
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
                onChange={(e) => onUpdateCollector(index, 'name', e.target.value)}
              />
              <Input
                placeholder="ID Number"
                value={collector.idNumber}
                onChange={(e) => onUpdateCollector(index, 'idNumber', e.target.value)}
              />
              <Input
                placeholder="Relationship"
                value={collector.relationship}
                onChange={(e) => onUpdateCollector(index, 'relationship', e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* Indemnity and Liability Waiver */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h4 className="font-medium">Indemnity and Liability Waiver</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            By continuing, you indemnify and hold harmless the school, its staff, and
            representatives from claims arising from accidents during normal activities
            (unless due to negligence), loss of personal property, or illness contracted
            at the school. You acknowledge that children participate in age-appropriate
            activities including outdoor play, arts and crafts, and excursions.
          </p>
        </div>

        {/* Download Full Consent Document */}
        {consentDoc && (
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
              onClick={() => onDownload(consentDoc.id)}
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
              onConsentChange({
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
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => onSign('CONSENT_FORMS')}
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
  );
}
