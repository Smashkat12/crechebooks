/**
 * SARS Submission Retry Service Tests
 * TASK-SARS-018: SARS eFiling Submission Error Handling and Retry
 *
 * Comprehensive tests for SARS submission retry logic, error handling,
 * and dead letter queue management.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SarsSubmissionRetryService } from '../sars-submission-retry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';
import {
  NotFoundException,
  BusinessException,
} from '../../../shared/exceptions';
import {
  ErrorType,
  SarsApiError,
  DEFAULT_RETRY_CONFIG,
} from '../../types/sars-submission.types';

describe('SarsSubmissionRetryService', () => {
  let service: SarsSubmissionRetryService;
  let mockPrisma: any;

  const tenantId = 'tenant-123';
  const submissionId = 'submission-456';
  const userId = 'user-789';

  const mockSubmission = {
    id: submissionId,
    tenantId,
    submissionType: 'VAT201',
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    deadline: new Date('2025-02-25'),
    status: SubmissionStatus.READY,
    documentData: {},
    netVatCents: 50000,
    submittedAt: null,
    sarsReference: null,
    tenant: {
      id: tenantId,
      name: 'Test Creche',
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      sarsSubmission: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new SarsSubmissionRetryService(mockPrisma);
  });

  describe('submitWithRetry', () => {
    it('should successfully submit on first attempt', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(mockSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue({
        ...mockSubmission,
        status: SubmissionStatus.SUBMITTED,
        sarsReference: 'SARS12345',
      });

      const result = await service.submitWithRetry(submissionId);

      expect(result.success).toBe(true);
      expect(result.sarsReference).toBeTruthy();
      expect(result.correlationId).toBeTruthy();
      expect(result.willRetry).toBe(false);
      expect(result.movedToDlq).toBe(false);
      expect(mockPrisma.sarsSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: submissionId },
          data: expect.objectContaining({
            status: SubmissionStatus.SUBMITTED,
            sarsReference: expect.any(String),
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(null);

      await expect(service.submitWithRetry(submissionId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BusinessException for non-READY status', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue({
        ...mockSubmission,
        status: SubmissionStatus.SUBMITTED,
      });

      await expect(service.submitWithRetry(submissionId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should move to DLQ after max retries exceeded', async () => {
      const submissionWithRetries = {
        ...mockSubmission,
        documentData: {
          retryMetadata: {
            retryCount: 3,
            lastError: 'Timeout',
          },
        },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(
        submissionWithRetries,
      );
      mockPrisma.sarsSubmission.update.mockResolvedValue(submissionWithRetries);

      const result = await service.submitWithRetry(submissionId);

      expect(result.success).toBe(false);
      expect(result.movedToDlq).toBe(true);
      expect(result.willRetry).toBe(false);
      expect(mockPrisma.sarsSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentData: expect.objectContaining({
              retryMetadata: expect.objectContaining({
                inDlq: true,
                dlqReason: expect.stringContaining('Maximum retry'),
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('retryFailed', () => {
    it('should retry a failed submission', async () => {
      const failedSubmission = {
        ...mockSubmission,
        documentData: {
          retryMetadata: {
            retryCount: 1,
            lastError: 'Timeout',
            inDlq: false,
          },
        },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(failedSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue({
        ...failedSubmission,
        status: SubmissionStatus.READY,
      });

      const result = await service.retryFailed(submissionId);

      expect(result).toBeDefined();
      expect(mockPrisma.sarsSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: submissionId },
          data: { status: SubmissionStatus.READY },
        }),
      );
    });

    it('should throw BusinessException for DLQ submissions', async () => {
      const dlqSubmission = {
        ...mockSubmission,
        documentData: {
          retryMetadata: {
            retryCount: 3,
            inDlq: true,
            dlqReason: 'Max retries exceeded',
          },
        },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(dlqSubmission);

      await expect(service.retryFailed(submissionId)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('getSubmissionState', () => {
    it('should return current submission state with metadata', async () => {
      const submissionWithMetadata = {
        ...mockSubmission,
        documentData: {
          retryMetadata: {
            retryCount: 2,
            lastRetryAt: new Date('2025-01-15T10:00:00Z').toISOString(),
            nextRetryAt: new Date('2025-01-15T10:05:00Z').toISOString(),
            lastError: 'Service unavailable',
            errorType: ErrorType.TRANSIENT,
            correlationId: 'SARS-12345',
            inDlq: false,
          },
        },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(
        submissionWithMetadata,
      );

      const state = await service.getSubmissionState(submissionId);

      expect(state.submissionId).toBe(submissionId);
      expect(state.retryCount).toBe(2);
      expect(state.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
      expect(state.lastError).toBe('Service unavailable');
      expect(state.errorType).toBe(ErrorType.TRANSIENT);
      expect(state.inDlq).toBe(false);
    });

    it('should return default state for submission without metadata', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(mockSubmission);

      const state = await service.getSubmissionState(submissionId);

      expect(state.retryCount).toBe(0);
      expect(state.lastRetryAt).toBeNull();
      expect(state.lastError).toBeNull();
      expect(state.inDlq).toBe(false);
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(null);

      await expect(service.getSubmissionState(submissionId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('moveToDlq', () => {
    it('should move submission to DLQ with reason', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(mockSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue(mockSubmission);

      const reason = 'Permanent validation error';
      await service.moveToDlq(submissionId, reason);

      expect(mockPrisma.sarsSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: submissionId },
          data: expect.objectContaining({
            documentData: expect.objectContaining({
              retryMetadata: expect.objectContaining({
                inDlq: true,
                dlqReason: reason,
                movedToDlqAt: expect.any(String),
              }),
            }),
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(null);

      await expect(
        service.moveToDlq(submissionId, 'Test reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('classifyError', () => {
    it('should classify timeout as TRANSIENT', async () => {
      const error: SarsApiError = {
        statusCode: 408,
        message: 'Request timeout',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify 503 as TRANSIENT', async () => {
      const error: SarsApiError = {
        statusCode: 503,
        message: 'Service unavailable',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify rate limit as TRANSIENT', async () => {
      const error: SarsApiError = {
        statusCode: 429,
        message: 'Too many requests',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify validation error as PERMANENT', async () => {
      const error: SarsApiError = {
        statusCode: 400,
        message: 'Invalid VAT number format',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.PERMANENT);
    });

    it('should classify 422 as PERMANENT', async () => {
      const error: SarsApiError = {
        statusCode: 422,
        message: 'Unprocessable entity',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.PERMANENT);
    });

    it('should classify unauthorized as PERMANENT', async () => {
      const error: SarsApiError = {
        statusCode: 401,
        message: 'Unauthorized',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.PERMANENT);
    });

    it('should classify SARS T-code as TRANSIENT', async () => {
      const error: SarsApiError = {
        statusCode: 500,
        message: 'System temporarily unavailable',
        sarsErrorCode: 'T1001',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify SARS V-code as PERMANENT', async () => {
      const error: SarsApiError = {
        statusCode: 400,
        message: 'Validation failed',
        sarsErrorCode: 'V2003',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.PERMANENT);
    });

    it('should respect explicit isTransient flag', async () => {
      const error: SarsApiError = {
        statusCode: 400, // Would normally be PERMANENT
        message: 'Temporary issue',
        isTransient: true,
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify timeout message as TRANSIENT', async () => {
      const error: SarsApiError = {
        statusCode: 500,
        message: 'Connection timeout after 30 seconds',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.TRANSIENT);
    });

    it('should classify unknown errors as MANUAL_INTERVENTION', async () => {
      const error: SarsApiError = {
        statusCode: 999,
        message: 'Unknown error occurred',
      };

      const errorType = await service.classifyError(error);
      expect(errorType).toBe(ErrorType.MANUAL_INTERVENTION);
    });
  });

  describe('notifyAdmin', () => {
    it('should log admin notification for failed submission', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');

      const error: SarsApiError = {
        statusCode: 503,
        message: 'Service unavailable',
      };

      await service.notifyAdmin(mockSubmission, error);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ADMIN ALERT]'),
        undefined,
      );
    });

    it('should include all notification details', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');

      const submissionWithMetadata = {
        ...mockSubmission,
        documentData: {
          retryMetadata: {
            retryCount: 2,
            correlationId: 'SARS-12345',
            inDlq: true,
          },
        },
      };

      const error: SarsApiError = {
        statusCode: 422,
        message: 'Validation failed',
      };

      await service.notifyAdmin(submissionWithMetadata, error);

      const callArgs = loggerSpy.mock.calls[0][0];
      expect(callArgs).toContain(submissionId);
      expect(callArgs).toContain(tenantId);
      expect(callArgs).toContain('VAT201');
      expect(callArgs).toContain('Validation failed');
    });
  });

  describe('Exponential backoff', () => {
    it('should calculate correct retry delays', async () => {
      const failedSubmission = {
        ...mockSubmission,
        documentData: { retryMetadata: { retryCount: 0 } },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(failedSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue(failedSubmission);

      // Mock API to throw transient error
      jest
        .spyOn(service as any, 'callSarsApi')
        .mockRejectedValue({ statusCode: 503, message: 'Service unavailable' });

      const result = await service.submitWithRetry(submissionId);

      expect(result.nextRetryAt).toBeDefined();
      expect(result.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());

      // First retry should be ~1 minute
      const delayMs = result.nextRetryAt!.getTime() - Date.now();
      expect(delayMs).toBeGreaterThanOrEqual(59000); // Allow 1s margin
      expect(delayMs).toBeLessThanOrEqual(61000);
    });
  });

  describe('Correlation ID generation', () => {
    it('should generate unique correlation IDs', async () => {
      const id1 = service['generateCorrelationId'](submissionId);
      const id2 = service['generateCorrelationId'](submissionId);

      expect(id1).toMatch(/^SARS-/);
      expect(id2).toMatch(/^SARS-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Status mapping', () => {
    it('should map DRAFT to PENDING', () => {
      const status = service['mapSubmissionStatus'](SubmissionStatus.DRAFT);
      expect(status).toBe('PENDING');
    });

    it('should map READY to PENDING', () => {
      const status = service['mapSubmissionStatus'](SubmissionStatus.READY);
      expect(status).toBe('PENDING');
    });

    it('should map SUBMITTED to SUBMITTED', () => {
      const status = service['mapSubmissionStatus'](SubmissionStatus.SUBMITTED);
      expect(status).toBe('SUBMITTED');
    });

    it('should map ACKNOWLEDGED to ACKNOWLEDGED', () => {
      const status = service['mapSubmissionStatus'](
        SubmissionStatus.ACKNOWLEDGED,
      );
      expect(status).toBe('ACKNOWLEDGED');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete retry cycle: attempt -> fail -> retry -> success', async () => {
      let attemptCount = 0;
      const failedSubmission = {
        ...mockSubmission,
        documentData: { retryMetadata: { retryCount: 0 } },
      };

      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(failedSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue(failedSubmission);

      // First attempt fails
      jest.spyOn(service as any, 'callSarsApi').mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw { statusCode: 503, message: 'Service unavailable' };
        }
        return Promise.resolve({ reference: 'SARS12345' });
      });

      // First attempt
      const result1 = await service.submitWithRetry(submissionId);
      expect(result1.success).toBe(false);
      expect(result1.willRetry).toBe(true);

      // Update mock for retry
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue({
        ...failedSubmission,
        documentData: { retryMetadata: { retryCount: 1 } },
      });

      // Retry - should succeed
      const result2 = await service.retryFailed(submissionId);
      expect(result2.success).toBe(true);
      expect(result2.sarsReference).toBe('SARS12345');
    });

    it('should handle permanent error immediately without retry', async () => {
      mockPrisma.sarsSubmission.findUnique.mockResolvedValue(mockSubmission);
      mockPrisma.sarsSubmission.update.mockResolvedValue(mockSubmission);

      jest
        .spyOn(service as any, 'callSarsApi')
        .mockRejectedValue({ statusCode: 400, message: 'Invalid VAT number' });

      const result = await service.submitWithRetry(submissionId);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorType.PERMANENT);
      expect(result.willRetry).toBe(false);
      expect(result.movedToDlq).toBe(true);
    });
  });
});
