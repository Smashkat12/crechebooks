/**
 * CommsGuardService
 *
 * Reads the COMMS_DISABLED environment variable and exposes a single
 * isDisabled() predicate. When true, all outbound communication adapters
 * (MailgunService, EmailService, TwilioWhatsAppService) short-circuit their
 * send paths and return a mocked response without hitting external APIs.
 *
 * Usage: inject into an adapter, call this.commsGuard.isDisabled() before send.
 *
 * Intended for staging environments where real parent data exists and
 * accidental outbound messages must be prevented. Set COMMS_DISABLED=true
 * in the Railway staging environment to activate.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CommsGuardService implements OnModuleInit {
  private readonly logger = new Logger(CommsGuardService.name);
  private readonly disabled: boolean;

  constructor() {
    const raw = process.env.COMMS_DISABLED ?? 'false';
    this.disabled = raw.toLowerCase() === 'true';
  }

  onModuleInit(): void {
    if (this.disabled) {
      this.logger.warn(
        'COMMS_DISABLED=true: all outbound comms are mocked. ' +
          'No emails, SMS, or WhatsApp messages will be sent.',
      );
    }
  }

  /**
   * Returns true when outbound communications should be suppressed.
   */
  isDisabled(): boolean {
    return this.disabled;
  }
}
