/**
 * SARS Integration Module
 * TASK-SARS-019: SARS eFiling API Real Integration
 *
 * Provides SARS eFiling services for VAT201 submissions.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SarsEfilingClient } from './sars-efiling.client';

@Module({
  imports: [ConfigModule],
  providers: [SarsEfilingClient],
  exports: [SarsEfilingClient],
})
export class SarsModule {}
