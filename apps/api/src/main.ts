/**
 * CrecheBooks API Application Bootstrap
 * TASK-UI-001: Added cookie-parser for HttpOnly cookie authentication
 * TASK-INFRA-004: Added helmet security headers
 * TASK-INFRA-005: Added structured JSON logging with Pino
 * TASK-INFRA-007: Added shutdown hooks for graceful Bull queue shutdown
 * TASK-INFRA-008: Added request payload size limits
 * TASK-SEC-103: Enhanced CSP with environment configuration and report-only mode
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config';
import { createCorsConfig } from './config/cors.config';
import { StructuredLoggerService } from './common/logger';
import { PayloadTooLargeFilter } from './common/filters/payload-too-large.filter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CspConfigService } from './common/security';

async function bootstrap(): Promise<void> {
  // TASK-INFRA-008: Disable default body parser to use custom config with size limits
  // TASK-INFRA-005: Create app with buffered logs, then replace with structured logger
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  // Get the structured logger and use it as the app logger
  // Use resolve() for transient-scoped providers
  const logger = await app.resolve(StructuredLoggerService);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  // TASK-INFRA-007: Enable shutdown hooks for graceful Bull queue shutdown
  // This allows the ShutdownService.onApplicationShutdown() to be called
  // when the process receives SIGTERM or SIGINT signals
  app.enableShutdownHooks();

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get('port', { infer: true }) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // TASK-INFRA-008: Configure body-parser with size limits
  // Body parsers must be applied BEFORE other middleware (helmet, cookie-parser)
  // Order matters: body-parser -> helmet -> cookie-parser -> other middleware
  const jsonLimit = process.env.BODY_LIMIT_JSON || '10mb';
  const urlencodedLimit = process.env.BODY_LIMIT_URLENCODED || '10mb';

  // Webhook signature headers that require raw body preservation
  const webhookSignatureHeaders = [
    'stripe-signature',
    'x-hub-signature-256',
    'x-signature',
    'x-whatsapp-signature',
    'x-xero-signature',
    'x-simplepay-signature',
  ];

  // JSON body parser with limit and raw body preservation for webhook signature verification
  app.use(
    json({
      limit: jsonLimit,
      verify: (req, _res, buf) => {
        // Store raw body for webhook signature verification
        // Only store if request has a webhook signature header
        const request = req as {
          headers: Record<string, string | undefined>;
          rawBody?: Buffer;
        };
        const hasSignature = webhookSignatureHeaders.some(
          (header) => request.headers[header],
        );
        if (hasSignature) {
          request.rawBody = buf;
        }
      },
    }),
  );

  // URL-encoded body parser with limit
  app.use(
    urlencoded({
      limit: urlencodedLimit,
      extended: true,
    }),
  );

  logger.log(
    `Body parser limits configured: JSON=${jsonLimit}, URL-encoded=${urlencodedLimit}`,
  );

  // TASK-SEC-104: Global exception filter for standardized error responses
  // Order matters: GlobalExceptionFilter first, then PayloadTooLargeFilter
  // PayloadTooLargeFilter handles specific payload errors before they reach GlobalExceptionFilter
  app.useGlobalFilters(
    new GlobalExceptionFilter(
      configService as unknown as ConfigService<Record<string, unknown>>,
    ),
    new PayloadTooLargeFilter(logger),
  );

  // TASK-SEC-103: Get CSP configuration service for environment-based CSP
  const cspConfigService = app.get(CspConfigService);
  const cspConfig = cspConfigService.getHelmetConfig();

  // TASK-INFRA-004 & TASK-SEC-103: Security headers with helmet
  // Applied first in middleware chain for maximum protection
  // CSP is now configurable via environment variables with report-only mode support
  app.use(
    helmet({
      // TASK-SEC-103: Content Security Policy - configurable via environment
      // Supports report-only mode for safe deployment
      contentSecurityPolicy: cspConfigService.isEnabled() ? cspConfig : false,
      // Cross-Origin policies
      crossOriginEmbedderPolicy: false, // Disabled to allow Swagger UI resources
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for API
      // DNS Prefetch Control
      dnsPrefetchControl: { allow: false },
      // X-Frame-Options: DENY
      frameguard: { action: 'deny' },
      // Hide X-Powered-By header
      hidePoweredBy: true,
      // HTTP Strict Transport Security - 1 year in production
      hsts: isProduction
        ? {
            maxAge: 31536000, // 1 year in seconds
            includeSubDomains: true,
            preload: true,
          }
        : false, // Disable in development to avoid HTTPS issues
      // X-Download-Options for IE
      ieNoOpen: true,
      // X-Content-Type-Options: nosniff
      noSniff: true,
      // Origin-Agent-Cluster header
      originAgentCluster: true,
      // X-Permitted-Cross-Domain-Policies
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      // Referrer-Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // X-XSS-Protection (legacy but still useful)
      xssFilter: true,
    }),
  );

  // TASK-SEC-103: Log CSP configuration
  const cspMode = cspConfigService.isEnabled()
    ? cspConfigService.isReportOnly()
      ? 'report-only'
      : 'enforcing'
    : 'disabled';
  logger.log(
    `Helmet security headers enabled (production: ${isProduction}, CSP: ${cspMode})`,
  );

  // TASK-UI-001: Enable cookie parser for HttpOnly cookie authentication
  app.use(cookieParser());

  // Global validation pipe - strict validation, no fallbacks
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: false,
    }),
  );

  // Configure CORS with explicit, restrictive settings
  // FAILS FAST if CORS_ALLOWED_ORIGINS not set in production
  const corsConfig = createCorsConfig();
  app.enableCors(corsConfig);

  // Global prefix for API
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CrecheBooks API')
    .setDescription(
      'AI-powered bookkeeping system for South African creches and pre-schools',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Auth0 JWT token',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'OAuth2 authentication endpoints')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`CrecheBooks API running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(`Health check: http://localhost:${port}/health`);
  logger.log(`Auth login: http://localhost:${port}/api/v1/auth/login`);
}

void bootstrap();
