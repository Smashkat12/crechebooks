/**
 * SARS Module
 * TASK-SARS-017: SARS Deadline Reminder System
 *
 * Provides SARS deadline tracking and reminder services.
 */

import { Module } from '@nestjs/common';
import { SarsDeadlineService } from './sars-deadline.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [SarsDeadlineService],
  exports: [SarsDeadlineService],
})
export class SarsSchedulerModule {}
