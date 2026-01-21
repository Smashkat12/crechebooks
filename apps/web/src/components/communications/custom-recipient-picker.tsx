'use client';

/**
 * Custom Recipient Picker Component
 * TASK-COMM-005: Recipient Selection Component
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Users, X } from 'lucide-react';

interface Recipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface CustomRecipientPickerProps {
  recipientType: string;
  value: string[];
  onChange: (selectedIds: string[]) => void;
}

export function CustomRecipientPicker({
  recipientType,
  value,
  onChange,
}: CustomRecipientPickerProps) {
  const [search, setSearch] = useState('');

  // Fetch recipients based on type
  const { data: recipients, isLoading } = useQuery({
    queryKey: ['recipients', recipientType],
    queryFn: async () => {
      const endpoint = recipientType === 'parent'
        ? endpoints.parents.list
        : endpoints.staff.list;
      const response = await apiClient.get<{ data: Recipient[] }>(endpoint);
      return response.data.data ?? [];
    },
  });

  // Filter by search
  const filteredRecipients = (recipients ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleRecipient = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const selectAll = () => {
    onChange(filteredRecipients.map((r) => r.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={selectAll}
          className="text-sm text-primary hover:underline"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-muted-foreground hover:underline"
        >
          Clear
        </button>
      </div>

      {/* Selected count */}
      {value.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <Users className="mr-1 h-3 w-3" />
            {value.length} selected
          </Badge>
          <button
            type="button"
            onClick={clearAll}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Recipients list */}
      <ScrollArea className="h-[300px] rounded-md border">
        <div className="p-4 space-y-2">
          {filteredRecipients.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No recipients found
            </p>
          ) : (
            filteredRecipients.map((recipient) => (
              <div
                key={recipient.id}
                className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent cursor-pointer"
                onClick={() => toggleRecipient(recipient.id)}
              >
                <Checkbox
                  checked={value.includes(recipient.id)}
                  onCheckedChange={() => toggleRecipient(recipient.id)}
                />
                <div className="flex-1">
                  <div className="font-medium">{recipient.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {recipient.email || recipient.phone}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
