<task_spec id="TASK-WEB-049" version="2.0">

<metadata>
  <title>IRP5 Tax Documents Section Component</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>249</sequence>
  <implements>
    <requirement_ref>REQ-IRP5-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/components/staff/TaxDocumentsSection.tsx (NEW)

  **Current Problem:**
  The frontend has hooks for IRP5 certificates in use-simplepay.ts:
  - useIrp5Certificates(staffId) - Fetches IRP5 list
  - useDownloadIrp5Pdf() - Downloads IRP5 PDF

  BUT there is NO UI component displaying IRP5 tax documents!

  IRP5 certificates are South African tax certificates employees need for tax returns.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. TaxDocumentsSection Component
  ```typescript
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Download, FileCheck } from 'lucide-react';
  import { useIrp5Certificates, useDownloadIrp5Pdf } from '@/hooks/use-simplepay';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
  import { Badge } from '@/components/ui/badge';

  interface TaxDocumentsSectionProps {
    staffId: string;
  }

  export function TaxDocumentsSection({ staffId }: TaxDocumentsSectionProps) {
    const { data: certificates, isLoading } = useIrp5Certificates(staffId);
    const downloadMutation = useDownloadIrp5Pdf();

    const handleDownload = (certificateId: string, taxYear: number) => {
      downloadMutation.mutate({ staffId, certificateId, taxYear });
    };

    if (isLoading) {
      return <Card><CardContent className="p-6">Loading tax documents...</CardContent></Card>;
    }

    if (!certificates?.length) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck size={20} /> Tax Documents (IRP5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No IRP5 certificates available</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCheck size={20} /> Tax Documents (IRP5)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tax Year</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell className="font-medium">{cert.taxYear}</TableCell>
                  <TableCell>{cert.certificateType || 'IRP5'}</TableCell>
                  <TableCell>
                    <Badge variant={cert.status === 'final' ? 'default' : 'secondary'}>
                      {cert.status || 'Available'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(cert.id, cert.taxYear)} disabled={downloadMutation.isPending}>
                      <Download size={16} className="mr-1" /> Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Create TaxDocumentsSection component
    - List IRP5 certificates by tax year
    - Download PDF button with loading state
    - Status badge (draft/final)
    - Empty state handling
  </in_scope>
  <out_of_scope>
    - Modifying existing pages
    - IRP5 generation
    - Tax calculation
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - TaxDocumentsSection component created
    - Uses existing hooks
    - Download button works
    - Status badge displays correctly
  </verification>
</definition_of_done>

</task_spec>
