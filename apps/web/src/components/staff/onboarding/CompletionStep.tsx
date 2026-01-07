'use client';

/**
 * Completion Step
 * TASK-STAFF-001: Staff Onboarding - Step 7 (Final)
 *
 * Final review and completion:
 * - Summary of all completed steps
 * - Welcome pack generation and download
 * - Confirmation and next steps
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  Download,
  Loader2,
  User,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  FileCheck,
  FileSignature,
  PartyPopper,
  Printer,
  Mail,
  Archive,
  AlertCircle,
} from 'lucide-react';
import {
  useOnboardingStatus,
  useGeneratedDocuments,
  useDownloadGeneratedDocument,
  useDownloadWelcomePackBundle,
  useEmailWelcomePack,
} from '@/hooks/use-staff-onboarding';
import { getDocumentTypeLabel } from '@/lib/api/staff-onboarding';

interface CompletionStepProps {
  staffId: string;
  staffName: string;
  onboardingId: string;
  onDownloadWelcomePack: () => void;
  isDownloading?: boolean;
}

const STEP_CONFIG = [
  { id: 'PERSONAL_INFO', label: 'Personal Information', icon: User },
  { id: 'EMPLOYMENT', label: 'Employment Details', icon: Briefcase },
  { id: 'TAX_INFO', label: 'Tax Information', icon: Building2 },
  { id: 'BANKING', label: 'Banking Details', icon: CreditCard },
  { id: 'GENERATED_DOCS', label: 'Employment Contracts', icon: FileSignature },
  { id: 'DOCUMENTS', label: 'Document Upload', icon: FileText },
  { id: 'CHECKLIST', label: 'Onboarding Checklist', icon: FileCheck },
];

export function CompletionStep({
  staffId,
  staffName,
  onboardingId,
  onDownloadWelcomePack,
  isDownloading,
}: CompletionStepProps) {
  const { toast } = useToast();
  const { data: status } = useOnboardingStatus(staffId);
  const { data: generatedDocsResponse } = useGeneratedDocuments(staffId);
  const downloadGeneratedDoc = useDownloadGeneratedDocument();
  const downloadBundle = useDownloadWelcomePackBundle();
  const emailWelcomePack = useEmailWelcomePack();

  const generatedDocs = generatedDocsResponse?.documents || [];

  const allStepsComplete = STEP_CONFIG.every((step) =>
    status?.completedSteps?.includes(step.id)
  );

  const handleDownloadBundle = async () => {
    try {
      await downloadBundle.mutateAsync({ onboardingId });
      toast({
        title: 'Download Started',
        description: 'Your onboarding documents ZIP is downloading.',
      });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: 'Failed to download the document bundle. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleEmailWelcomePack = async () => {
    try {
      const result = await emailWelcomePack.mutateAsync({ onboardingId });
      toast({
        title: 'Email Sent Successfully',
        description: `Welcome pack sent to ${result.data.sentTo} with ${result.data.attachmentsCount} attachments.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
      toast({
        title: 'Email Failed',
        description: errorMessage.includes('not configured')
          ? 'Email service is not configured. Please contact your administrator.'
          : errorMessage.includes('email address not found')
          ? 'Employee email address not found. Please update the staff profile.'
          : 'Failed to send the welcome pack email. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Congratulations Banner */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4">
          <PartyPopper className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Congratulations!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          The onboarding process for <strong>{staffName}</strong> is now complete.
          All required information has been collected and verified.
        </p>
      </div>

      {/* Completion Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Onboarding Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {STEP_CONFIG.map((step) => {
              const Icon = step.icon;
              const isComplete = status?.completedSteps?.includes(step.id);

              return (
                <div
                  key={step.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center
                        ${isComplete ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}
                      `}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={isComplete ? '' : 'text-muted-foreground'}>
                      {step.label}
                    </span>
                  </div>
                  {isComplete ? (
                    <Badge variant="success" className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Generated Documents Section */}
      {generatedDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Signed Employment Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The following employment documents have been generated and signed during onboarding:
            </p>
            <div className="space-y-3">
              {generatedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <FileSignature className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">{getDocumentTypeLabel(doc.documentType)}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.acknowledged ? (
                          <>Signed by {doc.signedByName} on {new Date(doc.signedAt!).toLocaleDateString('en-ZA')}</>
                        ) : (
                          <>Generated on {new Date(doc.generatedAt).toLocaleDateString('en-ZA')}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.acknowledged && (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Signed
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadGeneratedDoc.mutate({
                          documentId: doc.id,
                          fileName: doc.fileName,
                        })
                      }
                      disabled={downloadGeneratedDoc.isPending}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Welcome Pack Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Welcome Pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The welcome pack contains all the information the new employee needs to get started,
            including:
          </p>
          <ul className="text-sm space-y-2 ml-4">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Employment summary and key details
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Company policies and procedures
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              IT setup instructions
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Key contacts and resources
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              First week schedule
            </li>
          </ul>

          <Separator />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleDownloadBundle}
              disabled={downloadBundle.isPending || !allStepsComplete}
              className="flex-1"
            >
              {downloadBundle.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Download All (ZIP)
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleEmailWelcomePack}
              disabled={emailWelcomePack.isPending || !allStepsComplete}
            >
              {emailWelcomePack.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Email to Employee
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handlePrint}
              disabled={!allStepsComplete}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-medium">Schedule First Day Orientation</h4>
                <p className="text-sm text-muted-foreground">
                  Coordinate with the team to plan the employee&apos;s first day activities.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-medium">Set Up Workspace</h4>
                <p className="text-sm text-muted-foreground">
                  Ensure the employee&apos;s desk, equipment, and access cards are ready.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-medium">Notify Payroll</h4>
                <p className="text-sm text-muted-foreground">
                  Confirm that payroll has been updated with the new employee&apos;s details.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                4
              </div>
              <div>
                <h4 className="font-medium">Welcome Email</h4>
                <p className="text-sm text-muted-foreground">
                  Send a welcome email with first-day instructions and login credentials.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Badge */}
      <div className="flex justify-center pt-4">
        <Badge variant="success" className="text-base py-2 px-4">
          <CheckCircle className="mr-2 h-5 w-5" />
          Onboarding Complete
        </Badge>
      </div>
    </div>
  );
}
