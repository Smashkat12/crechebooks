'use client';

import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface Activity {
  id: string;
  type: string;
  description: string;
  tenantName?: string;
  userName?: string;
  createdAt: string;
}

interface RecentActivityFeedProps {
  activities: Activity[];
}

const typeColors: Record<string, string> = {
  TENANT_CREATED: 'bg-green-100 text-green-800',
  USER_LOGIN: 'bg-blue-100 text-blue-800',
  USER_CREATED: 'bg-purple-100 text-purple-800',
  SUBSCRIPTION_CHANGED: 'bg-yellow-100 text-yellow-800',
};

const typeLabels: Record<string, string> = {
  TENANT_CREATED: 'New Tenant',
  USER_LOGIN: 'Login',
  USER_CREATED: 'New User',
  SUBSCRIPTION_CHANGED: 'Subscription',
};

export function RecentActivityFeed({ activities }: RecentActivityFeedProps) {
  if (!activities.length) {
    return <p className="text-muted-foreground text-center py-4">No recent activity</p>;
  }

  return (
    <div className="space-y-4">
      {activities.slice(0, 10).map((activity) => (
        <div key={activity.id} className="flex items-start justify-between text-sm">
          <div className="flex items-start gap-3">
            <Badge
              className={typeColors[activity.type] || 'bg-gray-100 text-gray-800'}
              variant="secondary"
            >
              {typeLabels[activity.type] || activity.type}
            </Badge>
            <div>
              <p className="font-medium">{activity.description}</p>
              <p className="text-muted-foreground text-xs">
                {activity.tenantName || activity.userName || 'Platform'}
              </p>
            </div>
          </div>
          <span className="text-muted-foreground whitespace-nowrap">
            {activity.createdAt
              ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
