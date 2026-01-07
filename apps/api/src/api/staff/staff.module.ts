import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffOnboardingController } from './onboarding.controller';
import {
  StaffOffboardingController,
  StaffOffboardingsController,
} from './offboarding.controller';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { DatabaseModule } from '../../database/database.module';
import { EmailModule } from '../../integrations/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [
    StaffController,
    StaffOnboardingController,
    StaffOffboardingController,
    StaffOffboardingsController,
  ],
  providers: [StaffRepository],
  exports: [StaffRepository],
})
export class StaffModule {}
