/**
 * MailgunModule
 *
 * Provides Mailgun email service for the application.
 */

import { Module, Global } from '@nestjs/common';
import { MailgunService } from './mailgun.service';
import { CommsGuardService } from '../../common/services/comms-guard/comms-guard.service';

@Global()
@Module({
  providers: [CommsGuardService, MailgunService],
  exports: [CommsGuardService, MailgunService],
})
export class MailgunModule {}
