import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { ParentAttendanceController } from './parent-attendance.controller';
import { AttendanceService } from './attendance.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AttendanceController, ParentAttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
