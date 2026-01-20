/**
 * Content Security Policy Configuration Service
 * TASK-SEC-103: CSP Headers - XSS protection
 *
 * Provides environment-based CSP configuration with:
 * - Report-only mode support for safe deployment
 * - Nonce-based inline script handling
 * - Configurable external sources
 * - Violation reporting endpoint
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

/**
 * CSP directive configuration
 */
export interface CspDirectives {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  fontSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  frameAncestors: string[];
  formAction: string[];
  baseUri: string[];
  objectSrc: string[];
  reportUri?: string;
  upgradeInsecureRequests?: boolean;
}

/**
 * CSP configuration options
 */
export interface CspConfig {
  enabled: boolean;
  reportOnly: boolean;
  directives: CspDirectives;
  reportEndpoint: string;
}

@Injectable()
export class CspConfigService {
  private readonly config: CspConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.buildConfig();
  }

  /**
   * Build CSP configuration from environment variables
   */
  private buildConfig(): CspConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    // CSP enabled by default, can be disabled via env
    const enabled =
      this.configService.get<string>('CSP_ENABLED', 'true') === 'true';

    // Report-only mode - start in report-only, then switch to enforce
    // Default: report-only in production for initial deployment
    const reportOnly =
      this.configService.get<string>(
        'CSP_REPORT_ONLY',
        isProduction ? 'true' : 'false',
      ) === 'true';

    // Report endpoint
    const reportEndpoint = this.configService.get<string>(
      'CSP_REPORT_ENDPOINT',
      '/api/v1/csp-report',
    );

    // External sources from environment (comma-separated)
    const additionalScriptSrc = this.parseSourceList(
      this.configService.get<string>('CSP_ADDITIONAL_SCRIPT_SRC', ''),
    );
    const additionalStyleSrc = this.parseSourceList(
      this.configService.get<string>('CSP_ADDITIONAL_STYLE_SRC', ''),
    );
    const additionalConnectSrc = this.parseSourceList(
      this.configService.get<string>('CSP_ADDITIONAL_CONNECT_SRC', ''),
    );

    // Build directives
    const directives: CspDirectives = {
      // Default: only same origin
      defaultSrc: ["'self'"],

      // Scripts: self + nonce (placeholder) + CDN + additional
      // Note: 'nonce-{random}' is replaced at runtime with actual nonce
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Swagger UI - consider nonce in future
        'https://cdn.jsdelivr.net',
        ...additionalScriptSrc,
      ],

      // Styles: self + inline (for styled-components/emotion) + Google Fonts
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Swagger UI and CSS-in-JS
        'https://fonts.googleapis.com',
        ...additionalStyleSrc,
      ],

      // Fonts: self + Google Fonts
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],

      // Images: self + data URIs + HTTPS (for tenant logos, etc.)
      imgSrc: ["'self'", 'data:', 'https:'],

      // Connect (API calls): self + Xero + SimplePay + additional
      connectSrc: [
        "'self'",
        'https://api.xero.com',
        'https://*.simplepay.co.za',
        'https://identity.xero.com',
        ...additionalConnectSrc,
      ],

      // Frame ancestors: none (prevent clickjacking)
      frameAncestors: ["'none'"],

      // Form action: only same origin
      formAction: ["'self'"],

      // Base URI: only same origin (prevent base tag injection)
      baseUri: ["'self'"],

      // Object/Embed: none (no Flash, etc.)
      objectSrc: ["'none'"],

      // Report URI for violations
      reportUri: reportEndpoint,

      // Upgrade HTTP to HTTPS in production
      upgradeInsecureRequests: isProduction,
    };

    return {
      enabled,
      reportOnly,
      directives,
      reportEndpoint,
    };
  }

  /**
   * Parse comma-separated source list from environment
   */
  private parseSourceList(value: string): string[] {
    if (!value || value.trim() === '') {
      return [];
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Get CSP configuration
   */
  getConfig(): CspConfig {
    return this.config;
  }

  /**
   * Check if CSP is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if CSP is in report-only mode
   */
  isReportOnly(): boolean {
    return this.config.reportOnly;
  }

  /**
   * Get the CSP header name based on mode
   */
  getHeaderName(): string {
    return this.config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  }

  /**
   * Generate a random nonce for inline scripts
   * Note: This nonce must be included in script tags AND CSP header
   */
  generateNonce(): string {
    return randomBytes(16).toString('base64');
  }

  /**
   * Build the CSP header value
   * @param nonce - Optional nonce for inline scripts
   */
  buildHeaderValue(nonce?: string): string {
    const { directives } = this.config;
    const parts: string[] = [];

    // Helper to build directive string
    const buildDirective = (name: string, values: string[]): string => {
      if (values.length === 0) return '';
      return `${name} ${values.join(' ')}`;
    };

    // Build script-src with nonce if provided
    let scriptSrc = [...directives.scriptSrc];
    if (nonce) {
      // Remove 'unsafe-inline' when using nonces (nonces are more secure)
      scriptSrc = scriptSrc.filter((s) => s !== "'unsafe-inline'");
      scriptSrc.push(`'nonce-${nonce}'`);
    }

    parts.push(buildDirective('default-src', directives.defaultSrc));
    parts.push(buildDirective('script-src', scriptSrc));
    parts.push(buildDirective('style-src', directives.styleSrc));
    parts.push(buildDirective('font-src', directives.fontSrc));
    parts.push(buildDirective('img-src', directives.imgSrc));
    parts.push(buildDirective('connect-src', directives.connectSrc));
    parts.push(buildDirective('frame-ancestors', directives.frameAncestors));
    parts.push(buildDirective('form-action', directives.formAction));
    parts.push(buildDirective('base-uri', directives.baseUri));
    parts.push(buildDirective('object-src', directives.objectSrc));

    if (directives.reportUri) {
      parts.push(`report-uri ${directives.reportUri}`);
    }

    if (directives.upgradeInsecureRequests) {
      parts.push('upgrade-insecure-requests');
    }

    return parts.filter((p) => p.length > 0).join('; ');
  }

  /**
   * Get helmet CSP configuration object
   * This returns the format expected by helmet's contentSecurityPolicy middleware
   *
   * Note: Helmet CSP uses a specific format:
   * - String arrays for most directives: ['self', 'https://example.com']
   * - Empty array [] for boolean directives that should be present
   * - null to omit the directive (undefined is NOT accepted by helmet)
   */
  getHelmetConfig(): {
    useDefaults: boolean;
    directives: Record<string, string[] | null>;
    reportOnly: boolean;
  } {
    const { directives } = this.config;

    // Build helmet-compatible directives object
    // Helmet expects string arrays, not boolean values
    // IMPORTANT: Use null (not undefined) for omitted directives
    const helmetDirectives: Record<string, string[] | null> = {
      defaultSrc: directives.defaultSrc,
      scriptSrc: directives.scriptSrc,
      styleSrc: directives.styleSrc,
      fontSrc: directives.fontSrc,
      imgSrc: directives.imgSrc,
      connectSrc: directives.connectSrc,
      frameAncestors: directives.frameAncestors,
      formAction: directives.formAction,
      baseUri: directives.baseUri,
      objectSrc: directives.objectSrc,
      reportUri: directives.reportUri ? [directives.reportUri] : null,
      // For upgrade-insecure-requests, use empty array to enable, null to disable
      upgradeInsecureRequests: directives.upgradeInsecureRequests ? [] : null,
    };

    return {
      useDefaults: false,
      reportOnly: this.config.reportOnly,
      directives: helmetDirectives,
    };
  }
}
