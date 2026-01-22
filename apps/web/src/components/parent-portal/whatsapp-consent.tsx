'use client';

/**
 * WhatsApp Consent Component
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * POPIA-compliant WhatsApp opt-in component:
 * - Clear explanation of what WhatsApp will be used for
 * - Consent must be explicit (not pre-checked)
 * - Must record consent timestamp
 * - Easy to withdraw consent
 * - Link to privacy policy
 * - Display purposes: "Invoice delivery, payment reminders, school notices"
 */

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/utils';

interface WhatsAppConsentProps {
  isOptedIn: boolean;
  consentTimestamp: string | null;
  onOptInChange: (optedIn: boolean) => void;
  isLoading?: boolean;
  privacyPolicyUrl?: string;
  termsUrl?: string;
}

export function WhatsAppConsent({
  isOptedIn,
  consentTimestamp,
  onOptInChange,
  isLoading = false,
  privacyPolicyUrl = '/privacy-policy',
  termsUrl = '/terms-of-service',
}: WhatsAppConsentProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Show confirmation message briefly when opted in
  useEffect(() => {
    if (isOptedIn && consentTimestamp) {
      setShowConfirmation(true);
      const timer = setTimeout(() => setShowConfirmation(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOptedIn, consentTimestamp]);

  const handleToggle = (checked: boolean) => {
    onOptInChange(checked);
  };

  return (
    <div className="space-y-4">
      {/* Main Consent Card */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* WhatsApp Icon */}
            <div className="rounded-full bg-green-500/10 p-2 shrink-0">
              <svg
                className="h-5 w-5 text-green-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">WhatsApp Communications</h4>
                {isOptedIn && (
                  <Badge variant="success" className="text-xs">
                    Enabled
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Receive important updates via WhatsApp
              </p>
            </div>
          </div>

          {/* Toggle */}
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              id="whatsapp-consent"
              checked={isOptedIn}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* POPIA Consent Notice */}
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-200 text-sm">
            POPIA Consent Notice
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs space-y-2">
            <p>
              By enabling WhatsApp communications, you consent to receiving the following
              messages via WhatsApp:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Invoice delivery and payment confirmations</li>
              <li>Payment reminders before due dates</li>
              <li>Important school notices and updates</li>
              <li>Emergency communications</li>
            </ul>
            <p className="pt-1">
              Your phone number will be used solely for these purposes. You can withdraw
              consent at any time by toggling this setting off.
            </p>
          </AlertDescription>
        </Alert>

        {/* Consent Status */}
        {isOptedIn && consentTimestamp && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span>
              Consent given on{' '}
              <span className="font-medium text-foreground">
                {formatDateTime(consentTimestamp)}
              </span>
            </span>
          </div>
        )}

        {/* Success Message */}
        {showConfirmation && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              WhatsApp communications enabled. You will receive messages at your registered
              phone number.
            </AlertDescription>
          </Alert>
        )}

        {/* Privacy Links */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline transition-colors"
          >
            Privacy Policy
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline transition-colors"
          >
            Terms of Service
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-muted-foreground/70">
            POPIA compliant
          </span>
        </div>
      </div>

      {/* Additional Info for Disabled State */}
      {!isOptedIn && (
        <p className="text-xs text-muted-foreground">
          Enable WhatsApp to receive invoices and reminders directly on your phone.
          Standard data rates may apply.
        </p>
      )}
    </div>
  );
}
