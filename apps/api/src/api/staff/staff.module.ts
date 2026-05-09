import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffOnboardingController } from './onboarding.controller';
import {
  StaffOffboardingController,
  StaffOffboardingsController,
} from './offboarding.controller';
import { LeaveController } from './leave.controller';
import { StaffPortalController } from './staff-portal.controller';
import { StaffInvitationController } from './staff-invitation.controller';
import { StaffInviteAcceptController } from './staff-invite-accept.controller';
import { StaffInvitationService } from './staff-invitation.service';
import { Irp5PortalService } from './irp5-portal.service';
import { Irp5PdfService } from './irp5-pdf.service';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import { DatabaseModule } from '../../database/database.module';
import { EmailModule } from '../../integrations/email/email.module';
import { SimplePayModule } from '../../integrations/simplepay/simplepay.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { MailgunModule } from '../../integrations/mailgun/mailgun.module';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    MailgunModule,
    SimplePayModule,
    AuthModule,
    StorageModule,
  ],
  controllers: [
    StaffController,
    StaffOnboardingController,
    StaffOffboardingController,
    StaffOffboardingsController,
    LeaveController,
    StaffPortalController,
    StaffInvitationController,
    StaffInviteAcceptController,
  ],
  providers: [
    StaffRepository,
    LeaveRequestRepository,
    StaffInvitationService,
    Irp5PortalService,
    Irp5PdfService,
  ],
  exports: [StaffRepository, LeaveRequestRepository, StaffInvitationService],
})
export class StaffModule {}
