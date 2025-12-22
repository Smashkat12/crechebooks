import { Badge } from "@/components/ui/badge";

interface InvoiceStatusBadgeProps {
  status: string;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  // Uppercase (from API)
  DRAFT: { label: "Draft", variant: "secondary" },
  PENDING: { label: "Pending", variant: "outline" },
  SENT: { label: "Sent", variant: "default" },
  PAID: { label: "Paid", variant: "success" },
  PARTIALLY_PAID: { label: "Partially Paid", variant: "warning" },
  OVERDUE: { label: "Overdue", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
  // Lowercase (for backward compatibility)
  draft: { label: "Draft", variant: "secondary" },
  pending: { label: "Pending", variant: "outline" },
  sent: { label: "Sent", variant: "default" },
  paid: { label: "Paid", variant: "success" },
  partially_paid: { label: "Partially Paid", variant: "warning" },
  overdue: { label: "Overdue", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "outline" as BadgeVariant };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
