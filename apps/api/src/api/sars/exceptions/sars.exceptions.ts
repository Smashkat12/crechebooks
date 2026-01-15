/**
 * SARS Module Custom Exceptions
 * TASK-SARS-001: Use Typed NestJS Exceptions in SARS Module
 *
 * Provides typed exceptions for SARS-related operations with consistent
 * error structures and appropriate HTTP status codes.
 *
 * Exception mapping rules:
 * - Missing required field -> BadRequestException (400)
 * - Invalid format/value -> BadRequestException (400)
 * - Record not found -> NotFoundException (404)
 * - Business rule violation -> UnprocessableEntityException (422)
 * - External service failure -> ServiceUnavailableException (503)
 */

import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Base interface for SARS exception response structure
 */
interface SarsExceptionResponse {
  statusCode: number;
  error: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Validation exception for SARS field validation errors
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new SarsValidationException('vatNumber', 'VAT number must be 10 digits');
 */
export class SarsValidationException extends BadRequestException {
  constructor(
    public readonly field: string,
    message: string,
    public readonly errorCode: string = 'SARS_VALIDATION_ERROR',
  ) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: errorCode,
      field,
      message,
    };
    super(response);
    this.name = 'SarsValidationException';
  }
}

/**
 * Exception for SARS submission processing errors
 * HTTP Status: 422 Unprocessable Entity
 *
 * @example
 * throw new SarsSubmissionException('VAT201', 'No approved payroll records for period');
 */
export class SarsSubmissionException extends UnprocessableEntityException {
  constructor(
    public readonly submissionType: string,
    public readonly reason: string,
    public readonly errorCode: string = 'SARS_SUBMISSION_ERROR',
  ) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: errorCode,
      submissionType,
      reason,
      message: `SARS ${submissionType} submission failed: ${reason}`,
    };
    super(response);
    this.name = 'SarsSubmissionException';
  }
}

/**
 * Exception for SARS resource not found errors
 * HTTP Status: 404 Not Found
 *
 * @example
 * throw new SarsNotFoundException('SarsSubmission', 'submission-123');
 */
export class SarsNotFoundException extends NotFoundException {
  constructor(
    public readonly resource: string,
    public readonly resourceId: string,
  ) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.NOT_FOUND,
      error: 'SARS_NOT_FOUND',
      resource,
      id: resourceId,
      message: `${resource} with id ${resourceId} not found`,
    };
    super(response);
    this.name = 'SarsNotFoundException';
  }
}

/**
 * Exception for invalid SARS tax period errors
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new SarsPeriodException('Invalid period format "2025/01" (expected YYYY-MM)', '2025/01');
 */
export class SarsPeriodException extends BadRequestException {
  constructor(
    message: string,
    public readonly period?: string,
  ) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'INVALID_SARS_PERIOD',
      period: period ?? null,
      message,
    };
    super(response);
    this.name = 'SarsPeriodException';
  }
}

/**
 * Exception for invalid pay frequency in SARS calculations
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new SarsPayFrequencyException('BIWEEKLY');
 */
export class SarsPayFrequencyException extends BadRequestException {
  constructor(public readonly frequency: string) {
    const validOptions = ['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'];
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'INVALID_PAY_FREQUENCY',
      frequency,
      validOptions,
      message: `Invalid pay frequency: ${frequency}. Valid options: ${validOptions.join(', ')}`,
    };
    super(response);
    this.name = 'SarsPayFrequencyException';
  }
}

/**
 * Exception for SARS eFiling service errors
 * HTTP Status: 503 Service Unavailable
 *
 * @example
 * throw new SarsEfilingException('Authentication failed', 'SARS_AUTH_FAILED');
 */
export class SarsEfilingException extends ServiceUnavailableException {
  constructor(
    message: string,
    public readonly errorCode: string = 'SARS_EFILING_ERROR',
    public readonly retryAfter?: number,
  ) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: errorCode,
      message: `SARS eFiling service error: ${message}`,
      retryAfter: retryAfter ?? null,
    };
    super(response);
    this.name = 'SarsEfilingException';
  }
}

/**
 * Exception for tenant not registered for VAT
 * HTTP Status: 422 Unprocessable Entity
 *
 * @example
 * throw new SarsVatRegistrationException('tenant-123');
 */
export class SarsVatRegistrationException extends UnprocessableEntityException {
  constructor(public readonly tenantId: string) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'VAT_REGISTRATION_REQUIRED',
      tenantId,
      message:
        'VAT201 generation requires VAT registration. Please register for VAT in Settings.',
    };
    super(response);
    this.name = 'SarsVatRegistrationException';
  }
}

/**
 * Exception for missing VAT number
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new SarsVatNumberMissingException('tenant-123');
 */
export class SarsVatNumberMissingException extends BadRequestException {
  constructor(public readonly tenantId: string) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'VAT_NUMBER_REQUIRED',
      tenantId,
      message:
        'VAT number is required. Please add your VAT number in Settings.',
    };
    super(response);
    this.name = 'SarsVatNumberMissingException';
  }
}

/**
 * Exception for no payroll records in period
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new SarsNoPayrollException('2025-01');
 */
export class SarsNoPayrollException extends BadRequestException {
  constructor(public readonly periodMonth: string) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'NO_PAYROLL_RECORDS',
      periodMonth,
      message: `No approved payroll records for period ${periodMonth}`,
    };
    super(response);
    this.name = 'SarsNoPayrollException';
  }
}

/**
 * Exception for tenant not found in SARS operations
 * HTTP Status: 404 Not Found
 *
 * @example
 * throw new SarsTenantNotFoundException('tenant-123');
 */
export class SarsTenantNotFoundException extends NotFoundException {
  constructor(public readonly tenantId: string) {
    const response: SarsExceptionResponse = {
      statusCode: HttpStatus.NOT_FOUND,
      error: 'SARS_TENANT_NOT_FOUND',
      tenantId,
      message: `Tenant ${tenantId} not found`,
    };
    super(response);
    this.name = 'SarsTenantNotFoundException';
  }
}
