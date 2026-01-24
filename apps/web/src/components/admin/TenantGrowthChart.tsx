'use client';

interface GrowthData {
  month: string;
  newTenants: number;
  cumulativeTenants?: number;
}

interface TenantGrowthChartProps {
  data: GrowthData[];
}

export function TenantGrowthChart({ data }: TenantGrowthChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">No growth data available</p>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.newTenants), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.month} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground w-24">{item.month}</span>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="w-48 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(item.newTenants / maxValue) * 100}%` }}
              />
            </div>
            <span className="font-medium w-8 text-right">{item.newTenants}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
