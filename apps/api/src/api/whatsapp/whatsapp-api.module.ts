/**
 * WhatsApp API Module
 * TASK-WA-004: WhatsApp Opt-In UI Components
 * Item #12: Admin inbox + parent portal messages (Steps 3-4)
 *
 * Provides REST API endpoints for WhatsApp management.
 */

import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { AdminMessagesController } from './admin-messages.controller';
import { ParentMessagesController } from './parent-messages.controller';
import { AdminMessagesService } from './admin-messages.service';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../../api/auth/auth.module';

@Module({
  imports: [WhatsAppModule, DatabaseModule, AuthModule],
  controllers: [
    WhatsAppController,
    AdminMessagesController,
    ParentMessagesController,
  ],
  providers: [AdminMessagesService],
  exports: [AdminMessagesService],
})
export class WhatsAppApiModule {}
