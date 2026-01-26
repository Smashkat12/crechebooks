import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  Download,
  Check,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { OnboardingStatus, ConsentFormData } from '@/hooks/parent-portal/use-parent-onboarding';

interface FeeAgreementStepProps {
  onboardingStatus: OnboardingStatus | null;
  consentData: ConsentFormData;
  onConsentChange: (data: ConsentFormData) => void;
  onGenerate: () => void;
  onDownload: (documentId: string) => void;
  onSign: (documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS') => void;
  onBack: () => void;
  isSaving: boolean;
  isGeneratingDocs: boolean;
}

export function FeeAgreementStep({
  onboardingStatus,
  consentData,
  onConsentChange,
  onGenerate,
  onDownload,
  onSign,
  onBack,
  isSaving,
  isGeneratingDocs,
}: FeeAgreementStepProps) {
  const feeDoc = onboardingStatus?.documents.find((d) => d.documentType === 'FEE_AGREEMENT');

  return (
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
        {!feeDoc ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Generate your fee agreement to review
            </p>
            <Button onClick={onGenerate} disabled={isGeneratingDocs}>
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
                  onClick={() => onDownload(feeDoc.id)}
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
                  onConsentChange({
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
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => onSign('FEE_AGREEMENT')}
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
  );
}
