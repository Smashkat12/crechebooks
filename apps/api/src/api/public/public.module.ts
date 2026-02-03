/**
 * Public API Module
 * Handles unauthenticated public endpoints (contact, demo, signup, quotes)
 *
 * TASK-QUOTE-002: Added PublicQuoteController for quote acceptance portal
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma';
import { DatabaseModule } from '../../database/database.module';
import { EmailModule } from '../../common/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { ContactController } from './contact/contact.controller';
import { ContactService } from './contact/contact.service';
import { DemoRequestController } from './demo/demo-request.controller';
import { DemoRequestService } from './demo/demo-request.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { PublicQuoteController } from './quotes/public-quote.controller';

@Module({
  imports: [PrismaModule, DatabaseModule, EmailModule, AuthModule],
  controllers: [
    ContactController,
    DemoRequestController,
    SignupController,
    PublicQuoteController,
  ],
  providers: [ContactService, DemoRequestService, SignupService],
  exports: [ContactService, DemoRequestService, SignupService],
})
export class PublicModule {}
