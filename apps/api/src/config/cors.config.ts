import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger } from '@nestjs/common';

const logger = new Logger('CorsConfig');

/**
 * CORS configuration interface
 */
export interface CorsConfiguration {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Validates that a string is a valid origin URL
 * @param origin - The origin string to validate
 * @returns true if valid origin format
 */
function isValidOrigin(origin: string): boolean {
  // Allow wildcard subdomain patterns like *.example.com
  if (origin.startsWith('*.')) {
    const domain = origin.slice(2);
    // Basic domain validation - must have at least one dot and valid characters
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
      domain,
    );
  }

  try {
    const url = new URL(origin);
    // Must be http or https protocol
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    // Must not have a path (other than /)
    if (url.pathname !== '/') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses and validates CORS allowed origins from environment variable
 * FAILS FAST if configuration is invalid in production
 */
function parseAllowedOrigins(
  originsEnv: string | undefined,
  nodeEnv: string,
): string[] {
  const isProduction = nodeEnv === 'production';

  if (!originsEnv || originsEnv.trim() === '') {
    if (isProduction) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS environment variable is required in production. ' +
          'Set it to a comma-separated list of allowed origins (e.g., https://app.example.com,https://www.example.com)',
      );
    }
    // Development defaults
    logger.warn(
      'CORS_ALLOWED_ORIGINS not set, using development defaults: http://localhost:3000,http://localhost:3001',
    );
    return ['http://localhost:3000', 'http://localhost:3001'];
  }

  const origins = originsEnv
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  if (origins.length === 0) {
    if (isProduction) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS is empty. At least one valid origin is required in production.',
      );
    }
    logger.warn('CORS_ALLOWED_ORIGINS is empty, using development defaults');
    return ['http://localhost:3000', 'http://localhost:3001'];
  }

  // Check for wildcard - NEVER allow in production
  if (origins.includes('*')) {
    if (isProduction) {
      throw new Error(
        'CORS wildcard (*) is not allowed in production. ' +
          'Specify explicit origins for security.',
      );
    }
    logger.warn(
      'CORS wildcard (*) detected. This is insecure and should only be used in development.',
    );
  }

  // Validate each origin format
  const invalidOrigins: string[] = [];
  for (const origin of origins) {
    if (origin !== '*' && !isValidOrigin(origin)) {
      invalidOrigins.push(origin);
    }
  }

  if (invalidOrigins.length > 0) {
    const errorMsg =
      `Invalid CORS origins detected: ${invalidOrigins.join(', ')}. ` +
      'Origins must be valid URLs (e.g., https://example.com) or wildcard subdomain patterns (e.g., *.example.com)';
    if (isProduction) {
      throw new Error(errorMsg);
    }
    logger.error(errorMsg);
  }

  return origins;
}

/**
 * Creates a CORS origin validator function
 * Logs rejected origins for security monitoring
 */
function createOriginValidator(
  allowedOrigins: string[],
): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  // Pre-compile wildcard patterns to regex for performance
  const wildcardPatterns: RegExp[] = [];
  const exactOrigins = new Set<string>();

  for (const origin of allowedOrigins) {
    if (origin === '*') {
      // Wildcard allows everything
      return (_origin, callback) => callback(null, true);
    }

    if (origin.startsWith('*.')) {
      // Convert *.example.com to regex matching any subdomain
      const domain = origin.slice(2).replace(/\./g, '\\.');
      wildcardPatterns.push(
        new RegExp(`^https?://[a-z0-9-]+\\.${domain}$`, 'i'),
      );
    } else {
      exactOrigins.add(origin);
    }
  }

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allow requests with no origin (same-origin requests, server-to-server, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check exact match first
    if (exactOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    // Check wildcard patterns
    for (const pattern of wildcardPatterns) {
      if (pattern.test(origin)) {
        callback(null, true);
        return;
      }
    }

    // Origin not allowed - log for security monitoring
    logger.warn(`CORS request blocked from origin: ${origin}`);
    callback(null, false);
  };
}

/**
 * Parses allowed methods from environment variable
 */
function parseAllowedMethods(methodsEnv: string | undefined): string[] {
  if (!methodsEnv || methodsEnv.trim() === '') {
    return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
  }
  return methodsEnv
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m.length > 0);
}

/**
 * Parses allowed headers from environment variable
 */
function parseAllowedHeaders(headersEnv: string | undefined): string[] {
  if (!headersEnv || headersEnv.trim() === '') {
    return [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'Accept',
      'Origin',
    ];
  }
  return headersEnv
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
}

/**
 * Creates the CORS configuration for NestJS
 * FAILS FAST if configuration is invalid in production
 */
export function createCorsConfig(): CorsOptions {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Parse configuration from environment
  const allowedOrigins = parseAllowedOrigins(
    process.env.CORS_ALLOWED_ORIGINS,
    nodeEnv,
  );
  const allowedMethods = parseAllowedMethods(process.env.CORS_ALLOWED_METHODS);
  const allowedHeaders = parseAllowedHeaders(process.env.CORS_ALLOWED_HEADERS);
  const credentials = process.env.CORS_CREDENTIALS !== 'false'; // Default true
  const maxAge = parseInt(process.env.CORS_MAX_AGE || '86400', 10); // Default 24 hours

  // Log configuration (only in non-production for security)
  if (!isProduction) {
    logger.log(`CORS configured with origins: ${allowedOrigins.join(', ')}`);
    logger.log(`CORS allowed methods: ${allowedMethods.join(', ')}`);
    logger.log(`CORS credentials enabled: ${credentials}`);
  } else {
    logger.log(
      `CORS configured with ${allowedOrigins.length} allowed origin(s)`,
    );
  }

  // Create origin validator function
  const originValidator = createOriginValidator(allowedOrigins);

  return {
    origin: originValidator,
    methods: allowedMethods,
    allowedHeaders: allowedHeaders,
    credentials: credentials,
    maxAge: maxAge,
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'], // Common pagination headers
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
}

/**
 * Get CORS configuration object (for testing/inspection)
 */
export function getCorsConfiguration(): CorsConfiguration {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    allowedOrigins: parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS,
      nodeEnv,
    ),
    allowedMethods: parseAllowedMethods(process.env.CORS_ALLOWED_METHODS),
    allowedHeaders: parseAllowedHeaders(process.env.CORS_ALLOWED_HEADERS),
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),
  };
}

export default createCorsConfig;
