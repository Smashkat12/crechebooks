import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  Download,
  Check,
  Scale,
  User,
  BadgePercent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type {
  OnboardingStatus,
  ConsentFormData,
  FeeSummary,
} from '@/hooks/parent-portal/use-parent-onboarding';

function formatZAR(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function formatFeeType(feeType: string): string {
  return feeType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface FeeAgreementStepProps {
  onboardingStatus: OnboardingStatus | null;
  consentData: ConsentFormData;
  feeSummary: FeeSummary | null;
  isLoadingFeeSummary: boolean;
  onConsentChange: (data: ConsentFormData) => void;
  onDownload: (documentId: string) => void;
  onSign: (documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS') => void;
  onBack: () => void;
  isSaving: boolean;
  isGeneratingDocs: boolean;
}

export function FeeAgreementStep({
  onboardingStatus,
  consentData,
  feeSummary,
  isLoadingFeeSummary,
  onConsentChange,
  onDownload,
  onSign,
  onBack,
  isSaving,
  isGeneratingDocs,
}: FeeAgreementStepProps) {
  const feeDoc = onboardingStatus?.documents.find((d) => d.documentType === 'FEE_AGREEMENT');
  const isLoading = isLoadingFeeSummary || isGeneratingDocs;

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
        {isLoading && !feeSummary ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading fee details...</p>
          </div>
        ) : (
          <>
            {/* Fee Summary */}
            {feeSummary && (
              <div className="space-y-4">
                {feeSummary.schoolName && (
                  <p className="text-sm text-muted-foreground">
                    Fees for <span className="font-medium text-foreground">{feeSummary.schoolName}</span>
                  </p>
                )}

                {/* Per-child fee cards */}
                {feeSummary.children.map((child) => (
                  <div key={child.childName} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-medium">{child.childName}</span>
                      {child.siblingDiscountApplied && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          <BadgePercent className="h-3 w-3" />
                          Sibling discount
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Fee type</div>
                      <div>{child.feeStructureName} ({formatFeeType(child.feeType)})</div>
                      <div className="text-muted-foreground">Monthly fee</div>
                      <div className="font-semibold text-foreground">
                        {formatZAR(child.monthlyAmountCents)}
                        {child.vatInclusive && (
                          <span className="text-xs font-normal text-muted-foreground ml-1">(VAT incl.)</span>
                        )}
                      </div>
                      {child.registrationFeeCents > 0 && (
                        <>
                          <div className="text-muted-foreground">Registration fee</div>
                          <div>{formatZAR(child.registrationFeeCents)} (once-off, non-refundable)</div>
                        </>
                      )}
                      {child.siblingDiscountApplied && child.siblingDiscountPercent && (
                        <>
                          <div className="text-muted-foreground">Sibling discount</div>
                          <div className="text-green-600 dark:text-green-400">{child.siblingDiscountPercent}% off</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {feeSummary.children.length === 0 && (
                  <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                    No active enrolments found. Please contact the school if this is unexpected.
                  </div>
                )}

                {/* Payment Terms */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Payment Terms</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      Invoices are issued on the {ordinal(feeSummary.invoiceDayOfMonth)} of each month
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      Payment is due within {feeSummary.invoiceDueDays} days of the invoice date
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      One calendar month written notice required for withdrawal
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* PDF download (supplementary) */}
            {feeDoc && (
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-amber-600" />
                  <p className="text-sm">Full fee agreement document</p>
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
            )}

            {/* Acceptance checkbox */}
            <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/50">
              <Checkbox
                id="fee-agree"
                checked={consentData.acknowledgedFeeAgreement}
                disabled={isLoading && !feeSummary}
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

            {/* Navigation */}
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
