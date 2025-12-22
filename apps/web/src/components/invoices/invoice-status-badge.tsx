import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/types/invoice";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const statusConfig: Record<InvoiceStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  draft: {
    label: "Draft",
    variant: "secondary",
  },
  pending: {
    label: "Pending",
    variant: "outline",
  },
  sent: {
    label: "Sent",
    variant: "default",
  },
  paid: {
    label: "Paid",
    variant: "success",
  },
  overdue: {
    label: "Overdue",
    variant: "destructive",
  },
  cancelled: {
    label: "Cancelled",
    variant: "outline",
  },
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
