import { Module } from '@nestjs/common';
import { ParentController } from './parent.controller';
import { ParentPortalController } from './parent-portal.controller';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ParentController, ParentPortalController],
  providers: [ParentRepository],
  exports: [ParentRepository],
})
export class ParentsModule {}
