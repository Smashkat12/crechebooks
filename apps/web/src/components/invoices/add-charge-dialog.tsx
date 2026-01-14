/**
 * Add Ad-Hoc Charge Dialog
 * TASK-BILL-038: SA VAT Compliance Enhancement
 *
 * Allows adding ad-hoc charges to invoices with proper VAT categorization
 * per South African VAT Act No. 89 of 1991, Section 12(h).
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useAddCharge,
  AdHocChargeType,
  CHARGE_TYPE_LABELS,
  VAT_EXEMPT_CHARGE_TYPES,
} from "@/hooks/use-adhoc-charges";

interface AddChargeDialogProps {
  invoiceId: string;
  invoiceNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChargeDialog({
  invoiceId,
  invoiceNumber,
  open,
  onOpenChange,
}: AddChargeDialogProps) {
  const { toast } = useToast();
  const addCharge = useAddCharge();

  const [description, setDescription] = useState("");
  const [amountRand, setAmountRand] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [accountCode, setAccountCode] = useState("");
  // TASK-BILL-038: New VAT compliance fields
  const [chargeType, setChargeType] = useState<AdHocChargeType>(AdHocChargeType.OTHER);
  const [isVatExempt, setIsVatExempt] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // TASK-BILL-038: Auto-update VAT exemption when charge type changes
  useEffect(() => {
    // Automatically mark as VAT exempt if charge type is in exempt list
    if (VAT_EXEMPT_CHARGE_TYPES.includes(chargeType)) {
      setIsVatExempt(true);
    } else {
      // Reset to false for non-exempt types (user can still override for OTHER)
      setIsVatExempt(false);
    }
  }, [chargeType]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!description.trim()) {
      newErrors.description = "Description is required";
    }

    const amount = parseFloat(amountRand);
    if (!amountRand || isNaN(amount) || amount <= 0) {
      newErrors.amount = "Valid amount is required";
    }

    const qty = parseInt(quantity, 10);
    if (!quantity || isNaN(qty) || qty < 1) {
      newErrors.quantity = "Quantity must be at least 1";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      // Convert Rand to cents
      const amountCents = Math.round(parseFloat(amountRand) * 100);
      const qty = parseInt(quantity, 10);

      await addCharge.mutateAsync({
        invoiceId,
        description: description.trim(),
        amountCents,
        quantity: qty,
        accountCode: accountCode.trim() || undefined,
        // TASK-BILL-038: Include VAT compliance fields
        chargeType,
        isVatExempt,
      });

      toast({
        title: "Charge added",
        description: `Ad-hoc charge added to invoice ${invoiceNumber}`,
      });

      // Reset form and close
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to add charge",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setDescription("");
    setAmountRand("");
    setQuantity("1");
    setAccountCode("");
    setChargeType(AdHocChargeType.OTHER);
    setIsVatExempt(false);
    setErrors({});
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  // Calculate estimated VAT for display
  const calculateEstimatedVat = (): number => {
    if (isVatExempt) return 0;
    const amount = parseFloat(amountRand);
    const qty = parseInt(quantity, 10);
    if (isNaN(amount) || isNaN(qty)) return 0;
    return amount * qty * 0.15; // 15% VAT
  };

  const estimatedVat = calculateEstimatedVat();
  const totalWithVat = parseFloat(amountRand) * parseInt(quantity || "1", 10) + estimatedVat;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Add Ad-hoc Charge</DialogTitle>
          <DialogDescription>
            Add an ad-hoc charge to invoice {invoiceNumber}. Select the charge type for correct VAT treatment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Charge Type Selection - TASK-BILL-038 */}
          <div className="space-y-2">
            <Label htmlFor="chargeType">
              Charge Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={chargeType}
              onValueChange={(value) => setChargeType(value as AdHocChargeType)}
            >
              <SelectTrigger id="chargeType">
                <SelectValue placeholder="Select charge type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHARGE_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              VAT treatment is determined by charge type per SA VAT Act Section 12(h)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="description"
              placeholder="e.g., Late pickup fee - December 15th"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors((prev) => ({ ...prev, description: "" }));
                }
              }}
              className={errors.description ? "border-destructive" : ""}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount (Rand) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amountRand}
                onChange={(e) => {
                  setAmountRand(e.target.value);
                  if (errors.amount) {
                    setErrors((prev) => ({ ...prev, amount: "" }));
                  }
                }}
                className={errors.amount ? "border-destructive" : ""}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (errors.quantity) {
                    setErrors((prev) => ({ ...prev, quantity: "" }));
                  }
                }}
                className={errors.quantity ? "border-destructive" : ""}
              />
              {errors.quantity && (
                <p className="text-sm text-destructive">{errors.quantity}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountCode">Account Code (Optional)</Label>
            <Input
              id="accountCode"
              placeholder="e.g., 4100"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
            />
          </div>

          {/* VAT Exemption Override - TASK-BILL-038 */}
          {chargeType === AdHocChargeType.OTHER && (
            <div className="flex items-center space-x-2 rounded-md border p-3">
              <Checkbox
                id="isVatExempt"
                checked={isVatExempt}
                onCheckedChange={(checked) => setIsVatExempt(checked === true)}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="isVatExempt"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  VAT Exempt
                </Label>
                <p className="text-xs text-muted-foreground">
                  Mark as VAT exempt if this is an educational service (e.g., extra-mural activity)
                </p>
              </div>
            </div>
          )}

          {/* VAT Status Info for non-OTHER types */}
          {chargeType !== AdHocChargeType.OTHER && (
            <div className={`rounded-md p-3 ${isVatExempt ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border`}>
              <p className="text-sm font-medium">
                {isVatExempt ? '✓ VAT Exempt' : '• VAT Applicable (15%)'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isVatExempt
                  ? 'This charge type is VAT exempt per SA VAT Act Section 12(h)'
                  : 'Standard 15% VAT will be applied to this charge'}
              </p>
            </div>
          )}

          {/* Total Summary with VAT breakdown */}
          {amountRand && quantity && !isNaN(parseFloat(amountRand)) && !isNaN(parseInt(quantity, 10)) && (
            <div className="rounded-md bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>R{(parseFloat(amountRand) * parseInt(quantity, 10)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT (15%):</span>
                <span className={isVatExempt ? "text-muted-foreground line-through" : ""}>
                  R{estimatedVat.toFixed(2)}
                </span>
                {isVatExempt && <span className="text-green-600 ml-2">Exempt</span>}
              </div>
              <div className="flex justify-between font-medium border-t pt-1 mt-1">
                <span>Total:</span>
                <span>R{(isVatExempt ? parseFloat(amountRand) * parseInt(quantity, 10) : totalWithVat).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={addCharge.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={addCharge.isPending}>
            {addCharge.isPending ? "Adding..." : "Add Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
