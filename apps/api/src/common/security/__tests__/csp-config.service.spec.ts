/**
 * CSP Configuration Service Tests
 * TASK-SEC-103: CSP Headers - XSS protection
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CspConfigService } from '../csp-config.service';

describe('CspConfigService', () => {
  let service: CspConfigService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const createMockConfigService = (
    overrides: Record<string, string | undefined> = {},
  ): jest.Mocked<ConfigService> => {
    const defaults: Record<string, string> = {
      CSP_ENABLED: 'true',
      CSP_REPORT_ONLY: 'false',
      CSP_REPORT_ENDPOINT: '/api/v1/csp-report',
      CSP_ADDITIONAL_SCRIPT_SRC: '',
      CSP_ADDITIONAL_STYLE_SRC: '',
      CSP_ADDITIONAL_CONNECT_SRC: '',
    };

    const merged = { ...defaults, ...overrides };

    return {
      get: jest.fn((key: string, defaultValue?: string) => {
        return merged[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;
  };

  beforeEach(async () => {
    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CspConfigService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CspConfigService>(CspConfigService);
  });

  describe('isEnabled', () => {
    it('should return true when CSP_ENABLED is true', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when CSP_ENABLED is false', async () => {
      mockConfigService = createMockConfigService({ CSP_ENABLED: 'false' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const disabledService = module.get<CspConfigService>(CspConfigService);
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('isReportOnly', () => {
    it('should return false by default in non-production', () => {
      expect(service.isReportOnly()).toBe(false);
    });

    it('should return true when CSP_REPORT_ONLY is true', async () => {
      mockConfigService = createMockConfigService({ CSP_REPORT_ONLY: 'true' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const reportOnlyService = module.get<CspConfigService>(CspConfigService);
      expect(reportOnlyService.isReportOnly()).toBe(true);
    });
  });

  describe('getHeaderName', () => {
    it('should return Content-Security-Policy when not in report-only mode', () => {
      expect(service.getHeaderName()).toBe('Content-Security-Policy');
    });

    it('should return Content-Security-Policy-Report-Only in report-only mode', async () => {
      mockConfigService = createMockConfigService({ CSP_REPORT_ONLY: 'true' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const reportOnlyService = module.get<CspConfigService>(CspConfigService);
      expect(reportOnlyService.getHeaderName()).toBe(
        'Content-Security-Policy-Report-Only',
      );
    });
  });

  describe('generateNonce', () => {
    it('should generate a random nonce', () => {
      const nonce1 = service.generateNonce();
      const nonce2 = service.generateNonce();

      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(10);
    });

    it('should generate base64 encoded nonce', () => {
      const nonce = service.generateNonce();
      // Base64 characters: A-Z, a-z, 0-9, +, /, =
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('buildHeaderValue', () => {
    it('should build a valid CSP header string', () => {
      const header = service.buildHeaderValue();

      expect(header).toContain("default-src 'self'");
      expect(header).toContain('script-src');
      expect(header).toContain('style-src');
      expect(header).toContain('font-src');
      expect(header).toContain('img-src');
      expect(header).toContain('connect-src');
      expect(header).toContain("frame-ancestors 'none'");
      expect(header).toContain("form-action 'self'");
      expect(header).toContain("base-uri 'self'");
      expect(header).toContain("object-src 'none'");
      expect(header).toContain('report-uri');
    });

    it('should include nonce when provided', () => {
      const nonce = 'test-nonce-123';
      const header = service.buildHeaderValue(nonce);

      expect(header).toContain(`'nonce-${nonce}'`);
    });

    it('should remove unsafe-inline from script-src when nonce is provided', () => {
      const nonce = 'test-nonce-123';
      const header = service.buildHeaderValue(nonce);

      // When nonce is provided, script-src should not have unsafe-inline
      const scriptSrcMatch = header.match(/script-src[^;]+/);
      expect(scriptSrcMatch).toBeDefined();
      expect(scriptSrcMatch![0]).not.toContain("'unsafe-inline'");
    });

    it('should include external sources', () => {
      const header = service.buildHeaderValue();

      expect(header).toContain('https://cdn.jsdelivr.net');
      expect(header).toContain('https://fonts.googleapis.com');
      expect(header).toContain('https://fonts.gstatic.com');
      expect(header).toContain('https://api.xero.com');
      expect(header).toContain('https://*.simplepay.co.za');
    });
  });

  describe('getConfig', () => {
    it('should return full configuration object', () => {
      const config = service.getConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('reportOnly');
      expect(config).toHaveProperty('directives');
      expect(config).toHaveProperty('reportEndpoint');
    });

    it('should include all required directives', () => {
      const config = service.getConfig();
      const { directives } = config;

      expect(directives.defaultSrc).toContain("'self'");
      expect(directives.scriptSrc).toBeDefined();
      expect(directives.styleSrc).toBeDefined();
      expect(directives.fontSrc).toBeDefined();
      expect(directives.imgSrc).toBeDefined();
      expect(directives.connectSrc).toBeDefined();
      expect(directives.frameAncestors).toContain("'none'");
      expect(directives.formAction).toContain("'self'");
      expect(directives.baseUri).toContain("'self'");
      expect(directives.objectSrc).toContain("'none'");
    });
  });

  describe('getHelmetConfig', () => {
    it('should return helmet-compatible configuration', () => {
      const helmetConfig = service.getHelmetConfig();

      expect(helmetConfig).toHaveProperty('useDefaults', false);
      expect(helmetConfig).toHaveProperty('reportOnly');
      expect(helmetConfig).toHaveProperty('directives');
    });

    it('should set reportOnly based on configuration', () => {
      const helmetConfig = service.getHelmetConfig();
      expect(helmetConfig.reportOnly).toBe(false);
    });

    it('should include all directives in helmet format', () => {
      const helmetConfig = service.getHelmetConfig();
      const { directives } = helmetConfig;

      expect(Array.isArray(directives.defaultSrc)).toBe(true);
      expect(Array.isArray(directives.scriptSrc)).toBe(true);
      expect(Array.isArray(directives.styleSrc)).toBe(true);
      expect(Array.isArray(directives.fontSrc)).toBe(true);
      expect(Array.isArray(directives.imgSrc)).toBe(true);
      expect(Array.isArray(directives.connectSrc)).toBe(true);
    });
  });

  describe('additional sources from environment', () => {
    it('should parse additional script sources', async () => {
      mockConfigService = createMockConfigService({
        CSP_ADDITIONAL_SCRIPT_SRC:
          'https://custom.cdn.com,https://other.cdn.com',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const customService = module.get<CspConfigService>(CspConfigService);
      const config = customService.getConfig();

      expect(config.directives.scriptSrc).toContain('https://custom.cdn.com');
      expect(config.directives.scriptSrc).toContain('https://other.cdn.com');
    });

    it('should parse additional style sources', async () => {
      mockConfigService = createMockConfigService({
        CSP_ADDITIONAL_STYLE_SRC: 'https://custom.styles.com',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const customService = module.get<CspConfigService>(CspConfigService);
      const config = customService.getConfig();

      expect(config.directives.styleSrc).toContain('https://custom.styles.com');
    });

    it('should parse additional connect sources', async () => {
      mockConfigService = createMockConfigService({
        CSP_ADDITIONAL_CONNECT_SRC:
          'https://custom.api.com,wss://socket.api.com',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const customService = module.get<CspConfigService>(CspConfigService);
      const config = customService.getConfig();

      expect(config.directives.connectSrc).toContain('https://custom.api.com');
      expect(config.directives.connectSrc).toContain('wss://socket.api.com');
    });

    it('should handle empty additional sources gracefully', async () => {
      mockConfigService = createMockConfigService({
        CSP_ADDITIONAL_SCRIPT_SRC: '',
        CSP_ADDITIONAL_STYLE_SRC: '   ',
        CSP_ADDITIONAL_CONNECT_SRC: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const customService = module.get<CspConfigService>(CspConfigService);
      const config = customService.getConfig();

      // Should still have default sources but no extras
      expect(config.directives.scriptSrc).toContain("'self'");
      expect(config.directives.styleSrc).toContain("'self'");
      expect(config.directives.connectSrc).toContain("'self'");
    });
  });

  describe('custom report endpoint', () => {
    it('should use custom report endpoint from environment', async () => {
      mockConfigService = createMockConfigService({
        CSP_REPORT_ENDPOINT: '/custom/csp-violations',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CspConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const customService = module.get<CspConfigService>(CspConfigService);
      const config = customService.getConfig();

      expect(config.reportEndpoint).toBe('/custom/csp-violations');
      expect(config.directives.reportUri).toBe('/custom/csp-violations');
    });
  });
});
