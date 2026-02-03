/**
 * Payroll Module
 * Provides payroll processing endpoints integrated with SimplePay
 */

import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollProcessingService } from '../../database/services/payroll-processing.service';
import { DatabaseModule } from '../../database/database.module';
import { SimplePayModule } from '../../integrations/simplepay/simplepay.module';

@Module({
  imports: [DatabaseModule, SimplePayModule],
  controllers: [PayrollController],
  providers: [PayrollProcessingService],
  exports: [PayrollProcessingService],
})
export class PayrollModule {}
