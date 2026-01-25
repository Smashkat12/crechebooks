import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma';
import { EmailModule } from '../../common/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { ContactController } from './contact/contact.controller';
import { ContactService } from './contact/contact.service';
import { DemoRequestController } from './demo/demo-request.controller';
import { DemoRequestService } from './demo/demo-request.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';

@Module({
  imports: [PrismaModule, EmailModule, AuthModule],
  controllers: [ContactController, DemoRequestController, SignupController],
  providers: [ContactService, DemoRequestService, SignupService],
  exports: [ContactService, DemoRequestService, SignupService],
})
export class PublicModule {}
