import { Module } from '@nestjs/common';
import { ParentController } from './parent.controller';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ParentController],
  providers: [ParentRepository],
  exports: [ParentRepository],
})
export class ParentsModule {}
