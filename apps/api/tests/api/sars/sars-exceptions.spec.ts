/**
 * SARS Exceptions Tests
 * TASK-SARS-001: Use Typed NestJS Exceptions in SARS Module
 *
 * Tests for typed SARS exceptions with correct HTTP status codes
 * and error response structures.
 */

import { HttpStatus } from '@nestjs/common';
import {
  SarsValidationException,
  SarsSubmissionException,
  SarsNotFoundException,
  SarsPeriodException,
  SarsPayFrequencyException,
  SarsEfilingException,
  SarsVatRegistrationException,
  SarsVatNumberMissingException,
  SarsNoPayrollException,
  SarsTenantNotFoundException,
} from '../../../src/api/sars/exceptions';

describe('SARS Exceptions', () => {
  describe('SarsValidationException', () => {
    it('should return 400 with correct error structure', () => {
      const exception = new SarsValidationException(
        'vatNumber',
        'VAT number must be 10 digits',
      );

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.name).toBe('SarsValidationException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.error).toBe('SARS_VALIDATION_ERROR');
      expect(response.field).toBe('vatNumber');
      expect(response.message).toBe('VAT number must be 10 digits');
    });

    it('should allow custom error code', () => {
      const exception = new SarsValidationException(
        'idNumber',
        'ID number must be 13 digits',
        'INVALID_ID_NUMBER',
      );

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.error).toBe('INVALID_ID_NUMBER');
    });

    it('should expose field property', () => {
      const exception = new SarsValidationException(
        'taxNumber',
        'Tax number is required',
      );

      expect(exception.field).toBe('taxNumber');
      expect(exception.errorCode).toBe('SARS_VALIDATION_ERROR');
    });
  });

  describe('SarsSubmissionException', () => {
    it('should return 422 with submission details', () => {
      const exception = new SarsSubmissionException(
        'VAT201',
        'No transactions for period',
      );

      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.name).toBe('SarsSubmissionException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.error).toBe('SARS_SUBMISSION_ERROR');
      expect(response.submissionType).toBe('VAT201');
      expect(response.reason).toBe('No transactions for period');
      expect(response.message).toBe(
        'SARS VAT201 submission failed: No transactions for period',
      );
    });

    it('should allow custom error code', () => {
      const exception = new SarsSubmissionException(
        'EMP201',
        'Missing employee data',
        'INCOMPLETE_EMPLOYEE_DATA',
      );

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.error).toBe('INCOMPLETE_EMPLOYEE_DATA');
      expect(response.submissionType).toBe('EMP201');
    });

    it('should expose submission type and reason properties', () => {
      const exception = new SarsSubmissionException(
        'IRP5',
        'Annual submission deadline passed',
      );

      expect(exception.submissionType).toBe('IRP5');
      expect(exception.reason).toBe('Annual submission deadline passed');
    });
  });

  describe('SarsNotFoundException', () => {
    it('should return 404 with resource info', () => {
      const exception = new SarsNotFoundException(
        'SarsSubmission',
        'submission-123',
      );

      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(exception.name).toBe('SarsNotFoundException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.error).toBe('SARS_NOT_FOUND');
      expect(response.resource).toBe('SarsSubmission');
      expect(response.id).toBe('submission-123');
      expect(response.message).toBe(
        'SarsSubmission with id submission-123 not found',
      );
    });

    it('should expose resource and id properties', () => {
      const exception = new SarsNotFoundException('Tenant', 'tenant-456');

      expect(exception.resource).toBe('Tenant');
      expect(exception.resourceId).toBe('tenant-456');
    });
  });

  describe('SarsPeriodException', () => {
    it('should return 400 with period info', () => {
      const exception = new SarsPeriodException(
        'Invalid period format "2025/01" (expected YYYY-MM)',
        '2025/01',
      );

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.name).toBe('SarsPeriodException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.error).toBe('INVALID_SARS_PERIOD');
      expect(response.period).toBe('2025/01');
      expect(response.message).toBe(
        'Invalid period format "2025/01" (expected YYYY-MM)',
      );
    });

    it('should handle missing period', () => {
      const exception = new SarsPeriodException('Tax period is required');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.period).toBeNull();
      expect(response.message).toBe('Tax period is required');
    });

    it('should expose period property', () => {
      const exception = new SarsPeriodException(
        'Period is in the future',
        '2030-01',
      );

      expect(exception.period).toBe('2030-01');
    });
  });

  describe('SarsPayFrequencyException', () => {
    it('should return 400 with valid options', () => {
      const exception = new SarsPayFrequencyException('BIWEEKLY');

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.name).toBe('SarsPayFrequencyException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.error).toBe('INVALID_PAY_FREQUENCY');
      expect(response.frequency).toBe('BIWEEKLY');
      expect(response.validOptions).toEqual([
        'MONTHLY',
        'WEEKLY',
        'DAILY',
        'HOURLY',
      ]);
      expect(response.message).toBe(
        'Invalid pay frequency: BIWEEKLY. Valid options: MONTHLY, WEEKLY, DAILY, HOURLY',
      );
    });

    it('should expose frequency property', () => {
      const exception = new SarsPayFrequencyException('ANNUALLY');

      expect(exception.frequency).toBe('ANNUALLY');
    });
  });

  describe('SarsEfilingException', () => {
    it('should return 503 with service error details', () => {
      const exception = new SarsEfilingException(
        'Authentication failed',
        'SARS_AUTH_FAILED',
      );

      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(exception.name).toBe('SarsEfilingException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(response.error).toBe('SARS_AUTH_FAILED');
      expect(response.message).toBe(
        'SARS eFiling service error: Authentication failed',
      );
      expect(response.retryAfter).toBeNull();
    });

    it('should include retry-after when provided', () => {
      const exception = new SarsEfilingException(
        'Rate limited',
        'SARS_RATE_LIMITED',
        60,
      );

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.retryAfter).toBe(60);
      expect(exception.retryAfter).toBe(60);
    });

    it('should use default error code when not provided', () => {
      const exception = new SarsEfilingException('Connection timeout');

      expect(exception.errorCode).toBe('SARS_EFILING_ERROR');
    });
  });

  describe('SarsVatRegistrationException', () => {
    it('should return 422 with registration required message', () => {
      const exception = new SarsVatRegistrationException('tenant-123');

      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.name).toBe('SarsVatRegistrationException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.error).toBe('VAT_REGISTRATION_REQUIRED');
      expect(response.tenantId).toBe('tenant-123');
      expect(response.message).toBe(
        'VAT201 generation requires VAT registration. Please register for VAT in Settings.',
      );
    });

    it('should expose tenantId property', () => {
      const exception = new SarsVatRegistrationException('tenant-456');

      expect(exception.tenantId).toBe('tenant-456');
    });
  });

  describe('SarsVatNumberMissingException', () => {
    it('should return 400 with VAT number required message', () => {
      const exception = new SarsVatNumberMissingException('tenant-123');

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.name).toBe('SarsVatNumberMissingException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.error).toBe('VAT_NUMBER_REQUIRED');
      expect(response.tenantId).toBe('tenant-123');
      expect(response.message).toBe(
        'VAT number is required. Please add your VAT number in Settings.',
      );
    });
  });

  describe('SarsNoPayrollException', () => {
    it('should return 400 with no payroll records message', () => {
      const exception = new SarsNoPayrollException('2025-01');

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.name).toBe('SarsNoPayrollException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.error).toBe('NO_PAYROLL_RECORDS');
      expect(response.periodMonth).toBe('2025-01');
      expect(response.message).toBe(
        'No approved payroll records for period 2025-01',
      );
    });

    it('should expose periodMonth property', () => {
      const exception = new SarsNoPayrollException('2024-12');

      expect(exception.periodMonth).toBe('2024-12');
    });
  });

  describe('SarsTenantNotFoundException', () => {
    it('should return 404 with tenant not found message', () => {
      const exception = new SarsTenantNotFoundException('tenant-123');

      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(exception.name).toBe('SarsTenantNotFoundException');

      const response = exception.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.error).toBe('SARS_TENANT_NOT_FOUND');
      expect(response.tenantId).toBe('tenant-123');
      expect(response.message).toBe('Tenant tenant-123 not found');
    });

    it('should expose tenantId property', () => {
      const exception = new SarsTenantNotFoundException('tenant-789');

      expect(exception.tenantId).toBe('tenant-789');
    });
  });

  describe('Exception hierarchy', () => {
    it('should extend correct NestJS base exceptions', () => {
      const validation = new SarsValidationException('field', 'message');
      const submission = new SarsSubmissionException('VAT201', 'reason');
      const notFound = new SarsNotFoundException('Resource', 'id');
      const period = new SarsPeriodException('message');
      const payFreq = new SarsPayFrequencyException('INVALID');
      const efiling = new SarsEfilingException('message');
      const vatReg = new SarsVatRegistrationException('tenant');
      const vatNum = new SarsVatNumberMissingException('tenant');
      const noPayroll = new SarsNoPayrollException('2025-01');
      const tenantNf = new SarsTenantNotFoundException('tenant');

      // All exceptions should be instances of Error
      expect(validation).toBeInstanceOf(Error);
      expect(submission).toBeInstanceOf(Error);
      expect(notFound).toBeInstanceOf(Error);
      expect(period).toBeInstanceOf(Error);
      expect(payFreq).toBeInstanceOf(Error);
      expect(efiling).toBeInstanceOf(Error);
      expect(vatReg).toBeInstanceOf(Error);
      expect(vatNum).toBeInstanceOf(Error);
      expect(noPayroll).toBeInstanceOf(Error);
      expect(tenantNf).toBeInstanceOf(Error);

      // Verify HTTP status codes are correct
      expect(validation.getStatus()).toBe(400);
      expect(submission.getStatus()).toBe(422);
      expect(notFound.getStatus()).toBe(404);
      expect(period.getStatus()).toBe(400);
      expect(payFreq.getStatus()).toBe(400);
      expect(efiling.getStatus()).toBe(503);
      expect(vatReg.getStatus()).toBe(422);
      expect(vatNum.getStatus()).toBe(400);
      expect(noPayroll.getStatus()).toBe(400);
      expect(tenantNf.getStatus()).toBe(404);
    });
  });
});
