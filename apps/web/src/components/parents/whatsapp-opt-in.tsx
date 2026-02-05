'use client';

/**
 * WhatsApp Opt-In Component
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * Toggle switch for enabling/disabling WhatsApp notifications for a parent.
 * Includes POPIA consent notice and phone number display.
 */

import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWhatsApp, useWhatsAppStatus } from '@/hooks/use-whatsapp';
import { useToast } from '@/hooks/use-toast';

interface WhatsAppOptInProps {
  parentId: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  initialOptedIn?: boolean;
}

/**
 * Format phone number for display (+27 XX XXX XXXX)
 */
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return 'No phone number';

  // Remove non-digit characters except leading +
  const digits = phone.replace(/[^\d+]/g, '');

  // If it's a +27 number, format nicely
  if (digits.startsWith('+27') && digits.length === 12) {
    return `+27 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  // If it's just digits starting with 27
  if (digits.startsWith('27') && digits.length === 11) {
    return `+27 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  // Return as-is if we can't format it
  return phone;
}

export function WhatsAppOptIn({
  parentId,
  phone,
  whatsappNumber,
  initialOptedIn = false,
}: WhatsAppOptInProps) {
  const [optedIn, setOptedIn] = useState(initialOptedIn);
  const { updateOptIn, isLoading } = useWhatsApp();
  const { status, isLoading: statusLoading } = useWhatsAppStatus(parentId);
  const { toast } = useToast();

  // Sync with server status when loaded
  useEffect(() => {
    if (status) {
      setOptedIn(status.optedIn);
    }
  }, [status]);

  // Determine the phone number to display (prefer whatsapp field, fallback to phone)
  const displayPhone = whatsappNumber || phone || status?.whatsappPhone;
  const hasPhone = !!displayPhone;

  const handleToggle = async (checked: boolean) => {
    if (!hasPhone) {
      toast({
        title: 'Error',
        description: 'No phone number available for WhatsApp',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await updateOptIn(parentId, checked);
      if (result.success) {
        setOptedIn(checked);
        toast({
          title: 'Success',
          description: checked ? 'WhatsApp notifications enabled' : 'WhatsApp notifications disabled',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update WhatsApp preference',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to update WhatsApp preference:', error);
      toast({
        title: 'Error',
        description: 'Failed to update WhatsApp preference',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          WhatsApp Notifications
          {optedIn && (
            <Badge variant="outline" className="text-green-600 border-green-600 ml-2">
              Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Send invoices, reminders, and statements via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="whatsapp-opt-in">Enable WhatsApp</Label>
            <p className="text-sm text-muted-foreground">
              {hasPhone ? (
                <>Messages will be sent to {formatPhoneDisplay(displayPhone)}</>
              ) : (
                <span className="text-amber-600">No phone number available</span>
              )}
            </p>
          </div>
          <Switch
            id="whatsapp-opt-in"
            checked={optedIn}
            onCheckedChange={handleToggle}
            disabled={isLoading || statusLoading || !hasPhone}
          />
        </div>
        {optedIn && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <strong>POPIA Notice:</strong> The parent has consented to receive communications via WhatsApp.
              This consent was recorded when opt-in was enabled. They can opt out at any time by
              replying STOP to any message or disabling this toggle.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
