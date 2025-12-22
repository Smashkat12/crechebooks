import { useState } from "react";
import { CalendarIcon, Check } from "lucide-react";
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

  // Mock data - replace with actual API call
  const mockEnrollments: EnrollmentPreview[] = [
    {
      id: "1",
      childName: "Alice Johnson",
      parentName: "Bob Johnson",
      feeStructure: "Standard Monthly",
      monthlyFee: 2500,
      selected: true,
    },
    {
      id: "2",
      childName: "Charlie Smith",
      parentName: "Diana Smith",
      feeStructure: "Standard Monthly",
      monthlyFee: 2500,
      selected: true,
    },
    {
      id: "3",
      childName: "Eve Williams",
      parentName: "Frank Williams",
      feeStructure: "Premium Monthly",
      monthlyFee: 3500,
      selected: true,
    },
  ];

  const handleMonthSelect = (date: Date | undefined) => {
    setSelectedMonth(date);
    if (date) {
      // Fetch enrollments for selected month
      setEnrollments(mockEnrollments);
      setSelectedEnrollments(mockEnrollments.map((e) => e.id));
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

    return Object.entries(byParent).map(([parentName, enrollments]) => {
      const subtotal = enrollments.reduce((sum, e) => sum + e.monthlyFee, 0);
      const vat = subtotal * 0.15; // 15% VAT
      const total = subtotal + vat;

      return {
        parentName,
        children: enrollments.map((e) => e.childName),
        subtotal,
        vat,
        total,
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

  const invoicePreviews = step === 3 ? generateInvoicePreviews() : [];
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
                <Button variant="outline" size="sm" onClick={handleToggleAll}>
                  {selectedEnrollments.length === enrollments.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
              <ScrollArea className="h-[400px] rounded-md border">
                <div className="p-4 space-y-2">
                  {enrollments.map((enrollment) => (
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
                  ))}
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
