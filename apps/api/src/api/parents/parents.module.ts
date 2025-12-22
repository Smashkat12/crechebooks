import { Module } from '@nestjs/common';
import { ParentController } from './parent.controller';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ParentController],
  providers: [ParentRepository],
  exports: [ParentRepository],
})
export class ParentsModule {}
