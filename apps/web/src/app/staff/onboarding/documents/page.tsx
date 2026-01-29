'use client';

/**
 * Staff Self-Onboarding - Document Uploads
 * Allows staff to upload required documents (ID, proof of address, etc.)
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileText,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UploadedDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  status: string;
  uploadedAt: string;
}

const requiredDocuments = [
  {
    type: 'ID_DOCUMENT',
    title: 'ID Document',
    description: 'South African ID card, passport, or driving license',
    required: true,
  },
  {
    type: 'PROOF_OF_ADDRESS',
    title: 'Proof of Address',
    description: 'Utility bill or bank statement (not older than 3 months)',
    required: true,
  },
  {
    type: 'QUALIFICATIONS',
    title: 'Qualifications',
    description: 'Copies of relevant certificates or diplomas',
    required: false,
  },
  {
    type: 'POLICE_CLEARANCE',
    title: 'Police Clearance',
    description: 'Valid police clearance certificate (required for childcare)',
    required: true,
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsUploadPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  const fetchDocuments = useCallback(async () => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/onboarding/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.warn('Failed to fetch documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchDocuments();
  }, [router, fetchDocuments]);

  const handleFileUpload = async (documentType: string, file: File) => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    setUploading(documentType);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const response = await fetch(`${API_URL}/api/staff-portal/onboarding/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to upload document');
      }

      setSuccess('Document uploaded successfully');
      fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(null);
    }
  };

  const getDocumentForType = (type: string): UploadedDocument | undefined => {
    return documents.find((d) => d.documentType === type);
  };

  const allRequiredUploaded = requiredDocuments
    .filter((d) => d.required)
    .every((d) => getDocumentForType(d.type));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/staff/onboarding">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Document Uploads</h1>
          <p className="text-muted-foreground">
            Upload required documents for your employee file
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {requiredDocuments.map((docType) => {
          const uploaded = getDocumentForType(docType.type);
          const isUploading = uploading === docType.type;

          return (
            <Card
              key={docType.type}
              className={cn(
                'transition-colors',
                uploaded && 'border-green-500/30 bg-green-500/5'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
                        uploaded ? 'bg-green-500/10' : 'bg-muted'
                      )}
                    >
                      {uploaded ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{docType.title}</h3>
                        {docType.required && !uploaded && (
                          <Badge variant="outline" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{docType.description}</p>
                      {uploaded && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium">{uploaded.fileName}</span>
                          <span className="mx-2">•</span>
                          <span>{formatFileSize(uploaded.fileSize)}</span>
                          <span className="mx-2">•</span>
                          <Badge
                            variant={
                              uploaded.status === 'VERIFIED'
                                ? 'default'
                                : uploaded.status === 'PENDING'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {uploaded.status}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {uploaded ? (
                      <>
                        <Button variant="outline" size="sm" disabled>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </>
                    ) : (
                      <label>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(docType.type, file);
                            }
                          }}
                          disabled={isUploading}
                        />
                        <Button variant="outline" size="sm" asChild disabled={isUploading}>
                          <span className="cursor-pointer">
                            {isUploading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-1" />
                                Upload
                              </>
                            )}
                          </span>
                        </Button>
                      </label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={() => router.push('/staff/onboarding')}>
          Back to Onboarding
        </Button>
        {allRequiredUploaded && (
          <Button onClick={() => router.push('/staff/onboarding')}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Continue
          </Button>
        )}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Accepted formats:</strong> PDF, JPG, PNG (max 10MB per file).
            Your documents will be reviewed by HR and you&apos;ll be notified once they&apos;re verified.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
