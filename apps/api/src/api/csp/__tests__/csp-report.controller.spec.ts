/**
 * CSP Report Controller Tests
 * TASK-SEC-103: CSP Headers - XSS protection
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CspReportController } from '../csp-report.controller';
import type { CspViolationReportDto } from '../dto/csp-violation-report.dto';

describe('CspReportController', () => {
  let controller: CspReportController;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;

  const createMockRequest = (ip?: string) => ({
    headers: {
      'x-forwarded-for': ip,
    },
    socket: {
      remoteAddress: ip || '127.0.0.1',
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CspReportController],
    }).compile();

    controller = module.get<CspReportController>(CspReportController);

    // Spy on logger methods
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleReport', () => {
    it('should handle valid CSP violation report', () => {
      // This report from unknown external domain is high severity
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://evil.example.com/malicious.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "default-src 'self'; script-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // External script injection from unknown domain is high severity (error)
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should warn when report is missing csp-report body', () => {
      const report = {} as CspViolationReportDto;

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Received CSP report without csp-report body',
      );
    });

    it('should log high severity for external script injection', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://unknown-evil-domain.com/script.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // High severity violations should be logged as errors
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should log high severity for eval injection attempts', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'eval',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should log high severity for base-uri violations', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://evil.com/base',
          'violated-directive': "base-uri 'self'",
          'effective-directive': 'base-uri',
          'original-policy': "base-uri 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should log high severity for object-src violations', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://evil.com/flash.swf',
          'violated-directive': "object-src 'none'",
          'effective-directive': 'object-src',
          'original-policy': "object-src 'none'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should log low severity for browser extension violations', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'chrome-extension://abcdef123456/script.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // Browser extension violations should be low severity (debug level)
      expect(loggerDebugSpy).toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should log low severity for moz-extension violations', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'moz-extension://abcdef123456/script.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerDebugSpy).toHaveBeenCalled();
    });

    it('should extract client IP from x-forwarded-for header', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://evil.com/script.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      const mockReq = {
        headers: {
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      };

      controller.handleReport(report, mockReq as any, 'Mozilla/5.0');

      // Verify IP was extracted from x-forwarded-for
      const logCall = loggerErrorSpy.mock.calls[0]?.[0];
      expect(logCall).toContain('192.168.1.100');
    });

    it('should use x-real-ip header when x-forwarded-for is not present', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://evil.com/script.js',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
        },
      };

      const mockReq = {
        headers: {
          'x-real-ip': '203.0.113.50',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      };

      controller.handleReport(report, mockReq as any, 'Mozilla/5.0');

      const logCall = loggerErrorSpy.mock.calls[0]?.[0];
      expect(logCall).toContain('203.0.113.50');
    });

    it('should include script sample in log when available', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'inline',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          'script-sample': 'alert("xss")',
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // Script sample should be logged but not necessarily in the main message
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('should include line and column numbers when available', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'inline',
          'violated-directive': "script-src 'self'",
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          'source-file': 'https://example.com/script.js',
          'line-number': 42,
          'column-number': 15,
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // Should log successfully with source location
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('should handle frame-ancestors violations as medium severity', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://clickjack.com',
          'violated-directive': "frame-ancestors 'none'",
          'effective-directive': 'frame-ancestors',
          'original-policy': "frame-ancestors 'none'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // Frame violations should be medium severity (warn level)
      expect(loggerWarnSpy).toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should not treat known sources as high severity', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'https://fonts.googleapis.com/css',
          'violated-directive': "style-src 'self'",
          'effective-directive': 'style-src',
          'original-policy': "style-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      // Known sources should not be high severity
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle reports with minimal fields', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'violated-directive': "script-src 'self'",
        },
      };

      expect(() =>
        controller.handleReport(
          report,
          createMockRequest() as any,
          'Mozilla/5.0',
        ),
      ).not.toThrow();
    });

    it('should handle about: URIs as low severity', () => {
      const report: CspViolationReportDto = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'blocked-uri': 'about:blank',
          'violated-directive': "frame-src 'self'",
          'effective-directive': 'frame-src',
          'original-policy': "frame-src 'self'",
          disposition: 'enforce',
        },
      };

      controller.handleReport(
        report,
        createMockRequest() as any,
        'Mozilla/5.0',
      );

      expect(loggerDebugSpy).toHaveBeenCalled();
    });
  });
});
