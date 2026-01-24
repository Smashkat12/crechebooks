'use client';

interface SubscriptionData {
  status: string;
  count: number;
  percentage?: number;
}

interface PlatformMetricsChartProps {
  data: SubscriptionData[];
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-500',
  TRIAL: 'bg-blue-500',
  SUSPENDED: 'bg-red-500',
  CANCELLED: 'bg-gray-500',
};

export function PlatformMetricsChart({ data }: PlatformMetricsChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">No subscription data</p>
    );
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-4">
      {/* Progress bar showing distribution */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {data.map((item, idx) => {
          const percentage = total > 0 ? (item.count / total) * 100 : 0;
          return (
            <div
              key={item.status || idx}
              className={`${statusColors[item.status] || 'bg-gray-400'} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
              title={`${item.status}: ${item.count} (${percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {data.map((item) => {
          const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
          return (
            <div key={item.status} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${statusColors[item.status] || 'bg-gray-400'}`} />
                <span className="capitalize">{item.status?.toLowerCase() || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">{percentage}%</span>
                <span className="font-bold w-8 text-right">{item.count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="pt-2 border-t flex justify-between text-sm font-medium">
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  );
}
