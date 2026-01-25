import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffOnboardingController } from './onboarding.controller';
import {
  StaffOffboardingController,
  StaffOffboardingsController,
} from './offboarding.controller';
import { LeaveController } from './leave.controller';
import { StaffPortalController } from './staff-portal.controller';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import { DatabaseModule } from '../../database/database.module';
import { EmailModule } from '../../integrations/email/email.module';
import { SimplePayModule } from '../../integrations/simplepay/simplepay.module';

@Module({
  imports: [DatabaseModule, EmailModule, SimplePayModule],
  controllers: [
    StaffController,
    StaffOnboardingController,
    StaffOffboardingController,
    StaffOffboardingsController,
    LeaveController,
    StaffPortalController,
  ],
  providers: [
    StaffRepository,
    LeaveRequestRepository,
  ],
  exports: [StaffRepository, LeaveRequestRepository],
})
export class StaffModule {}
