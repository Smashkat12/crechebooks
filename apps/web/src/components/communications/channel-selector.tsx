'use client';

/**
 * Channel Selector Component
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { Mail, MessageSquare, Phone, Globe } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const channels = [
  {
    id: 'email',
    name: 'Email',
    description: 'Send via email',
    icon: Mail,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Send via WhatsApp',
    icon: MessageSquare,
  },
  {
    id: 'sms',
    name: 'SMS',
    description: 'Send via SMS',
    icon: Phone,
  },
  {
    id: 'all',
    name: 'All Channels',
    description: 'Send via all available channels',
    icon: Globe,
  },
];

interface ChannelSelectorProps {
  value: string;
  onChange: (channel: string) => void;
}

export function ChannelSelector({ value, onChange }: ChannelSelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Communication Channel</Label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const isSelected = value === channel.id;

          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onChange(channel.id)}
              className={cn(
                'flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              )}
            >
              <Icon
                className={cn(
                  'h-6 w-6 mb-2',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}
              >
                {channel.name}
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {channel.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
