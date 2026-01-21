'use client';

/**
 * Recipient Delivery Table Component
 * TASK-COMM-006: Message History and Analytics UI
 */

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
import { CheckCircle, XCircle, Clock, Eye, MessageSquare, Search } from 'lucide-react';

interface MessageRecipient {
  id: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  emailStatus?: string;
  emailSentAt?: string;
  whatsappStatus?: string;
  whatsappSentAt?: string;
  lastError?: string;
}

interface RecipientDeliveryTableProps {
  recipients: MessageRecipient[];
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, color: 'text-yellow-500' },
  sent: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-blue-500' },
  delivered: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-500' },
  opened: { icon: <Eye className="h-4 w-4" />, color: 'text-purple-500' },
  read: { icon: <MessageSquare className="h-4 w-4" />, color: 'text-purple-500' },
  failed: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-500' },
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-muted-foreground">-</span>;

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant="outline" className="gap-1">
      <span className={config.color}>{config.icon}</span>
      <span className="capitalize">{status}</span>
    </Badge>
  );
}

export function RecipientDeliveryTable({ recipients }: RecipientDeliveryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRecipients = recipients.filter((r) => {
    const matchesSearch =
      r.recipientName.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientEmail?.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientPhone?.includes(search);

    const status = r.emailStatus ?? r.whatsappStatus ?? 'pending';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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

      <div className="rounded-md border">
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
            {filteredRecipients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No recipients found matching your filters
                </TableCell>
              </TableRow>
            ) : (
              filteredRecipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{recipient.recipientName}</div>
                      <div className="text-sm text-muted-foreground">
                        {recipient.recipientEmail || recipient.recipientPhone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={recipient.emailStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={recipient.whatsappStatus} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {recipient.emailSentAt || recipient.whatsappSentAt
                        ? new Date(
                            recipient.emailSentAt ?? recipient.whatsappSentAt!
                          ).toLocaleString()
                        : '-'}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
