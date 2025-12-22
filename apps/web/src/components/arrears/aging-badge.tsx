import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AgingBand = "current" | "1-30" | "31-60" | "61-90" | "90+";

interface AgingBadgeProps {
  band: AgingBand;
  className?: string;
}

const bandConfig: Record<
  AgingBand,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  current: {
    label: "Current",
    variant: "default",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  "1-30": {
    label: "1-30 Days",
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  "31-60": {
    label: "31-60 Days",
    variant: "secondary",
    className: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  },
  "61-90": {
    label: "61-90 Days",
    variant: "destructive",
    className: "bg-red-100 text-red-800 hover:bg-red-100",
  },
  "90+": {
    label: "90+ Days",
    variant: "destructive",
    className: "bg-red-900 text-red-50 hover:bg-red-900",
  },
};

export function AgingBadge({ band, className }: AgingBadgeProps) {
  const config = bandConfig[band];

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
