'use client';

/**
 * Generated Documents Step
 * TASK-STAFF-001: Staff Onboarding - Auto-Generated Documents
 *
 * Displays auto-generated employment documents:
 * - Employment Contract (BCEA Section 29 compliant)
 * - POPIA Consent Form
 *
 * Features:
 * - Generate documents button
 * - Preview/download documents
 * - Sign/acknowledge documents via checkbox
 * - Progress tracking
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  FileText,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  PenTool,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  useGeneratedDocuments,
  useGenerateDocuments,
  useSignDocument,
  useDownloadGeneratedDocument,
  type GeneratedDocument,
  type GeneratedDocumentType,
} from '@/hooks/use-staff-onboarding';
import { getDocumentTypeLabel } from '@/lib/api/staff-onboarding';
import { SignatureDialog } from './SignatureDialog';

interface GeneratedDocumentsStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

export function GeneratedDocumentsStep({
  staffId,
  onComplete,
  isSubmitting,
  isEditing,
}: GeneratedDocumentsStepProps) {
  const [signingDocument, setSigningDocument] = useState<GeneratedDocument | null>(null);

  // Hooks
  const {
    data: documentsResponse,
    isLoading: isLoadingDocs,
    refetch: refetchDocs,
  } = useGeneratedDocuments(staffId);
  const generateMutation = useGenerateDocuments(staffId);
  const signMutation = useSignDocument(staffId);
  const downloadMutation = useDownloadGeneratedDocument();

  const documents = documentsResponse?.documents || [];
  const allDocumentsGenerated = documentsResponse?.allDocumentsGenerated || false;
  const allDocumentsSigned = documentsResponse?.allDocumentsSigned || false;
  const pendingSignatures = documentsResponse?.pendingSignatures || [];

  const handleGenerateDocuments = async () => {
    try {
      await generateMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to generate documents:', error);
    }
  };

  const handleDownload = async (doc: GeneratedDocument) => {
    try {
      await downloadMutation.mutateAsync({
        documentId: doc.id,
        fileName: doc.fileName,
      });
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const handleSignComplete = async (signedByName: string) => {
    if (!signingDocument) return;

    try {
      await signMutation.mutateAsync({
        documentId: signingDocument.id,
        signedByName,
      });
      setSigningDocument(null);
    } catch (error) {
      console.error('Failed to sign document:', error);
    }
  };

  const handleContinue = () => {
    onComplete({
      documentsGenerated: true,
      documentsSigned: allDocumentsSigned,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.documentType,
        signed: d.acknowledged,
      })),
    });
  };

  const getStatusBadge = (doc: GeneratedDocument) => {
    if (doc.acknowledged) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Signed
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Pending Signature
      </Badge>
    );
  };

  const getDocumentIcon = (type: GeneratedDocumentType) => {
    switch (type) {
      case 'EMPLOYMENT_CONTRACT':
        return <FileText className="h-8 w-8 text-blue-500" />;
      case 'POPIA_CONSENT':
        return <FileText className="h-8 w-8 text-purple-500" />;
      case 'WELCOME_PACK':
        return <FileText className="h-8 w-8 text-green-500" />;
      default:
        return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  if (isLoadingDocs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          The following employment documents have been automatically generated based on the
          information you provided. Please review and acknowledge each document to continue.
        </AlertDescription>
      </Alert>

      {/* No Documents - Generate Button */}
      {documents.length === 0 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Generate Employment Documents</CardTitle>
            <CardDescription>
              Click the button below to generate your employment contract and POPIA consent form
              based on the information you&apos;ve provided.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              onClick={handleGenerateDocuments}
              disabled={generateMutation.isPending}
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Documents...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Documents
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {documents.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Employment Documents</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchDocs()}
              disabled={isLoadingDocs}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Document Icon */}
                    <div className="flex-shrink-0">{getDocumentIcon(doc.documentType)}</div>

                    {/* Document Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">
                          {getDocumentTypeLabel(doc.documentType)}
                        </h4>
                        {getStatusBadge(doc)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Generated on{' '}
                        {new Date(doc.generatedAt).toLocaleDateString('en-ZA', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      {doc.signedAt && (
                        <p className="text-sm text-muted-foreground">
                          Signed by {doc.signedByName} on{' '}
                          {new Date(doc.signedAt).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {doc.fileName} ({(doc.fileSize / 1024).toFixed(1)} KB)
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      {!doc.acknowledged && (
                        <Button
                          size="sm"
                          onClick={() => setSigningDocument(doc)}
                          disabled={signMutation.isPending}
                        >
                          <PenTool className="h-4 w-4 mr-2" />
                          Sign
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Progress Summary */}
          {documents.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {allDocumentsSigned ? (
                    <>
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium text-green-700">
                          All documents signed!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          You can proceed to the next step.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-8 w-8 text-amber-500" />
                      <div>
                        <p className="font-medium text-amber-700">
                          {pendingSignatures.length} document
                          {pendingSignatures.length > 1 ? 's' : ''} pending signature
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Please review and sign all documents before continuing.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleContinue}
          disabled={isSubmitting || !allDocumentsSigned}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Update & Return' : 'Continue'}
        </Button>
      </div>

      {/* Signature Dialog */}
      <SignatureDialog
        open={!!signingDocument}
        onOpenChange={(open) => !open && setSigningDocument(null)}
        documentType={signingDocument?.documentType}
        onSign={handleSignComplete}
        isLoading={signMutation.isPending}
      />
    </div>
  );
}
