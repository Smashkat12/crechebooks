import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useAddCharge } from "@/hooks/use-adhoc-charges";

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
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      });

      toast({
        title: "Charge added",
        description: `Ad-hoc charge added to invoice ${invoiceNumber}`,
      });

      // Reset form and close
      setDescription("");
      setAmountRand("");
      setQuantity("1");
      setAccountCode("");
      setErrors({});
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to add charge",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setDescription("");
    setAmountRand("");
    setQuantity("1");
    setAccountCode("");
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Ad-hoc Charge</DialogTitle>
          <DialogDescription>
            Add an ad-hoc charge to invoice {invoiceNumber}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="description"
              placeholder="e.g., Late payment fee"
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

          {amountRand && quantity && !isNaN(parseFloat(amountRand)) && !isNaN(parseInt(quantity, 10)) && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">
                Total: R{(parseFloat(amountRand) * parseInt(quantity, 10)).toFixed(2)}
              </p>
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
