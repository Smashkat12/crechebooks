import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ParentAttendanceController } from './parent-attendance.controller';
import { ParentAbsenceController } from './parent-absence.controller';
import { AttendanceService } from './attendance.service';
import { ParentAbsenceService } from './parent-absence.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    AttendanceController,
    ParentAttendanceController,
    ParentAbsenceController,
  ],
  providers: [AttendanceService, ParentAbsenceService],
  exports: [AttendanceService, ParentAbsenceService],
})
export class AttendanceModule {}
