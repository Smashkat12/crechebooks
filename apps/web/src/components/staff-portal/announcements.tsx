'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Megaphone, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: Date | string;
  priority: 'low' | 'medium' | 'high';
}

interface AnnouncementsProps {
  announcements: Announcement[];
}

export function Announcements({ announcements }: AnnouncementsProps) {
  const priorityStyles = {
    low: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-700 dark:text-slate-300',
      icon: Bell,
    },
    medium: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      icon: Megaphone,
    },
    high: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      icon: AlertTriangle,
    },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Announcements</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {announcements.map((announcement) => {
            const style = priorityStyles[announcement.priority];
            const Icon = style.icon;

            return (
              <div
                key={announcement.id}
                className="p-3 rounded-lg border space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${style.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${style.text}`} />
                    </div>
                    <h4 className="text-sm font-medium">{announcement.title}</h4>
                  </div>
                  <Badge variant="outline" className="text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(announcement.createdAt), {
                      addSuffix: true,
                    })}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground pl-8">
                  {announcement.content}
                </p>
              </div>
            );
          })}
          {announcements.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No announcements at this time
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
