'use client';

/**
 * Delivery Stats Chart Component
 * TASK-COMM-006: Message History and Analytics UI
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageSquare, CheckCircle, XCircle, Eye, Clock } from 'lucide-react';

interface DeliveryStats {
  total: number;
  email_sent?: number;
  email_delivered?: number;
  email_opened?: number;
  email_failed?: number;
  whatsapp_sent?: number;
  whatsapp_delivered?: number;
  whatsapp_read?: number;
  whatsapp_failed?: number;
  sms_sent?: number;
  sms_delivered?: number;
  sms_failed?: number;
}

interface DeliveryStatsChartProps {
  stats: DeliveryStats;
  channel: 'email' | 'whatsapp' | 'sms' | 'all';
}

function StatItem({
  label,
  value,
  total,
  icon,
  color,
}: {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div className={`${color}`}>{icon}</div>
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-right">
        <span className="font-medium">{value}</span>
        <span className="text-muted-foreground text-sm ml-1">({percentage}%)</span>
      </div>
    </div>
  );
}

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export function DeliveryStatsChart({ stats, channel }: DeliveryStatsChartProps) {
  const showEmail = channel === 'email' || channel === 'all';
  const showWhatsApp = channel === 'whatsapp' || channel === 'all';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {showEmail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressBar
              value={stats.email_delivered ?? 0}
              total={stats.email_sent ?? 0}
              color="bg-green-500"
            />
            <div className="divide-y">
              <StatItem
                label="Sent"
                value={stats.email_sent ?? 0}
                total={stats.total}
                icon={<CheckCircle className="h-4 w-4" />}
                color="text-blue-500"
              />
              <StatItem
                label="Delivered"
                value={stats.email_delivered ?? 0}
                total={stats.email_sent ?? 0}
                icon={<CheckCircle className="h-4 w-4" />}
                color="text-green-500"
              />
              <StatItem
                label="Opened"
                value={stats.email_opened ?? 0}
                total={stats.email_delivered ?? 0}
                icon={<Eye className="h-4 w-4" />}
                color="text-purple-500"
              />
              <StatItem
                label="Failed"
                value={stats.email_failed ?? 0}
                total={stats.email_sent ?? 0}
                icon={<XCircle className="h-4 w-4" />}
                color="text-red-500"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {showWhatsApp && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressBar
              value={stats.whatsapp_delivered ?? 0}
              total={stats.whatsapp_sent ?? 0}
              color="bg-green-500"
            />
            <div className="divide-y">
              <StatItem
                label="Sent"
                value={stats.whatsapp_sent ?? 0}
                total={stats.total}
                icon={<CheckCircle className="h-4 w-4" />}
                color="text-blue-500"
              />
              <StatItem
                label="Delivered"
                value={stats.whatsapp_delivered ?? 0}
                total={stats.whatsapp_sent ?? 0}
                icon={<CheckCircle className="h-4 w-4" />}
                color="text-green-500"
              />
              <StatItem
                label="Read"
                value={stats.whatsapp_read ?? 0}
                total={stats.whatsapp_delivered ?? 0}
                icon={<Eye className="h-4 w-4" />}
                color="text-purple-500"
              />
              <StatItem
                label="Failed"
                value={stats.whatsapp_failed ?? 0}
                total={stats.whatsapp_sent ?? 0}
                icon={<XCircle className="h-4 w-4" />}
                color="text-red-500"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
