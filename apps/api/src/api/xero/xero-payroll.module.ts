/**
 * Xero Payroll Module
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * NestJS module for Xero payroll journal integration including:
 * - Payroll journal creation, posting, and management
 * - Account mapping configuration
 *
 * NOTE: This is separate from the main XeroModule (integrations/xero)
 * which handles bank feed sync. This module focuses on payroll journals.
 */

import { Module } from '@nestjs/common';
import {
  XeroPayrollJournalController,
  XeroAccountMappingController,
} from './payroll-journal.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [XeroPayrollJournalController, XeroAccountMappingController],
})
export class XeroPayrollModule {}
