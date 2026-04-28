/**
 * AdminMessagesModule
 * Item #12 — Step 3: admin WhatsApp inbox.
 *
 * Registered in ApiModule (extends the existing WhatsAppApiModule pattern).
 */

import { Module } from '@nestjs/common';
import { AdminMessagesController } from './admin-messages.controller';
import { AdminMessagesService } from './admin-messages.service';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [WhatsAppModule, DatabaseModule],
  controllers: [AdminMessagesController],
  providers: [AdminMessagesService],
  exports: [AdminMessagesService],
})
export class AdminMessagesModule {}
