/**
 * Payload Too Large Exception Filter
 * TASK-INFRA-008: Request payload size limits
 *
 * Catches PayloadTooLargeError from Express body-parser and transforms
 * it into a structured 413 response with informative error message.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StructuredLoggerService } from '../logger';

/**
 * Express body-parser error interface for payload too large errors.
 * The body-parser middleware throws an error with type 'entity.too.large'
 * when the payload exceeds the configured limit.
 */
interface PayloadTooLargeError extends Error {
  type?: string;
  statusCode?: number;
  status?: number;
  limit?: number;
  length?: number;
  expected?: number;
}

/**
 * Exception filter that catches payload too large errors from Express body-parser
 * and returns a structured 413 response.
 */
@Catch()
export class PayloadTooLargeFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {
    this.logger.setContext('PayloadTooLargeFilter');
  }

  catch(exception: PayloadTooLargeError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Check if this is a payload too large error from body-parser
    const isPayloadTooLarge =
      exception.type === 'entity.too.large' ||
      exception.statusCode === 413 ||
      exception.status === 413 ||
      exception.message?.toLowerCase().includes('request entity too large') ||
      exception.message?.toLowerCase().includes('payload too large');

    if (!isPayloadTooLarge) {
      // Re-throw for other exception filters to handle
      throw exception;
    }

    const status = HttpStatus.PAYLOAD_TOO_LARGE;
    const limit = exception.limit;
    const length = exception.length || exception.expected;

    // Format the limit as human-readable size
    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} bytes`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const maxSize = limit
      ? formatBytes(limit)
      : process.env.BODY_LIMIT_JSON || '10mb';
    const actualSize = length ? formatBytes(length) : undefined;

    // Log the oversized request
    this.logger.warn('Request payload too large', {
      operation: 'payload_size_exceeded',
      method: request.method,
      path: request.path,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      contentType: request.headers['content-type'],
      contentLength: request.headers['content-length'],
      maxSize,
      actualSize,
      limit,
      length,
    });

    // Return structured 413 response
    const errorResponse = {
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request payload exceeds the maximum allowed size of ${maxSize}`,
        details: {
          maxSize,
          ...(actualSize && { actualSize }),
          supportedContentTypes: [
            'application/json',
            'application/x-www-form-urlencoded',
          ],
          suggestion:
            'Consider compressing your payload or sending data in smaller chunks',
        },
      },
      timestamp: new Date().toISOString(),
      path: request.path,
    };

    response.status(status).json(errorResponse);
  }
}
