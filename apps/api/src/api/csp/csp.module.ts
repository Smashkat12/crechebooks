/**
 * CSP Module
 * TASK-SEC-103: CSP Headers - XSS protection
 *
 * Module for Content Security Policy handling including:
 * - CSP configuration service
 * - CSP violation report controller
 */

import { Module } from '@nestjs/common';
import { CspReportController } from './csp-report.controller';
import { CspConfigService } from '../../common/security/csp-config.service';

@Module({
  controllers: [CspReportController],
  providers: [CspConfigService],
  exports: [CspConfigService],
})
export class CspModule {}
