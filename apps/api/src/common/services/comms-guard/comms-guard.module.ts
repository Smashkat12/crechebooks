/**
 * CommsGuardModule
 *
 * Global module that provides the CommsGuardService — the staging safety
 * gate that suppresses outbound communications (email, SMS, WhatsApp) when
 * COMMS_DISABLED=true.
 *
 * Previously CommsGuardService was provided by MailgunModule (@Global()).
 * When MailgunModule was retired as part of the email consolidation
 * refactor, the guard moved into its own dedicated global module so that
 * every adapter (EmailService, TwilioWhatsAppService, InvoiceDeliveryService)
 * can inject it without pulling in an unrelated integration module.
 *
 * Import once at the app root — the @Global() decorator makes it available
 * everywhere without further imports.
 */

import { Global, Module } from '@nestjs/common';
import { CommsGuardService } from './comms-guard.service';

@Global()
@Module({
  providers: [CommsGuardService],
  exports: [CommsGuardService],
})
export class CommsGuardModule {}
