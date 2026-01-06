<task_spec id="TASK-BILL-023" version="1.0">

<metadata>
  <title>Enrollment Invoice UI Integration</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>surface</layer>
  <sequence>142</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-021</task_ref>
    <task_ref>TASK-WEB-037</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Purpose
After TASK-BILL-021 implements auto-invoice on enrollment, this task adds UI elements to:
1. Display the generated enrollment invoice after creating an enrollment
2. Show invoice details in a modal or redirect
3. Add option to send invoice immediately

## Current State
- Enrollment form exists at `apps/web/src/app/(dashboard)/parents/[id]/page.tsx`
- Invoice list page at `apps/web/src/app/(dashboard)/invoices/page.tsx`
- Invoice hooks at `apps/web/src/hooks/use-invoices.ts`
- Enrollment hooks at `apps/web/src/hooks/use-enrollments.ts`

## Project Context
- **Frontend**: Next.js 15 with React Query
- **UI Library**: shadcn/ui components
- **State**: Zustand for global state
</context>

<input_context_files>
  <file purpose="enrollment_page">apps/web/src/app/(dashboard)/parents/[id]/page.tsx</file>
  <file purpose="invoice_hooks">apps/web/src/hooks/use-invoices.ts</file>
  <file purpose="enrollment_hooks">apps/web/src/hooks/use-enrollments.ts</file>
  <file purpose="invoice_components">apps/web/src/components/invoices/</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-021 completed (auto-invoice on enrollment works)</check>
  <check>TASK-WEB-037 completed (Parent/enrollment pages exist)</check>
</prerequisites>

<scope>
  <in_scope>
    - Update enrollment mutation to return invoice data
    - Create EnrollmentSuccessModal component
    - Show invoice summary after successful enrollment
    - Add "View Invoice" and "Send Invoice" buttons
    - Add toast notifications for enrollment + invoice creation
  </in_scope>
  <out_of_scope>
    - Modifying invoice generation logic (backend)
    - Invoice PDF generation (separate task)
    - Full invoice editing (use invoice list page)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/enrollment/enrollment-success-modal.tsx">
      interface EnrollmentSuccessModalProps {
        isOpen: boolean;
        onClose: () => void;
        enrollment: Enrollment;
        invoice: Invoice | null;
        onViewInvoice: () => void;
        onSendInvoice: () => void;
      }

      export function EnrollmentSuccessModal({
        isOpen,
        onClose,
        enrollment,
        invoice,
        onViewInvoice,
        onSendInvoice,
      }: EnrollmentSuccessModalProps): JSX.Element;
    </signature>
  </signatures>

  <constraints>
    - Must use shadcn/ui Dialog component
    - Must handle case where invoice creation failed (show enrollment success only)
    - Must format currency in ZAR (R X,XXX.XX)
    - Must be accessible (keyboard navigation, ARIA)
    - Must be responsive for mobile
  </constraints>

  <verification>
    - Modal appears after successful enrollment
    - Invoice summary displayed if invoice exists
    - "View Invoice" navigates to invoice details
    - "Send Invoice" calls invoice delivery API
    - Graceful handling when no invoice
    - TypeScript compiles
  </verification>
</definition_of_done>

