/**
 * Yoco Payment Gateway Module
 * TASK-ACCT-011: Online Payment Gateway Integration
 *
 * Provides YocoService for payment link creation, checkout initiation,
 * and webhook processing.
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YocoService } from './yoco.service';
import { YocoController } from './yoco.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, forwardRef(() => DatabaseModule)],
  controllers: [YocoController],
  providers: [YocoService],
  exports: [YocoService],
})
export class YocoModule {}
