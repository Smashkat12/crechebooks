import { Module } from '@nestjs/common';
import { ParentController } from './parent.controller';
import { ParentPortalController } from './parent-portal.controller';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../../notifications/notification.module';
import { ParentPortalChildService } from './parent-portal-child.service';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationModule],
  controllers: [ParentController, ParentPortalController],
  providers: [ParentRepository, ParentPortalChildService],
  exports: [ParentRepository],
})
export class ParentsModule {}
