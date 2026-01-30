/**
 * Reports Module
 * TASK-REPORTS-002: Reports API Module
 * TASK-REPORTS-003: Enhanced PDF Generation with AI Insights
 *
 * @module modules/reports/reports.module
 * @description NestJS module for reports API - data, AI insights, and exports.
 */

import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { DatabaseModule } from '../../database/database.module';
import { ReportSynthesisModule } from '../../agents/report-synthesis';

@Module({
  imports: [DatabaseModule, ReportSynthesisModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfGeneratorService],
  exports: [ReportsService, PdfGeneratorService],
})
export class ReportsModule {}
