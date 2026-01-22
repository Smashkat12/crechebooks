/**
 * CSP Violation Report Controller
 * TASK-SEC-103: CSP Headers - XSS protection
 *
 * Handles Content Security Policy violation reports from browsers.
 * Logs violations for monitoring and analysis.
 *
 * CRITICAL: This endpoint must be public (no auth) to receive reports
 * from browsers before authentication context is established.
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  CspViolationReportDto,
  CspViolationLogEntry,
} from './dto/csp-violation-report.dto';

/**
 * CSP Violation Report Controller
 *
 * Receives and logs CSP violation reports from browsers.
 * This endpoint is public (no auth required) as browsers
 * may send reports before user authentication.
 */
@Controller('csp-report')
@ApiTags('Security')
@Public()
@SkipThrottle() // CSP reports should not be rate-limited
export class CspReportController {
  private readonly logger = new Logger(CspReportController.name);

  /**
   * Handle CSP violation reports
   *
   * Browsers send CSP violation reports as JSON with content-type
   * 'application/csp-report' or 'application/json'.
   *
   * @param report - The CSP violation report
   * @param req - The request object for additional context
   * @param userAgent - Browser user agent
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiExcludeEndpoint() // Hide from Swagger docs - internal use only
  @ApiOperation({
    summary: 'Handle CSP violation reports',
    description:
      'Receives Content Security Policy violation reports from browsers. ' +
      'This endpoint is public to allow browsers to report violations.',
  })
  @ApiResponse({
    status: 204,
    description: 'Violation report received and logged',
  })
  handleReport(
    @Body() report: CspViolationReportDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ): void {
    const violation = report['csp-report'];

    if (!violation) {
      this.logger.warn('Received CSP report without csp-report body');
      return;
    }

    // Build structured log entry
    const logEntry: CspViolationLogEntry = {
      timestamp: new Date().toISOString(),
      documentUri: violation['document-uri'] || 'unknown',
      blockedUri: violation['blocked-uri'] || 'unknown',
      violatedDirective: violation['violated-directive'] || 'unknown',
      effectiveDirective: violation['effective-directive'] || 'unknown',
      originalPolicy: violation['original-policy'] || 'unknown',
      sourceFile: violation['source-file'],
      lineNumber: violation['line-number'],
      columnNumber: violation['column-number'],
      scriptSample: violation['script-sample'],
      disposition: violation.disposition || 'enforce',
      referrer: violation.referrer,
      userAgent: userAgent,
      ip: this.getClientIp(req),
    };

    // Log the violation
    this.logViolation(logEntry);
  }

  /**
   * Log a CSP violation with appropriate severity
   */
  private logViolation(entry: CspViolationLogEntry): void {
    // Determine if this is a real attack or likely a false positive
    const severity = this.assessSeverity(entry);

    const logMessage = {
      message: 'CSP violation detected',
      severity,
      violation: {
        blockedUri: entry.blockedUri,
        violatedDirective: entry.violatedDirective,
        effectiveDirective: entry.effectiveDirective,
        documentUri: entry.documentUri,
        sourceFile: entry.sourceFile,
        lineNumber: entry.lineNumber,
        columnNumber: entry.columnNumber,
        disposition: entry.disposition,
      },
      context: {
        ip: entry.ip,
        userAgent: entry.userAgent,
        timestamp: entry.timestamp,
      },
    };

    if (severity === 'high') {
      this.logger.error(JSON.stringify(logMessage));
    } else if (severity === 'medium') {
      this.logger.warn(JSON.stringify(logMessage));
    } else {
      this.logger.debug(JSON.stringify(logMessage));
    }
  }

  /**
   * Assess the severity of a CSP violation
   *
   * High severity: Likely real XSS attempt
   * Medium severity: Suspicious but may be false positive
   * Low severity: Likely false positive (e.g., browser extensions)
   */
  private assessSeverity(
    entry: CspViolationLogEntry,
  ): 'high' | 'medium' | 'low' {
    const blockedUri = entry.blockedUri.toLowerCase();
    const violatedDirective = entry.violatedDirective.toLowerCase();

    // High severity: Script injection from unknown sources
    if (violatedDirective.includes('script-src')) {
      // External scripts from unknown domains
      if (blockedUri.startsWith('http') && !this.isKnownSource(blockedUri)) {
        return 'high';
      }
      // Inline script blocked
      if (blockedUri === 'inline' || blockedUri === "'unsafe-inline'") {
        return 'medium';
      }
      // Eval blocked
      if (blockedUri === 'eval' || blockedUri === "'unsafe-eval'") {
        return 'high';
      }
    }

    // High severity: Object/embed injection
    if (violatedDirective.includes('object-src')) {
      return 'high';
    }

    // High severity: Base URI manipulation (base tag injection)
    if (violatedDirective.includes('base-uri')) {
      return 'high';
    }

    // Medium severity: Frame violations (potential clickjacking)
    if (violatedDirective.includes('frame-ancestors')) {
      return 'medium';
    }

    // Low severity: Browser extensions, known false positives
    if (this.isLikelyFalsePositive(entry)) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Check if a blocked URI is from a known legitimate source
   */
  private isKnownSource(uri: string): boolean {
    const knownSources = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.jsdelivr.net',
      'api.xero.com',
      'simplepay.co.za',
      'identity.xero.com',
    ];

    return knownSources.some((source) => uri.includes(source));
  }

  /**
   * Check if a violation is likely a false positive
   */
  private isLikelyFalsePositive(entry: CspViolationLogEntry): boolean {
    const blockedUri = entry.blockedUri.toLowerCase();
    const sourceFile = (entry.sourceFile || '').toLowerCase();

    // Browser extension patterns
    if (
      blockedUri.startsWith('chrome-extension://') ||
      blockedUri.startsWith('moz-extension://') ||
      blockedUri.startsWith('safari-extension://')
    ) {
      return true;
    }

    // Browser internal pages
    if (blockedUri.startsWith('about:') || blockedUri.startsWith('blob:')) {
      return true;
    }

    // Source from extension
    if (sourceFile.includes('extension') || sourceFile.includes('chrome://')) {
      return true;
    }

    return false;
  }

  /**
   * Get client IP from request
   */
  private getClientIp(req: Request): string {
    // Check X-Forwarded-For header (for reverse proxies)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // Check X-Real-IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to socket remote address
    return req.socket?.remoteAddress || 'unknown';
  }
}
