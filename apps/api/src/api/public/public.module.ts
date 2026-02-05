/**
 * Public API Module
 * Handles unauthenticated public endpoints (contact, demo, signup, quotes, documents)
 *
 * TASK-QUOTE-002: Added PublicQuoteController for quote acceptance portal
 * TASK-WA-010: Added PublicDocumentController for signed document URLs
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma';
import { DatabaseModule } from '../../database/database.module';
import { EmailModule } from '../../common/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';
import { ContactController } from './contact/contact.controller';
import { ContactService } from './contact/contact.service';
import { DemoRequestController } from './demo/demo-request.controller';
import { DemoRequestService } from './demo/demo-request.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { PublicQuoteController } from './quotes/public-quote.controller';
import { PublicDocumentController } from './documents/public-document.controller';

@Module({
  imports: [
    PrismaModule,
    DatabaseModule,
    EmailModule,
    AuthModule,
    WhatsAppModule,
  ],
  controllers: [
    ContactController,
    DemoRequestController,
    SignupController,
    PublicQuoteController,
    PublicDocumentController,
  ],
  providers: [ContactService, DemoRequestService, SignupService],
  exports: [ContactService, DemoRequestService, SignupService],
})
export class PublicModule {}
