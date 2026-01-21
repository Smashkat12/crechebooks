<task_spec id="TASK-COMM-006" version="1.0">

<metadata>
  <title>Message History and Analytics UI</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>285</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-COMM-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-COMM-004</task_ref>
    <task_ref status="ready">TASK-COMM-005</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/components/communications/delivery-stats-chart.tsx` (NEW)
  - `apps/web/src/components/communications/recipient-delivery-table.tsx` (NEW)
  - `apps/web/src/components/communications/communication-analytics.tsx` (NEW)
  - `apps/web/src/components/communications/export-button.tsx` (NEW)

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/communications/[id]/page.tsx` (add analytics)
  - `apps/web/src/app/(dashboard)/communications/page.tsx` (add stats cards)

  **Current Problem:**
  - No detailed view of delivery status per recipient
  - No charts showing delivery success rates
  - No way to export communication reports
  - No monthly/weekly analytics view

  **Test Count:** 460+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. DeliveryStatsChart Component
  ```typescript
  // apps/web/src/components/communications/delivery-stats-chart.tsx
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip,
  } from 'recharts';

  interface DeliveryStats {
    emailSent: number;
    emailDelivered: number;
    emailOpened: number;
    emailFailed: number;
    whatsappSent: number;
    whatsappDelivered: number;
    whatsappRead: number;
    whatsappFailed: number;
  }

  interface DeliveryStatsChartProps {
    stats: DeliveryStats;
    channel: 'email' | 'whatsapp' | 'all';
  }

  const COLORS = {
    delivered: '#22c55e', // green-500
    sent: '#3b82f6', // blue-500
    opened: '#8b5cf6', // violet-500
    read: '#8b5cf6', // violet-500
    failed: '#ef4444', // red-500
    pending: '#f59e0b', // amber-500
  };

  export function DeliveryStatsChart({ stats, channel }: DeliveryStatsChartProps) {
    const emailData = [
      { name: 'Opened', value: stats.emailOpened, color: COLORS.opened },
      { name: 'Delivered', value: stats.emailDelivered - stats.emailOpened, color: COLORS.delivered },
      { name: 'Sent', value: stats.emailSent - stats.emailDelivered, color: COLORS.sent },
      { name: 'Failed', value: stats.emailFailed, color: COLORS.failed },
    ].filter(d => d.value > 0);

    const whatsappData = [
      { name: 'Read', value: stats.whatsappRead, color: COLORS.read },
      { name: 'Delivered', value: stats.whatsappDelivered - stats.whatsappRead, color: COLORS.delivered },
      { name: 'Sent', value: stats.whatsappSent - stats.whatsappDelivered, color: COLORS.sent },
      { name: 'Failed', value: stats.whatsappFailed, color: COLORS.failed },
    ].filter(d => d.value > 0);

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {(channel === 'email' || channel === 'all') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Email Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={emailData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {emailData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {(channel === 'whatsapp' || channel === 'all') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">WhatsApp Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={whatsappData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {whatsappData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

  ### 3. RecipientDeliveryTable Component
  ```typescript
  // apps/web/src/components/communications/recipient-delivery-table.tsx
  'use client';

  import { useState } from 'react';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/components/ui/table';
  import { Badge } from '@/components/ui/badge';
  import { Input } from '@/components/ui/input';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
  import { CheckCircle, XCircle, Clock, Eye, MessageSquare } from 'lucide-react';

  interface MessageRecipient {
    id: string;
    recipientName: string;
    recipientEmail?: string;
    recipientPhone?: string;
    emailStatus?: string;
    emailSentAt?: Date;
    whatsappStatus?: string;
    whatsappSentAt?: Date;
    lastError?: string;
  }

  interface RecipientDeliveryTableProps {
    recipients: MessageRecipient[];
  }

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    sent: <CheckCircle className="h-4 w-4 text-blue-500" />,
    delivered: <CheckCircle className="h-4 w-4 text-green-500" />,
    opened: <Eye className="h-4 w-4 text-purple-500" />,
    read: <MessageSquare className="h-4 w-4 text-purple-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
  };

  export function RecipientDeliveryTable({ recipients }: RecipientDeliveryTableProps) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const filteredRecipients = recipients.filter((r) => {
      const matchesSearch = r.recipientName.toLowerCase().includes(search.toLowerCase()) ||
        r.recipientEmail?.toLowerCase().includes(search.toLowerCase()) ||
        r.recipientPhone?.includes(search);

      const status = r.emailStatus ?? r.whatsappStatus ?? 'pending';
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search recipients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="opened">Opened</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Email Status</TableHead>
              <TableHead>WhatsApp Status</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecipients.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{recipient.recipientName}</div>
                    <div className="text-sm text-muted-foreground">
                      {recipient.recipientEmail}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {recipient.emailStatus ? (
                    <div className="flex items-center gap-2">
                      {statusIcons[recipient.emailStatus]}
                      <span className="capitalize">{recipient.emailStatus}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {recipient.whatsappStatus ? (
                    <div className="flex items-center gap-2">
                      {statusIcons[recipient.whatsappStatus]}
                      <span className="capitalize">{recipient.whatsappStatus}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {recipient.emailSentAt || recipient.whatsappSentAt
                      ? new Date(
                          (recipient.emailSentAt ?? recipient.whatsappSentAt)!
                        ).toLocaleString()
                      : '-'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredRecipients.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No recipients found matching your filters
          </div>
        )}
      </div>
    );
  }
  ```

  ### 4. CommunicationAnalytics Component
  ```typescript
  // apps/web/src/components/communications/communication-analytics.tsx
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
  } from 'recharts';
  import { useQuery } from '@tanstack/react-query';
  import { communicationsApi } from '@/lib/api/communications';

  interface CommunicationAnalyticsProps {
    period?: 'week' | 'month' | 'year';
  }

  export function CommunicationAnalytics({ period = 'month' }: CommunicationAnalyticsProps) {
    const { data: analytics, isLoading } = useQuery({
      queryKey: ['communicationAnalytics', period],
      queryFn: () => communicationsApi.getAnalytics(period),
    });

    if (isLoading) {
      return <div className="h-[300px] animate-pulse bg-muted rounded-lg" />;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Message Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="email" name="Email" fill="#3b82f6" />
              <Bar dataKey="whatsapp" name="WhatsApp" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }
  ```

  ### 5. ExportButton Component
  ```typescript
  // apps/web/src/components/communications/export-button.tsx
  'use client';

  import { useState } from 'react';
  import { Button } from '@/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { Download, FileText, FileSpreadsheet } from 'lucide-react';
  import { toast } from 'sonner';

  interface ExportButtonProps {
    broadcastId: string;
    onExport: (format: 'csv' | 'pdf') => Promise<Blob>;
  }

  export function ExportButton({ broadcastId, onExport }: ExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (format: 'csv' | 'pdf') => {
      setIsExporting(true);
      try {
        const blob = await onExport(format);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `broadcast-${broadcastId}-report.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Report exported successfully');
      } catch (error) {
        toast.error('Failed to export report');
      } finally {
        setIsExporting(false);
      }
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => handleExport('csv')}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('pdf')}>
            <FileText className="mr-2 h-4 w-4" />
            Export as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  ```

  ### 6. Enhanced Broadcast Detail Page
  ```typescript
  // apps/web/src/app/(dashboard)/communications/[id]/page.tsx
  'use client';

  import { useBroadcast, useBroadcastRecipients } from '@/hooks/use-communications';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { DeliveryStatsChart } from '@/components/communications/delivery-stats-chart';
  import { RecipientDeliveryTable } from '@/components/communications/recipient-delivery-table';
  import { ExportButton } from '@/components/communications/export-button';
  import { format } from 'date-fns';

  export default function BroadcastDetailPage({ params }: { params: { id: string } }) {
    const { broadcast, isLoading } = useBroadcast(params.id);
    const { recipients } = useBroadcastRecipients(params.id);

    if (isLoading || !broadcast) {
      return <div>Loading...</div>;
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {broadcast.subject || 'Untitled Message'}
            </h1>
            <p className="text-muted-foreground">
              Sent {format(new Date(broadcast.sentAt!), 'PPpp')}
            </p>
          </div>
          <ExportButton
            broadcastId={params.id}
            onExport={(format) => communicationsApi.exportReport(params.id, format)}
          />
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Recipients"
            value={broadcast.totalRecipients}
          />
          <StatCard
            title="Sent"
            value={broadcast.sentCount}
            color="green"
          />
          <StatCard
            title="Failed"
            value={broadcast.failedCount}
            color="red"
          />
          <StatCard
            title="Delivery Rate"
            value={`${((broadcast.sentCount / broadcast.totalRecipients) * 100).toFixed(1)}%`}
          />
        </div>

        {/* Delivery Charts */}
        <DeliveryStatsChart
          stats={broadcast.deliveryStats}
          channel={broadcast.channel as 'email' | 'whatsapp' | 'all'}
        />

        {/* Recipients Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <RecipientDeliveryTable recipients={recipients ?? []} />
          </CardContent>
        </Card>

        {/* Message Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Message Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose dark:prose-invert max-w-none">
              <p>{broadcast.body}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the message history and analytics components.

**Business Requirements:**
1. Visualize delivery status with pie charts
2. Table view of all recipients with status
3. Filter recipients by delivery status
4. Export reports as CSV or PDF
5. Monthly/weekly analytics overview
6. Search functionality in recipient list

**Analytics Features:**
- Delivery success rate (pie chart)
- Message volume over time (bar chart)
- Per-recipient status tracking
- Export for audit/POPIA compliance
</context>

<scope>
  <in_scope>
    - DeliveryStatsChart with pie charts
    - RecipientDeliveryTable with search/filter
    - CommunicationAnalytics bar chart
    - ExportButton with CSV/PDF download
    - Enhanced broadcast detail page
    - Dashboard stats cards
  </in_scope>
  <out_of_scope>
    - Real-time status updates via WebSocket
    - Advanced filtering (date range, etc.)
    - Scheduled report emails
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Install recharts if not present
cd apps/web && pnpm add recharts

# 2. Create chart components
# Create apps/web/src/components/communications/delivery-stats-chart.tsx
# Create apps/web/src/components/communications/communication-analytics.tsx

# 3. Create table component
# Create apps/web/src/components/communications/recipient-delivery-table.tsx

# 4. Create export button
# Create apps/web/src/components/communications/export-button.tsx

# 5. Update broadcast detail page
# Edit apps/web/src/app/(dashboard)/communications/[id]/page.tsx

# 6. Update dashboard page with stats
# Edit apps/web/src/app/(dashboard)/communications/page.tsx

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Charts responsive and readable on mobile
    - Table pagination for large recipient lists
    - Export downloads work correctly
    - Status icons clearly indicate state
    - Color coding matches status meaning
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Manual: View broadcast detail page
    - Manual: See delivery pie charts
    - Manual: Search recipients in table
    - Manual: Filter by status
    - Manual: Export CSV
    - Manual: Export PDF
    - Manual: Dashboard stats display
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Load all recipients at once (paginate)
  - Block UI during export
  - Use inline SVG for charts (use recharts)
  - Show sensitive data in exports
</anti_patterns>

</task_spec>
