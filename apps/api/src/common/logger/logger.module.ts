/**
 * Logger Module
 * TASK-INFRA-005: Global module for structured logging
 *
 * Provides:
 * - StructuredLoggerService as a global provider
 * - CorrelationIdMiddleware for request correlation
 */

import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

@Global()
@Module({
  providers: [StructuredLoggerService],
  exports: [StructuredLoggerService],
})
export class LoggerModule implements NestModule {
  /**
   * Configure correlation ID middleware for all routes
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
