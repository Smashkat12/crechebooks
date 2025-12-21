import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [AuthModule, TransactionModule],
  exports: [AuthModule, TransactionModule],
})
export class ApiModule {}
