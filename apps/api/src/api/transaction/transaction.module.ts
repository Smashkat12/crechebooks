import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TransactionController],
})
export class TransactionModule {}
