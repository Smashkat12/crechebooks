'use client';

/**
 * Documents Step
 * TASK-STAFF-001: Staff Onboarding - Step 5
 *
 * Handles document upload and verification:
 * - ID document
 * - Proof of address
 * - Bank confirmation letter
 * - Tax clearance certificate
 * - Qualifications/certifications
 * - Police clearance
 */

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Upload,
  FileText,
  Check,
  X,
  Clock,
  Trash2,
  Download,
} from 'lucide-react';
import {
  useStaffDocuments,
  useUploadDocument,
  useGeneratedDocuments,
  useDownloadGeneratedDocument,
  type StaffDocument,
} from '@/hooks/use-staff-onboarding';
import { getDocumentTypeLabel } from '@/lib/api/staff-onboarding';

interface DocumentsStepProps {
  staffId: string;
  onComplete: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  isEditing?: boolean;
}

// Note: EMPLOYMENT_CONTRACT is auto-generated but can also be uploaded with physical signature
const REQUIRED_DOCUMENTS = [
  { type: 'ID_DOCUMENT', label: 'ID Document / Passport', required: true },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of Address', required: true },
  { type: 'BANK_CONFIRMATION', label: 'Bank Confirmation Letter', required: true },
  { type: 'TAX_CLEARANCE', label: 'Tax Clearance Certificate', required: false },
  { type: 'QUALIFICATIONS', label: 'Qualifications/Certifications', required: false },
  { type: 'POLICE_CLEARANCE', label: 'Police Clearance Certificate', required: true },
  { type: 'SIGNED_CONTRACT', label: 'Physically Signed Employment Contract', required: false },
  { type: 'SIGNED_POPIA', label: 'Physically Signed POPIA Consent', required: false },
  { type: 'OTHER', label: 'Other Documents', required: false },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function DocumentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'VERIFIED':
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <Check className="w-3 h-3" />
          Verified
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <X className="w-3 h-3" />
          Rejected
        </Badge>
      );
    case 'PENDING':
    default:
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Pending
        </Badge>
      );
  }
}

export function DocumentsStep({ staffId, onComplete, isSubmitting, isEditing }: DocumentsStepProps) {
  const { data: documents, isLoading } = useStaffDocuments(staffId);
  const { mutate: uploadDocument, isPending: isUploading } = useUploadDocument(staffId);
  const { data: generatedDocsResponse } = useGeneratedDocuments(staffId);
  const downloadGeneratedDoc = useDownloadGeneratedDocument();
  const [selectedDocType, setSelectedDocType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generatedDocs = generatedDocsResponse?.documents || [];

  const handleFileSelect = (docType: string) => {
    setSelectedDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocType) return;

    uploadDocument(
      { file, documentType: selectedDocType },
      {
        onSuccess: () => {
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          setSelectedDocType('');
        },
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Check if all required documents are uploaded
    const uploadedTypes = documents?.map((d) => d.documentType) || [];
    const missingRequired = REQUIRED_DOCUMENTS.filter(
      (doc) => doc.required && !uploadedTypes.includes(doc.type)
    );

    if (missingRequired.length > 0) {
      // Allow skipping in development/testing mode with confirmation
      const skipConfirmed = window.confirm(
        `The following required documents are missing:\n${missingRequired.map((d) => `• ${d.label}`).join('\n')}\n\nDo you want to continue anyway? (Development mode only)`
      );
      if (!skipConfirmed) {
        return;
      }
    }

    await onComplete({ documentsUploaded: uploadedTypes });
  };

  const getDocumentForType = (type: string): StaffDocument | undefined => {
    return documents?.find((d) => d.documentType === type);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
      />

      {/* Auto-Generated Documents Section */}
      {generatedDocs.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Auto-Generated Documents
          </h4>
          <p className="text-sm text-muted-foreground">
            These documents were automatically generated. You can download them to print for physical
            signature if needed, then upload the signed copies below.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Document Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {generatedDocs.map((doc) => (
                <TableRow key={doc.id} className="bg-green-50/50">
                  <TableCell className="font-medium">
                    {getDocumentTypeLabel(doc.documentType)}
                    <Badge variant="outline" className="ml-2 text-xs">
                      Auto-generated
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {doc.acknowledged ? (
                      <Badge variant="success" className="flex items-center gap-1 w-fit">
                        <Check className="w-3 h-3" />
                        Signed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" />
                        Pending Signature
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{doc.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatFileSize(doc.fileSize)})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        downloadGeneratedDoc.mutate({
                          documentId: doc.id,
                          fileName: doc.fileName,
                        })
                      }
                      disabled={downloadGeneratedDoc.isPending}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Document List */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Additional Required Documents
        </h4>
        <p className="text-sm text-muted-foreground">
          Upload all required documents. Accepted formats: PDF, JPG, PNG, DOC, DOCX (max 10MB)
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Document Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REQUIRED_DOCUMENTS.map((docType) => {
              const uploadedDoc = getDocumentForType(docType.type);
              return (
                <TableRow key={docType.type}>
                  <TableCell className="font-medium">
                    {docType.label}
                    {docType.required && <span className="text-destructive ml-1">*</span>}
                  </TableCell>
                  <TableCell>
                    {uploadedDoc ? (
                      <DocumentStatusBadge status={uploadedDoc.status} />
                    ) : (
                      <Badge variant="outline">Not Uploaded</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {uploadedDoc ? (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{uploadedDoc.fileName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({formatFileSize(uploadedDoc.fileSize)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No file uploaded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleFileSelect(docType.type)}
                        disabled={isUploading && selectedDocType === docType.type}
                      >
                        {isUploading && selectedDocType === docType.type ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        <span className="ml-1">{uploadedDoc ? 'Replace' : 'Upload'}</span>
                      </Button>
                      {uploadedDoc && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // TODO: Implement download
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Upload Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Upload Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Required:</span>
            <span className="ml-2 font-medium">
              {REQUIRED_DOCUMENTS.filter((d) => d.required).length}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Uploaded:</span>
            <span className="ml-2 font-medium">{documents?.length || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Verified:</span>
            <span className="ml-2 font-medium text-green-600">
              {documents?.filter((d) => d.status === 'VERIFIED').length || 0}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Pending:</span>
            <span className="ml-2 font-medium text-yellow-600">
              {documents?.filter((d) => d.status === 'PENDING').length || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting || isLoading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Update & Return' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
