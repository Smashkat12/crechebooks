'use client';

/**
 * Staff Self-Onboarding - Document Signatures
 * Allows staff to review and sign employment contract and POPIA consent
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PenTool,
  FileText,
  Download,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface GeneratedDocument {
  id: string;
  documentType: string;
  fileName: string;
  acknowledged: boolean;
  signedAt: string | null;
  signedByName: string | null;
}

export default function SignaturesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDocument | null>(null);
  const [signedName, setSignedName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const fetchDocuments = useCallback(async () => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/onboarding/generated-documents`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

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

    // Get staff name from storage
    const storedName = localStorage.getItem('staff_name');
    if (storedName) {
      setSignedName(storedName);
    }

    fetchDocuments();
  }, [router, fetchDocuments]);

  const handleSign = async () => {
    if (!selectedDoc || !signedName || !acknowledged) return;

    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    setSigning(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/onboarding/signatures/${selectedDoc.id}/sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ signedByName: signedName }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to sign document');
      }

      setSuccess(`${getDocumentTitle(selectedDoc.documentType)} signed successfully`);
      setSignDialogOpen(false);
      setSelectedDoc(null);
      setAcknowledged(false);
      fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = async (doc: GeneratedDocument) => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/onboarding/generated-documents/${doc.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const getDocumentTitle = (type: string): string => {
    switch (type) {
      case 'EMPLOYMENT_CONTRACT':
        return 'Employment Contract';
      case 'POPIA_CONSENT':
        return 'POPIA Consent Form';
      default:
        return type;
    }
  };

  const getDocumentDescription = (type: string): string => {
    switch (type) {
      case 'EMPLOYMENT_CONTRACT':
        return 'Your employment agreement outlining terms, conditions, and responsibilities';
      case 'POPIA_CONSENT':
        return 'Consent for the processing of your personal information under POPIA';
      default:
        return '';
    }
  };

  const allDocumentsSigned = documents.length > 0 && documents.every((d) => d.acknowledged);

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
          <h1 className="text-2xl font-bold">Document Signatures</h1>
          <p className="text-muted-foreground">
            Review and sign your employment documents
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

      {documents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Documents Available</h3>
            <p className="text-muted-foreground">
              Your employment documents are being prepared. Please check back later or contact HR.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className={cn(
                'transition-colors',
                doc.acknowledged && 'border-green-500/30 bg-green-500/5'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
                        doc.acknowledged ? 'bg-green-500/10' : 'bg-amber-500/10'
                      )}
                    >
                      {doc.acknowledged ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <PenTool className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{getDocumentTitle(doc.documentType)}</h3>
                        {!doc.acknowledged && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Signature Required
                          </Badge>
                        )}
                        {doc.acknowledged && (
                          <Badge
                            variant="outline"
                            className="text-xs text-green-600 border-green-300"
                          >
                            Signed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getDocumentDescription(doc.documentType)}
                      </p>
                      {doc.acknowledged && doc.signedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Signed by {doc.signedByName} on{' '}
                          {new Date(doc.signedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    {!doc.acknowledged && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setSignDialogOpen(true);
                        }}
                      >
                        <PenTool className="h-4 w-4 mr-1" />
                        Sign
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={() => router.push('/staff/onboarding')}>
          Back to Onboarding
        </Button>
        {allDocumentsSigned && (
          <Button onClick={() => router.push('/staff/onboarding')}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete
          </Button>
        )}
      </div>

      {/* Sign Dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign {selectedDoc && getDocumentTitle(selectedDoc.documentType)}</DialogTitle>
            <DialogDescription>
              Please review the document before signing. By signing, you acknowledge that you have
              read and understood the contents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="signedName">Full Legal Name</Label>
              <Input
                id="signedName"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
              />
              <label
                htmlFor="acknowledge"
                className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I confirm that I have read, understood, and agree to the terms and conditions
                outlined in this document.
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSignDialogOpen(false);
                setAcknowledged(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSign}
              disabled={!signedName || !acknowledged || signing}
            >
              {signing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <PenTool className="mr-2 h-4 w-4" />
                  Sign Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Legal Notice:</strong> Your electronic signature has the same legal effect as a
            handwritten signature. A record of your signature, including the date, time, and IP
            address, will be stored for audit purposes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
