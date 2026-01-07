/**
 * Integrations Module
 * Groups all external integration controllers
 * TASK-STAFF-004: SimplePay Integration
 */

import { Module } from '@nestjs/common';
import { SimplePayModule } from '../../integrations/simplepay/simplepay.module';
import { SimplePayController } from './simplepay.controller';

@Module({
  imports: [SimplePayModule],
  controllers: [SimplePayController],
})
export class IntegrationsModule {}
