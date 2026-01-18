<task_spec id="TASK-WEB-048" version="2.0">

<metadata>
  <title>Staff Payslips Section Component</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>248</sequence>
  <implements>
    <requirement_ref>REQ-PAYSLIP-UI-001</requirement_ref>
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
  - apps/web/src/components/staff/PayslipsSection.tsx (NEW)

  **Current Problem:**
  The frontend has hooks for payslips in use-simplepay.ts:
  - useImportedPayslips(staffId) - Fetches payslip list
  - useDownloadPayslipPdf() - Downloads payslip PDF

  BUT there is NO UI component displaying payslips on the staff detail page!
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. PayslipsSection Component
  ```typescript
  'use client';

  import { useState } from 'react';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Download, FileText, ChevronDown, ChevronUp } from 'lucide-react';
  import { useImportedPayslips, useDownloadPayslipPdf } from '@/hooks/use-simplepay';
  import { format } from 'date-fns';
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from '@/components/ui/table';

  interface PayslipsSectionProps {
    staffId: string;
  }

  export function PayslipsSection({ staffId }: PayslipsSectionProps) {
    const [expanded, setExpanded] = useState(false);
    const { data: payslips, isLoading } = useImportedPayslips(staffId);
    const downloadMutation = useDownloadPayslipPdf();

    const handleDownload = (payslipId: string) => {
      downloadMutation.mutate({ staffId, payslipId });
    };

    if (isLoading) {
      return <Card><CardContent className="p-6">Loading payslips...</CardContent></Card>;
    }

    if (!payslips?.length) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText size={20} /> Payslips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No payslips available</p>
          </CardContent>
        </Card>
      );
    }

    const displayedPayslips = expanded ? payslips : payslips.slice(0, 3);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText size={20} /> Payslips ({payslips.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedPayslips.map((payslip) => (
                <TableRow key={payslip.id}>
                  <TableCell>{payslip.period}</TableCell>
                  <TableCell>{format(new Date(payslip.payDate), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(payslip.id)} disabled={downloadMutation.isPending}>
                      <Download size={16} className="mr-1" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {payslips.length > 3 && (
            <Button variant="ghost" className="w-full mt-2" onClick={() => setExpanded(!expanded)}>
              {expanded ? <><ChevronUp size={16} className="mr-1" /> Show Less</> : <><ChevronDown size={16} className="mr-1" /> Show All ({payslips.length - 3} more)</>}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Create PayslipsSection component
    - List payslips with period and date
    - Download PDF button with loading state
    - Expand/collapse for long lists
    - Empty state handling
  </in_scope>
  <out_of_scope>
    - Modifying existing pages
    - Payslip import functionality
    - Payslip preview modal
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - PayslipsSection component created
    - Uses existing hooks
    - Download button works
    - Empty state displays correctly
  </verification>
</definition_of_done>

</task_spec>