<pseudo_code>
EnrollmentSuccessModal (apps/web/src/components/enrollment/enrollment-success-modal.tsx):

  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@/components/ui/dialog';
  import { Button } from '@/components/ui/button';
  import { CheckCircle, FileText, Send, X } from 'lucide-react';
  import { formatCurrency } from '@/lib/utils/format';

  export function EnrollmentSuccessModal({
    isOpen,
    onClose,
    enrollment,
    invoice,
    onViewInvoice,
    onSendInvoice,
  }) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <DialogTitle>Enrollment Successful</DialogTitle>
            </div>
            <DialogDescription>
              {enrollment.child?.firstName} has been enrolled in {enrollment.feeStructure?.name}
            </DialogDescription>
          </DialogHeader>

          {invoice && (
            <div className="border rounded-lg p-4 my-4">
              <h4 className="font-medium mb-2">Enrollment Invoice</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Invoice Number:</span>
                  <span className="font-mono">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Amount:</span>
                  <span className="font-semibold">{formatCurrency(invoice.totalCents / 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Due Date:</span>
                  <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          )}

          {!invoice && (
            <div className="text-sm text-muted-foreground my-4">
              Note: Invoice generation is pending or failed. You can generate it manually from the Invoices page.
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {invoice && (
              <>
                <Button variant="outline" onClick={onViewInvoice}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Invoice
                </Button>
                <Button onClick={onSendInvoice}>
                  <Send className="h-4 w-4 mr-2" />
                  Send Invoice
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

// Usage in parent page:
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState(null);

  const enrollMutation = useEnrollChild({
    onSuccess: (data) => {
      setEnrollmentResult(data);
      setShowSuccessModal(true);
    }
  });

  // In JSX:
  <EnrollmentSuccessModal
    isOpen={showSuccessModal}
    onClose={() => setShowSuccessModal(false)}
    enrollment={enrollmentResult?.enrollment}
    invoice={enrollmentResult?.invoice}
    onViewInvoice={() => router.push(`/invoices/${enrollmentResult?.invoice?.id}`)}
    onSendInvoice={() => sendInvoiceMutation.mutate(enrollmentResult?.invoice?.id)}
  />
</pseudo_code>

<files_to_create>
  <file path="apps/web/src/components/enrollment/enrollment-success-modal.tsx">EnrollmentSuccessModal component</file>
  <file path="apps/web/src/components/enrollment/index.ts">Export barrel file</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/parents/[id]/page.tsx">Add modal state and EnrollmentSuccessModal</file>
  <file path="apps/web/src/hooks/use-enrollments.ts">Update mutation to return invoice data</file>
</files_to_modify>

<validation_criteria>
  <criterion>Modal displays after successful enrollment</criterion>
  <criterion>Invoice summary shows if invoice created</criterion>
  <criterion>Handles missing invoice gracefully</criterion>
  <criterion>View Invoice navigates correctly</criterion>
  <criterion>Send Invoice triggers API call</criterion>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>ESLint passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
</test_commands>

<implementation_notes>
## Implementation Summary (2026-01-06)

### Backend Changes:

1. **apps/api/src/database/services/enrollment.service.ts**:
   - Added `EnrollChildResult` interface returning `{ enrollment, invoice }`
   - Modified `enrollChild()` to return both enrollment and invoice (nullable)
   - Invoice captured from `createEnrollmentInvoice()` call

2. **apps/api/src/api/billing/dto/enroll-child.dto.ts**:
   - Added `EnrollmentInvoiceSummaryDto` class for invoice response
   - Updated `EnrollChildDataDto` to include optional `invoice` field

3. **apps/api/src/api/billing/child.controller.ts**:
   - Updated `enrollChild()` endpoint to destructure enrollment and invoice
   - Added invoice transformation to response (id, invoice_number, total, due_date, status)

### Frontend Changes:

1. **apps/web/src/components/enrollments/EnrollmentSuccessModal.tsx** (NEW):
   - Created success modal with enrollment and invoice details
   - Shows checkmark icon and enrollment summary
   - Displays invoice box if invoice created (blue styling)
   - Shows warning if no invoice created (yellow styling)
   - "View Invoice" button navigates to invoice page
   - "Send Invoice" button triggers invoice delivery API
   - Responsive design with proper accessibility

2. **apps/web/src/components/enrollments/index.ts**:
   - Added export for EnrollmentSuccessModal
   - Added type exports for EnrollmentData, EnrollmentInvoice

3. **apps/web/src/hooks/use-parents.ts**:
   - Added `EnrollmentInvoiceSummary` interface
   - Updated `CreateChildResponse` to include `invoice` field

4. **apps/web/src/app/(dashboard)/parents/[id]/page.tsx**:
   - Added state for success modal and enrollment result
   - Modified `handleAddChild` to show success modal instead of just toast
   - Added `handleViewInvoice` to navigate to invoice page
   - Added `handleSendInvoice` to trigger invoice delivery
   - Integrated EnrollmentSuccessModal component

### Key Implementation Details:
- Invoice data flows from backend service through controller to frontend
- Modal handles null invoice gracefully with warning message
- Invoice total displayed in ZAR currency format
- Due date formatted for South African locale
- Send invoice uses email method by default

### Verification:
- ✅ TypeScript build passes without errors
- ✅ Modal displays after successful enrollment
- ✅ Invoice summary shows when invoice exists
- ✅ Graceful handling when no invoice
- ✅ Navigation to invoice detail page works
- ✅ Send invoice integration complete
</implementation_notes>

</task_spec>
