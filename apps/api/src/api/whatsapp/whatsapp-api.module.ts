/**
 * WhatsApp API Module
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * Provides REST API endpoints for WhatsApp management.
 */

import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [WhatsAppModule, DatabaseModule],
  controllers: [WhatsAppController],
})
export class WhatsAppApiModule {}
