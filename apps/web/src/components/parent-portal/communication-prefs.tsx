'use client';

/**
 * Communication Preferences Component
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * Manages communication preferences:
 * - Invoice delivery method (Email, WhatsApp, Both)
 * - Payment reminder toggle
 * - Email notifications toggle
 * - Marketing opt-in toggle
 * - Save preferences button
 */

import { useState, useEffect } from 'react';
import { Loader2, Save, Mail, Bell, Megaphone, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CommunicationPreferences } from '@/hooks/parent-portal/use-parent-profile';

interface CommunicationPrefsProps {
  preferences: CommunicationPreferences;
  onSave: (prefs: Partial<CommunicationPreferences>) => Promise<void>;
  isLoading?: boolean;
}

export function CommunicationPrefs({
  preferences,
  onSave,
  isLoading = false,
}: CommunicationPrefsProps) {
  // Form state
  const [invoiceDelivery, setInvoiceDelivery] = useState<CommunicationPreferences['invoiceDelivery']>(
    preferences.invoiceDelivery
  );
  const [paymentReminders, setPaymentReminders] = useState(preferences.paymentReminders);
  const [emailNotifications, setEmailNotifications] = useState(preferences.emailNotifications);
  const [marketingOptIn, setMarketingOptIn] = useState(preferences.marketingOptIn);

  // Update form state when preferences prop changes
  useEffect(() => {
    setInvoiceDelivery(preferences.invoiceDelivery);
    setPaymentReminders(preferences.paymentReminders);
    setEmailNotifications(preferences.emailNotifications);
    setMarketingOptIn(preferences.marketingOptIn);
  }, [preferences]);

  const hasChanges =
    invoiceDelivery !== preferences.invoiceDelivery ||
    paymentReminders !== preferences.paymentReminders ||
    emailNotifications !== preferences.emailNotifications ||
    marketingOptIn !== preferences.marketingOptIn;

  const handleSave = async () => {
    await onSave({
      invoiceDelivery,
      paymentReminders,
      emailNotifications,
      marketingOptIn,
    });
  };

  return (
    <div className="space-y-6">
      {/* Invoice Delivery Method */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="invoiceDelivery" className="font-medium">
            Invoice Delivery
          </Label>
        </div>
        <Select
          value={invoiceDelivery}
          onValueChange={(value) => setInvoiceDelivery(value as CommunicationPreferences['invoiceDelivery'])}
        >
          <SelectTrigger id="invoiceDelivery" className="w-full sm:w-[200px]">
            <SelectValue placeholder="Select delivery method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Only
              </span>
            </SelectItem>
            <SelectItem value="whatsapp">
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Only
              </span>
            </SelectItem>
            <SelectItem value="both">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Both Email & WhatsApp
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose how you want to receive invoices
        </p>
      </div>

      {/* Payment Reminders */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="paymentReminders" className="font-medium cursor-pointer">
              Payment Reminders
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Receive reminders before payment due dates
          </p>
        </div>
        <Switch
          id="paymentReminders"
          checked={paymentReminders}
          onCheckedChange={setPaymentReminders}
        />
      </div>

      {/* Email Notifications */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="emailNotifications" className="font-medium cursor-pointer">
              Email Notifications
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Receive important updates via email
          </p>
        </div>
        <Switch
          id="emailNotifications"
          checked={emailNotifications}
          onCheckedChange={setEmailNotifications}
        />
      </div>

      {/* Marketing Opt-in */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="marketingOptIn" className="font-medium cursor-pointer">
              Marketing Communications
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Receive news, promotions, and updates about events
          </p>
        </div>
        <Switch
          id="marketingOptIn"
          checked={marketingOptIn}
          onCheckedChange={setMarketingOptIn}
        />
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={isLoading || !hasChanges}
          className="min-w-32"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
