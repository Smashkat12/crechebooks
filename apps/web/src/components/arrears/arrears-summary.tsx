import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrearsRow } from "./arrears-columns";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, Clock, AlertTriangle, AlertCircle } from "lucide-react";

interface ArrearsSummaryProps {
  data: ArrearsRow[];
}

export function ArrearsSummary({ data }: ArrearsSummaryProps) {
  const totalOutstanding = data.reduce(
    (sum, row) => sum + row.totalOutstanding,
    0
  );

  const countByBand = {
    current: data.filter((r) => r.agingBand === "current").length,
    "1-30": data.filter((r) => r.agingBand === "1-30").length,
    "31-60": data.filter((r) => r.agingBand === "31-60").length,
    "61-90": data.filter((r) => r.agingBand === "61-90").length,
    "90+": data.filter((r) => r.agingBand === "90+").length,
  };

  const amountByBand = {
    current: data
      .filter((r) => r.agingBand === "current")
      .reduce((sum, r) => sum + r.totalOutstanding, 0),
    "1-30": data
      .filter((r) => r.agingBand === "1-30")
      .reduce((sum, r) => sum + r.totalOutstanding, 0),
    "31-60": data
      .filter((r) => r.agingBand === "31-60")
      .reduce((sum, r) => sum + r.totalOutstanding, 0),
    "61-90": data
      .filter((r) => r.agingBand === "61-90")
      .reduce((sum, r) => sum + r.totalOutstanding, 0),
    "90+": data
      .filter((r) => r.agingBand === "90+")
      .reduce((sum, r) => sum + r.totalOutstanding, 0),
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Outstanding
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {formatCurrency(totalOutstanding)}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.length} parent(s) with arrears
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">1-30 Days</CardTitle>
          <Clock className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(amountByBand["1-30"])}</div>
          <p className="text-xs text-muted-foreground">
            {countByBand["1-30"]} parent(s)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">31-90 Days</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(amountByBand["31-60"] + amountByBand["61-90"])}
          </div>
          <p className="text-xs text-muted-foreground">
            {countByBand["31-60"] + countByBand["61-90"]} parent(s)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">90+ Days</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(amountByBand["90+"])}
          </div>
          <p className="text-xs text-muted-foreground">
            {countByBand["90+"]} parent(s)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
