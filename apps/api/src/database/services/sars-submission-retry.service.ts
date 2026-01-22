import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import {
  SubmissionState,
  SubmissionResult,
  SarsApiError,
  ErrorType,
  AdminNotification,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
  TRANSIENT_STATUS_CODES,
  PERMANENT_STATUS_CODES,
} from '../types/sars-submission.types';
import {
  SarsEfilingClient,
  SarsSubmissionPayload,
} from '../../integrations/sars/sars-efiling.client';

/**
 * SARS Submission Retry Service
 * TASK-SARS-018: SARS eFiling Submission Error Handling and Retry
 * TASK-SARS-019: SARS eFiling API Real Integration
 *
 * Handles submission retries with exponential backoff, error classification,
 * and dead letter queue management for SARS eFiling submissions.
 *
 * @class SarsSubmissionRetryService
 */
@Injectable()
export class SarsSubmissionRetryService {
  private readonly logger = new Logger(SarsSubmissionRetryService.name);
  private readonly retryConfig: RetryConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly sarsClient?: SarsEfilingClient,
    @Optional() @Inject('RETRY_CONFIG') retryConfig?: Partial<RetryConfig>,
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Submit a SARS return with automatic retry logic
   *
   * @param submissionId - The ID of the submission to submit
   * @returns Promise<SubmissionResult> - Result of the submission attempt
   * @throws NotFoundException if submission doesn't exist
   */
  async submitWithRetry(submissionId: string): Promise<SubmissionResult> {
    const submission = await this.prisma.sarsSubmission.findUnique({
      where: { id: submissionId },
      include: { tenant: true },
    });

    if (!submission) {
      throw new NotFoundException('SarsSubmission', submissionId);
    }

    // Check if submission is in valid state for submission
    if (submission.status !== SubmissionStatus.READY) {
      throw new BusinessException(
        `Cannot submit SARS submission '${submissionId}' - status must be READY, current status: ${submission.status}`,
        'INVALID_STATUS',
        { submissionId, currentStatus: submission.status },
      );
    }

    // Get current retry state
    const state = await this.getSubmissionState(submissionId);

    // Check if max retries exceeded
    if (state.retryCount >= this.retryConfig.maxRetries) {
      this.logger.warn(
        `Submission ${submissionId} exceeded max retries (${this.retryConfig.maxRetries})`,
      );
      await this.moveToDlq(
        submissionId,
        `Maximum retry attempts (${this.retryConfig.maxRetries}) exceeded`,
      );
      return {
        success: false,
        sarsReference: null,
        correlationId: state.correlationId,
        errorMessage: `Maximum retry attempts exceeded`,
        errorType: ErrorType.MANUAL_INTERVENTION,
        statusCode: null,
        retryCount: state.retryCount,
        willRetry: false,
        nextRetryAt: null,
        movedToDlq: true,
      };
    }

    // Generate correlation ID for tracking
    const correlationId = this.generateCorrelationId(submissionId);

    try {
      // TODO: Integrate with actual SARS eFiling API
      // For now, simulate API call
      const apiResponse = await this.callSarsApi(submission, correlationId);

      // Success - update submission
      await this.prisma.sarsSubmission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.SUBMITTED,
          sarsReference: apiResponse.reference,
          submittedAt: new Date(),
        },
      });

      this.logger.log(
        `Successfully submitted SARS return ${submissionId} with reference ${apiResponse.reference}`,
        { correlationId },
      );

      return {
        success: true,
        sarsReference: apiResponse.reference,
        correlationId,
        errorMessage: null,
        errorType: null,
        statusCode: 200,
        retryCount: state.retryCount,
        willRetry: false,
        nextRetryAt: null,
        movedToDlq: false,
      };
    } catch (error) {
      return await this.handleSubmissionError(
        submissionId,
        error as SarsApiError,
        state,
        correlationId,
      );
    }
  }

  /**
   * Retry a failed submission
   *
   * @param submissionId - The ID of the submission to retry
   * @returns Promise<SubmissionResult> - Result of the retry attempt
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is in DLQ
   */
  async retryFailed(submissionId: string): Promise<SubmissionResult> {
    const state = await this.getSubmissionState(submissionId);

    if (state.inDlq) {
      throw new BusinessException(
        `Cannot retry submission ${submissionId} - currently in dead letter queue. Manual intervention required.`,
        'SUBMISSION_IN_DLQ',
        { submissionId, dlqReason: state.dlqReason },
      );
    }

    // Reset to READY status for retry
    await this.prisma.sarsSubmission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.READY },
    });

    return this.submitWithRetry(submissionId);
  }

  /**
   * Get current state of a submission including retry information
   *
   * @param submissionId - The ID of the submission
   * @returns Promise<SubmissionState> - Current submission state
   * @throws NotFoundException if submission doesn't exist
   */
  async getSubmissionState(submissionId: string): Promise<SubmissionState> {
    const submission = await this.prisma.sarsSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('SarsSubmission', submissionId);
    }

    // Parse document data for retry metadata
    const metadata = (submission.documentData as any)?.retryMetadata || {};

    return {
      submissionId: submission.id,
      status: this.mapSubmissionStatus(submission.status),
      retryCount: metadata.retryCount || 0,
      maxRetries: this.retryConfig.maxRetries,
      lastRetryAt: metadata.lastRetryAt ? new Date(metadata.lastRetryAt) : null,
      nextRetryAt: metadata.nextRetryAt ? new Date(metadata.nextRetryAt) : null,
      lastError: metadata.lastError || null,
      errorType: metadata.errorType || null,
      correlationId: metadata.correlationId || null,
      inDlq: metadata.inDlq || false,
      dlqReason: metadata.dlqReason || null,
    };
  }

  /**
   * Move a submission to dead letter queue
   *
   * @param submissionId - The ID of the submission
   * @param reason - Reason for moving to DLQ
   * @returns Promise<void>
   */
  async moveToDlq(submissionId: string, reason: string): Promise<void> {
    const submission = await this.prisma.sarsSubmission.findUnique({
      where: { id: submissionId },
      include: { tenant: true },
    });

    if (!submission) {
      throw new NotFoundException('SarsSubmission', submissionId);
    }

    const metadata = (submission.documentData as any)?.retryMetadata || {};

    await this.prisma.sarsSubmission.update({
      where: { id: submissionId },
      data: {
        documentData: {
          ...(submission.documentData as object),
          retryMetadata: {
            ...metadata,
            inDlq: true,
            dlqReason: reason,
            movedToDlqAt: new Date().toISOString(),
          },
        },
      },
    });

    this.logger.error(
      `Moved submission ${submissionId} to DLQ. Reason: ${reason}`,
    );

    // Notify admin
    this.notifyAdmin(submission, {
      statusCode: 0,
      message: reason,
    } as SarsApiError);
  }

  /**
   * Classify a SARS API error as transient or permanent
   *
   * @param error - The SARS API error to classify
   * @returns Promise<ErrorType> - Classification of the error
   */
  classifyError(error: SarsApiError): ErrorType {
    // Check explicit transient flag
    if (error.isTransient === true) {
      return ErrorType.TRANSIENT;
    }

    // Classify by HTTP status code
    if (TRANSIENT_STATUS_CODES.includes(error.statusCode)) {
      return ErrorType.TRANSIENT;
    }

    if (PERMANENT_STATUS_CODES.includes(error.statusCode)) {
      return ErrorType.PERMANENT;
    }

    // Check SARS-specific error codes
    if (error.sarsErrorCode) {
      // SARS error codes starting with 'T' are typically transient
      if (error.sarsErrorCode.startsWith('T')) {
        return ErrorType.TRANSIENT;
      }
      // SARS error codes starting with 'V' are typically validation (permanent)
      if (error.sarsErrorCode.startsWith('V')) {
        return ErrorType.PERMANENT;
      }
    }

    // Check error message for common transient patterns
    const transientPatterns = [
      /timeout/i,
      /rate limit/i,
      /too many requests/i,
      /service unavailable/i,
      /temporarily unavailable/i,
    ];

    if (
      transientPatterns.some((pattern) => pattern.test(error.message || ''))
    ) {
      return ErrorType.TRANSIENT;
    }

    // Default to requiring manual intervention for unknown errors
    return ErrorType.MANUAL_INTERVENTION;
  }

  /**
   * Notify administrators of submission failures
   *
   * @param submission - The failed submission
   * @param error - The error that occurred
   * @returns Promise<void>
   */
  notifyAdmin(submission: any, error: SarsApiError): void {
    const metadata = submission.documentData?.retryMetadata || {};
    const errorType = this.classifyError(error);

    const notification: AdminNotification = {
      submissionId: submission.id,
      tenantId: submission.tenantId,
      submissionType: submission.submissionType,
      period: `${submission.periodStart.toISOString()} to ${submission.periodEnd.toISOString()}`,
      errorMessage: error.message,
      errorType,
      retryCount: metadata.retryCount || 0,
      inDlq: metadata.inDlq || false,
      correlationId: metadata.correlationId || null,
      failedAt: new Date(),
    };

    // Log for now - TODO: Integrate with email/notification service
    this.logger.error(
      `[ADMIN ALERT] SARS submission failed: ${JSON.stringify(notification)}`,
      error.originalError?.stack,
    );

    // TODO: Send email notification to administrators
    // TODO: Create notification record in database
    // TODO: Trigger webhook if configured
  }

  /**
   * Handle submission error with retry logic
   */
  private async handleSubmissionError(
    submissionId: string,
    error: SarsApiError,
    currentState: SubmissionState,
    correlationId: string,
  ): Promise<SubmissionResult> {
    const errorType = this.classifyError(error);
    const newRetryCount = currentState.retryCount + 1;

    this.logger.error(
      `SARS submission ${submissionId} failed (attempt ${newRetryCount}/${this.retryConfig.maxRetries})`,
      {
        errorType,
        statusCode: error.statusCode,
        message: error.message,
        correlationId,
      },
    );

    // Permanent errors should not be retried
    if (errorType === ErrorType.PERMANENT) {
      await this.moveToDlq(
        submissionId,
        `Permanent error: ${error.message} (HTTP ${error.statusCode})`,
      );
      return {
        success: false,
        sarsReference: null,
        correlationId,
        errorMessage: error.message,
        errorType,
        statusCode: error.statusCode,
        retryCount: newRetryCount,
        willRetry: false,
        nextRetryAt: null,
        movedToDlq: true,
      };
    }

    // Check if max retries exceeded
    if (newRetryCount >= this.retryConfig.maxRetries) {
      await this.moveToDlq(
        submissionId,
        `Maximum retry attempts exceeded after ${error.message}`,
      );
      return {
        success: false,
        sarsReference: null,
        correlationId,
        errorMessage: error.message,
        errorType,
        statusCode: error.statusCode,
        retryCount: newRetryCount,
        willRetry: false,
        nextRetryAt: null,
        movedToDlq: true,
      };
    }

    // Calculate next retry time with exponential backoff
    const nextRetryAt = this.calculateNextRetry(newRetryCount);

    // Update retry metadata
    await this.updateRetryMetadata(
      submissionId,
      newRetryCount,
      error,
      errorType,
      correlationId,
      nextRetryAt,
    );

    return {
      success: false,
      sarsReference: null,
      correlationId,
      errorMessage: error.message,
      errorType,
      statusCode: error.statusCode,
      retryCount: newRetryCount,
      willRetry: true,
      nextRetryAt,
      movedToDlq: false,
    };
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(retryCount: number): Date {
    // Exponential backoff: 1min, 5min, 15min
    const delayMs = Math.min(
      this.retryConfig.baseDelayMs *
        Math.pow(this.retryConfig.backoffMultiplier, retryCount - 1),
      this.retryConfig.maxDelayMs,
    );

    return new Date(Date.now() + delayMs);
  }

  /**
   * Update retry metadata in submission document data
   */
  private async updateRetryMetadata(
    submissionId: string,
    retryCount: number,
    error: SarsApiError,
    errorType: ErrorType,
    correlationId: string,
    nextRetryAt: Date,
  ): Promise<void> {
    const submission = await this.prisma.sarsSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) return;

    await this.prisma.sarsSubmission.update({
      where: { id: submissionId },
      data: {
        documentData: {
          ...(submission.documentData as object),
          retryMetadata: {
            retryCount,
            lastRetryAt: new Date().toISOString(),
            nextRetryAt: nextRetryAt.toISOString(),
            lastError: error.message,
            errorType,
            correlationId,
            inDlq: false,
          },
        },
      },
    });
  }

  /**
   * Generate unique correlation ID for SARS API tracking
   */
  private generateCorrelationId(submissionId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `SARS-${submissionId.substring(0, 8)}-${timestamp}-${random}`;
  }

  /**
   * Map Prisma SubmissionStatus to SubmissionState status
   */
  private mapSubmissionStatus(
    status: SubmissionStatus,
  ): SubmissionState['status'] {
    switch (status) {
      case SubmissionStatus.DRAFT:
      case SubmissionStatus.READY:
        return 'PENDING';
      case SubmissionStatus.SUBMITTED:
        return 'SUBMITTED';
      case SubmissionStatus.ACKNOWLEDGED:
        return 'ACKNOWLEDGED';
      default:
        return 'FAILED';
    }
  }

  /**
   * Call SARS eFiling API
   * TASK-SARS-019: Real SARS eFiling integration (no mocks)
   *
   * @param submission - SARS submission record with document data
   * @param correlationId - Correlation ID for tracking
   * @returns SARS reference number
   * @throws SarsApiError if submission fails
   */
  private async callSarsApi(
    submission: any,
    correlationId: string,
  ): Promise<{ reference: string }> {
    // FAIL FAST: Require SARS client to be configured
    if (!this.sarsClient) {
      const errorData: SarsApiError = {
        statusCode: 0,
        message:
          'SARS eFiling client not available. Ensure SarsModule is imported and configured.',
        sarsErrorCode: 'CLIENT_NOT_AVAILABLE',
        isTransient: false,
      };
      this.logger.error({
        error: {
          message: errorData.message,
          name: 'ConfigurationError',
        },
        file: 'sars-submission-retry.service.ts',
        function: 'callSarsApi',
        inputs: { submissionId: submission.id, correlationId },
        timestamp: new Date().toISOString(),
        action:
          'Import SarsModule and configure SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables',
      });
      const err = new Error(errorData.message) as Error & {
        sarsApiError: SarsApiError;
      };
      err.sarsApiError = errorData;
      throw err;
    }

    // FAIL FAST: Check if SARS client is configured with credentials
    if (!this.sarsClient.getIsConfigured()) {
      const errorData: SarsApiError = {
        statusCode: 0,
        message:
          'SARS eFiling credentials not configured. Set SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables.',
        sarsErrorCode: 'SARS_NOT_CONFIGURED',
        isTransient: false,
      };
      this.logger.error({
        error: {
          message: errorData.message,
          name: 'ConfigurationError',
        },
        file: 'sars-submission-retry.service.ts',
        function: 'callSarsApi',
        inputs: { submissionId: submission.id, correlationId },
        timestamp: new Date().toISOString(),
        action:
          'Configure SARS_CLIENT_ID and SARS_CLIENT_SECRET environment variables',
      });
      const err = new Error(errorData.message) as Error & {
        sarsApiError: SarsApiError;
      };
      err.sarsApiError = errorData;
      throw err;
    }

    // Extract VAT201 data from submission document
    const documentData = submission.documentData;
    if (!documentData?.fields) {
      const errorData: SarsApiError = {
        statusCode: 400,
        message: 'Invalid submission document: missing VAT201 fields',
        sarsErrorCode: 'INVALID_DOCUMENT',
        isTransient: false,
      };
      this.logger.error({
        error: {
          message: errorData.message,
          name: 'ValidationError',
        },
        file: 'sars-submission-retry.service.ts',
        function: 'callSarsApi',
        inputs: { submissionId: submission.id, correlationId },
        timestamp: new Date().toISOString(),
      });
      const err = new Error(errorData.message) as Error & {
        sarsApiError: SarsApiError;
      };
      err.sarsApiError = errorData;
      throw err;
    }

    // Build SARS submission payload
    const payload: SarsSubmissionPayload = {
      submissionType: 'VAT201',
      vatNumber: documentData.vatNumber,
      periodStart: new Date(submission.periodStart),
      periodEnd: new Date(submission.periodEnd),
      fields: {
        field1OutputStandardCents:
          documentData.fields.field1OutputStandardCents || 0,
        field2ZeroRatedCents:
          documentData.fields.field2OutputZeroRatedCents || 0,
        field3ExemptCents: documentData.fields.field3OutputExemptCents || 0,
        field4TotalOutputCents: documentData.fields.field4TotalOutputCents || 0,
        field5InputTaxCents: documentData.fields.field5InputTaxCents || 0,
        field6CapitalGoodsCents:
          documentData.fields.field6DeductibleInputCents || 0,
        field15NetVatCents: documentData.fields.field15NetVatCents || 0,
        field19TotalDueCents: documentData.fields.field19TotalDueCents || 0,
      },
    };

    this.logger.log({
      message: 'Submitting VAT201 to SARS eFiling',
      submissionId: submission.id,
      correlationId,
      periodStart: payload.periodStart.toISOString().split('T')[0],
      periodEnd: payload.periodEnd.toISOString().split('T')[0],
    });

    // Call real SARS eFiling API
    const response = await this.sarsClient.submitVat201(payload, correlationId);

    // Handle SARS API response
    if (!response.success) {
      const errorData: SarsApiError = {
        statusCode: response.errorCode?.startsWith('HTTP_')
          ? parseInt(response.errorCode.replace('HTTP_', ''), 10)
          : 500,
        message: response.errorMessage || 'SARS submission failed',
        sarsErrorCode: response.errorCode,
        isTransient: this.isTransientError(response.errorCode),
      };
      this.logger.error({
        error: {
          message: errorData.message,
          name: 'SarsSubmissionError',
          sarsErrorCode: errorData.sarsErrorCode,
        },
        file: 'sars-submission-retry.service.ts',
        function: 'callSarsApi',
        inputs: { submissionId: submission.id, correlationId },
        response: response.rawResponse,
        timestamp: new Date().toISOString(),
      });
      const err = new Error(errorData.message) as Error & {
        sarsApiError: SarsApiError;
      };
      err.sarsApiError = errorData;
      throw err;
    }

    if (!response.reference) {
      const errorData: SarsApiError = {
        statusCode: 500,
        message: 'SARS submission accepted but no reference number returned',
        sarsErrorCode: 'NO_REFERENCE',
        isTransient: false,
      };
      this.logger.error({
        error: {
          message: errorData.message,
          name: 'SarsResponseError',
        },
        file: 'sars-submission-retry.service.ts',
        function: 'callSarsApi',
        inputs: { submissionId: submission.id, correlationId },
        response: response.rawResponse,
        timestamp: new Date().toISOString(),
      });
      const err = new Error(errorData.message) as Error & {
        sarsApiError: SarsApiError;
      };
      err.sarsApiError = errorData;
      throw err;
    }

    this.logger.log({
      message: 'SARS submission successful',
      submissionId: submission.id,
      correlationId,
      reference: response.reference,
      status: response.status,
    });

    return { reference: response.reference };
  }

  /**
   * Determine if a SARS error code indicates a transient error
   */
  private isTransientError(errorCode?: string): boolean {
    if (!errorCode) return false;

    // Transient error patterns
    const transientPatterns = [
      /^T/, // SARS transient codes start with T
      /RATE_LIMIT/i,
      /TIMEOUT/i,
      /UNAVAILABLE/i,
      /HTTP_429/,
      /HTTP_502/,
      /HTTP_503/,
      /HTTP_504/,
    ];

    return transientPatterns.some((pattern) => pattern.test(errorCode));
  }
}
