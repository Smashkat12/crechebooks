/**
 * WhatsAppModule
 * TASK-BILL-015: WhatsApp Business API Integration
 *
 * Provides WhatsApp Business API integration for invoice delivery
 * and reminders via Meta Cloud API.
 */

import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
