/**
 * Generate Invoices Wizard
 * TASK-BILL-001: Fix Frontend VAT Calculation Mismatch
 *
 * This wizard generates invoices for monthly childcare fees.
 * Per SA VAT Act Section 12(h)(iii), childcare fees are VAT exempt.
 * VAT is only applied to ad-hoc charges (meals, transport, etc.)
 * which are added separately and calculated by the backend.
 */
import { useState } from "react";
import { CalendarIcon, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
import { apiClient } from "@/lib/api";
import { calculateInvoiceVAT, type OrganizationConfig } from "@/lib/vat";

interface EnrollmentPreview {
  id: string;
  childName: string;
  parentName: string;
  feeStructure: string;
  monthlyFee: number;
  selected: boolean;
}

interface InvoicePreviewSummary {
  parentName: string;
  children: string[];
  subtotal: number;
  vat: number;
  total: number;
}

interface GenerateInvoicesWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (month: Date, enrollmentIds: string[]) => void;
}

export function GenerateInvoicesWizard({
  open,
  onOpenChange,
  onGenerate,
}: GenerateInvoicesWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState<Date>();
  const [enrollments, setEnrollments] = useState<EnrollmentPreview[]>([]);
  const [selectedEnrollments, setSelectedEnrollments] = useState<string[]>([]);
  const [isLoadingEnrollments, setIsLoadingEnrollments] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  // Fetch real enrollment data from API using children endpoint
  const fetchEnrollments = async () => {
    setIsLoadingEnrollments(true);
    setEnrollmentError(null);
    try {
      // Fetch children with active enrollments via children endpoint
      const response = await apiClient.get<{
        success: boolean;
        data: Array<{
          id: string;
          first_name: string;
          last_name: string;
          parent: { id: string; name: string; email: string };
          enrollment_status: string | null;
          current_enrollment?: {
            id: string;
            fee_structure: { id: string; name: string; amount: number };
            status: string;
          };
        }>;
        meta: { total: number };
      }>('/children', {
        params: { enrollment_status: 'ACTIVE', limit: 100 },
      });

      if (response.data.success && response.data.data) {
        // Filter to only children with active enrollments
        const activeChildren = response.data.data.filter(
          (c) => c.enrollment_status === 'ACTIVE' && c.current_enrollment
        );

        const enrollmentData: EnrollmentPreview[] = activeChildren.map((c) => ({
          id: c.id, // Use child ID, not enrollment ID - API expects childIds
          childName: `${c.first_name} ${c.last_name}`,
          parentName: c.parent.name,
          feeStructure: c.current_enrollment?.fee_structure.name || 'Standard',
          monthlyFee: c.current_enrollment?.fee_structure.amount || 950, // Default to R950 if not set
          selected: true,
        }));
        setEnrollments(enrollmentData);
        setSelectedEnrollments(enrollmentData.map((e) => e.id));
      }
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
      setEnrollmentError('Failed to load enrollments. Please try again.');
    } finally {
      setIsLoadingEnrollments(false);
    }
  };

  const handleMonthSelect = (date: Date | undefined) => {
    setSelectedMonth(date);
    if (date) {
      // Fetch real enrollments when month is selected
      fetchEnrollments();
    }
  };

  const handleToggleEnrollment = (id: string) => {
    setSelectedEnrollments((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    if (selectedEnrollments.length === enrollments.length) {
      setSelectedEnrollments([]);
    } else {
      setSelectedEnrollments(enrollments.map((e) => e.id));
    }
  };

  const generateInvoicePreviews = (): InvoicePreviewSummary[] => {
    const selected = enrollments.filter((e) =>
      selectedEnrollments.includes(e.id)
    );

    const byParent = selected.reduce((acc, enrollment) => {
      if (!acc[enrollment.parentName]) {
        acc[enrollment.parentName] = [];
      }
      acc[enrollment.parentName].push(enrollment);
      return acc;
    }, {} as Record<string, EnrollmentPreview[]>);

    // TASK-BILL-001: Organization config for VAT calculations
    // Monthly childcare fees are MONTHLY_FEE line type = VAT exempt
    const orgConfig: OrganizationConfig = {
      defaultVatRate: 15,
      vatStatus: 'standard',
    };

    return Object.entries(byParent).map(([parentName, parentEnrollments]) => {
      // TASK-BILL-001: Use centralized VAT calculation utility
      // Monthly childcare fees are VAT exempt per SA VAT Act Section 12(h)(iii)
      // Transform enrollments to line items with MONTHLY_FEE type (exempt)
      const lineItems = parentEnrollments.map((e) => ({
        amount: e.monthlyFee,
        lineType: 'MONTHLY_FEE' as const, // This line type is VAT exempt
        isVatExempt: true, // Explicit exemption for childcare fees
      }));

      // Calculate using centralized utility - will return 0 VAT for exempt items
      const vatResult = calculateInvoiceVAT(lineItems, orgConfig);

      return {
        parentName,
        children: parentEnrollments.map((e) => e.childName),
        subtotal: vatResult.subtotal,
        vat: vatResult.vatAmount, // Will be 0 for childcare fees
        total: vatResult.total,
      };
    });
  };

  const handleGenerate = () => {
    if (selectedMonth) {
      onGenerate(selectedMonth, selectedEnrollments);
      handleReset();
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedMonth(undefined);
    setEnrollments([]);
    setSelectedEnrollments([]);
  };

  const invoicePreviews = (step === 3 || step === 4) ? generateInvoicePreviews() : [];
  const totalAmount = invoicePreviews.reduce((sum, inv) => sum + inv.total, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate Invoices</DialogTitle>
          <DialogDescription>
            Step {step} of 4: {step === 1 && "Select billing month"}
            {step === 2 && "Review enrollments"}
            {step === 3 && "Preview invoices"}
            {step === 4 && "Confirm generation"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Step 1: Select Month */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Billing Month</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedMonth && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedMonth ? (
                        format(selectedMonth, "MMMM yyyy")
                      ) : (
                        <span>Pick a month</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedMonth}
                      onSelect={handleMonthSelect}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Step 2: Review Enrollments */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Active Enrollments for {selectedMonth && format(selectedMonth, "MMMM yyyy")}</Label>
                <Button variant="outline" size="sm" onClick={handleToggleAll} disabled={isLoadingEnrollments}>
                  {selectedEnrollments.length === enrollments.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
              <ScrollArea className="h-[400px] rounded-md border">
                <div className="p-4 space-y-2">
                  {isLoadingEnrollments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span>Loading enrollments...</span>
                    </div>
                  ) : enrollmentError ? (
                    <div className="text-center py-8 text-destructive">
                      <p>{enrollmentError}</p>
                      <Button variant="outline" size="sm" onClick={fetchEnrollments} className="mt-2">
                        Retry
                      </Button>
                    </div>
                  ) : enrollments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No active enrollments found
                    </div>
                  ) : (
                    enrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted"
                      >
                        <Checkbox
                          checked={selectedEnrollments.includes(enrollment.id)}
                          onCheckedChange={() =>
                            handleToggleEnrollment(enrollment.id)
                          }
                        />
                        <div className="flex-1 space-y-1">
                          <p className="font-medium">{enrollment.childName}</p>
                          <p className="text-sm text-muted-foreground">
                            Parent: {enrollment.parentName} • {enrollment.feeStructure}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {formatCurrency(enrollment.monthlyFee)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <p className="text-sm text-muted-foreground">
                {selectedEnrollments.length} of {enrollments.length} enrollments selected
              </p>
            </div>
          )}

          {/* Step 3: Preview Invoices */}
          {step === 3 && (
            <div className="space-y-4">
              <Label>Invoice Preview</Label>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {invoicePreviews.map((preview, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {preview.parentName}
                        </CardTitle>
                        <CardDescription>
                          {preview.children.join(", ")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatCurrency(preview.subtotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">VAT (15%)</span>
                            <span>{formatCurrency(preview.vat)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-medium">
                            <span>Total</span>
                            <span>{formatCurrency(preview.total)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Grand Total ({invoicePreviews.length} invoices)</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-6 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Ready to Generate</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {invoicePreviews.length} invoices will be created for{" "}
                    {selectedMonth && format(selectedMonth, "MMMM yyyy")}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="text-2xl font-bold">
                    {formatCurrency(totalAmount)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total amount</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (step === 1) {
                handleReset();
                onOpenChange(false);
              } else {
                setStep(step - 1);
              }
            }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={() => {
              if (step === 4) {
                handleGenerate();
              } else {
                setStep(step + 1);
              }
            }}
            disabled={step === 1 && !selectedMonth}
          >
            {step === 4 ? "Generate Invoices" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
