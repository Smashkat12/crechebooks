import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../../notifications/notification.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationController } from './notification.controller';
import { ParentNotificationController } from './parent-notification.controller';
import { StaffNotificationController } from './staff-notification.controller';

@Module({
  imports: [DatabaseModule, NotificationModule, AuthModule],
  controllers: [
    NotificationController,
    ParentNotificationController,
    StaffNotificationController,
  ],
})
export class NotificationApiModule {}
