import { Injectable, Logger } from '@nestjs/common';
import {
  SarsSubmission,
  Prisma,
  SubmissionStatus as PrismaSubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSarsSubmissionDto,
  UpdateSarsSubmissionDto,
  SubmitSarsSubmissionDto,
  AcknowledgeSarsSubmissionDto,
  SarsSubmissionFilterDto,
} from '../dto/sars-submission.dto';
import {
  SubmissionType,
  SubmissionStatus,
} from '../entities/sars-submission.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';

/**
 * TASK-SARS-005: Status mapping for backward compatibility
 * Maps entity SubmissionStatus to Prisma SubmissionStatus
 * This allows using new statuses (ACCEPTED, REJECTED) while Prisma schema is updated
 */
const mapToPrismaStatus = (
  status: SubmissionStatus,
): PrismaSubmissionStatus => {
  switch (status) {
    case SubmissionStatus.ACCEPTED:
      // Map ACCEPTED to ACKNOWLEDGED in Prisma until migration is run
      return PrismaSubmissionStatus.ACKNOWLEDGED;
    case SubmissionStatus.REJECTED:
      // REJECTED doesn't exist in old Prisma - use DRAFT as fallback
      // This is temporary until the migration is run
      return PrismaSubmissionStatus.DRAFT;
    default:
      return status as PrismaSubmissionStatus;
  }
};

@Injectable()
export class SarsSubmissionRepository {
  private readonly logger = new Logger(SarsSubmissionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new SARS submission
   * @throws NotFoundException if tenant doesn't exist
   * @throws ConflictException if submission for period already exists
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateSarsSubmissionDto): Promise<SarsSubmission> {
    try {
      return await this.prisma.sarsSubmission.create({
        data: {
          tenantId: dto.tenantId,
          submissionType: dto.submissionType,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          deadline: dto.deadline,
          outputVatCents: dto.outputVatCents ?? null,
          inputVatCents: dto.inputVatCents ?? null,
          netVatCents: dto.netVatCents ?? null,
          totalPayeCents: dto.totalPayeCents ?? null,
          totalUifCents: dto.totalUifCents ?? null,
          totalSdlCents: dto.totalSdlCents ?? null,
          documentData: (dto.documentData ?? {}) as Prisma.InputJsonValue,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create SARS submission: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `SARS submission of type '${dto.submissionType}' already exists for tenant '${dto.tenantId}' for period starting '${dto.periodStart.toISOString()}'`,
            {
              tenantId: dto.tenantId,
              submissionType: dto.submissionType,
              periodStart: dto.periodStart,
            },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find SARS submission by ID with tenant isolation
   * @param id - Submission ID
   * @param tenantId - Tenant ID for isolation
   * @returns SarsSubmission or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<SarsSubmission | null> {
    try {
      return await this.prisma.sarsSubmission.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find SARS submission by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find SARS submission by unique key (tenantId, submissionType, periodStart)
   * @returns SarsSubmission or null if not found
   * @throws DatabaseException for database errors
   */
  async findByTenantAndPeriod(
    tenantId: string,
    submissionType: SubmissionType,
    periodStart: Date,
  ): Promise<SarsSubmission | null> {
    try {
      return await this.prisma.sarsSubmission.findUnique({
        where: {
          tenantId_submissionType_periodStart: {
            tenantId,
            submissionType,
            periodStart,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find SARS submission for tenant: ${tenantId}, type: ${submissionType}, period: ${periodStart.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantAndPeriod',
        'Failed to find SARS submission by period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all SARS submissions for a tenant with optional filters
   * @returns Array of SARS submissions
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: SarsSubmissionFilterDto,
  ): Promise<SarsSubmission[]> {
    try {
      const where: Prisma.SarsSubmissionWhereInput = { tenantId };

      if (filter?.submissionType !== undefined) {
        where.submissionType = filter.submissionType;
      }
      if (filter?.status !== undefined) {
        where.status = mapToPrismaStatus(filter.status);
      }
      if (filter?.periodStart !== undefined) {
        where.periodStart = { gte: filter.periodStart };
      }
      if (filter?.periodEnd !== undefined) {
        where.periodEnd = { lte: filter.periodEnd };
      }
      if (filter?.isFinalized !== undefined) {
        where.isFinalized = filter.isFinalized;
      }

      return await this.prisma.sarsSubmission.findMany({
        where,
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find SARS submissions for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find SARS submissions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find SARS submissions with upcoming deadlines
   * @param daysAhead Number of days to look ahead for deadlines
   * @returns Array of SARS submissions with upcoming deadlines
   * @throws DatabaseException for database errors
   */
  async findUpcomingDeadlines(daysAhead: number): Promise<SarsSubmission[]> {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      return await this.prisma.sarsSubmission.findMany({
        where: {
          deadline: {
            gte: now,
            lte: futureDate,
          },
          status: {
            in: [PrismaSubmissionStatus.DRAFT, PrismaSubmissionStatus.READY],
          },
          isFinalized: false,
        },
        orderBy: { deadline: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find upcoming deadlines for next ${daysAhead} days`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findUpcomingDeadlines',
        'Failed to find upcoming deadlines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a SARS submission
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is finalized
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.isFinalized) {
        throw new BusinessException(
          `Cannot update SARS submission '${id}' - submission is finalized and immutable`,
          'SUBMISSION_FINALIZED',
          { submissionId: id, isFinalized: true },
        );
      }

      const updateData: Prisma.SarsSubmissionUpdateInput = {};

      if (dto.periodStart !== undefined) {
        updateData.periodStart = dto.periodStart;
      }
      if (dto.periodEnd !== undefined) {
        updateData.periodEnd = dto.periodEnd;
      }
      if (dto.deadline !== undefined) {
        updateData.deadline = dto.deadline;
      }
      if (dto.outputVatCents !== undefined) {
        updateData.outputVatCents = dto.outputVatCents;
      }
      if (dto.inputVatCents !== undefined) {
        updateData.inputVatCents = dto.inputVatCents;
      }
      if (dto.netVatCents !== undefined) {
        updateData.netVatCents = dto.netVatCents;
      }
      if (dto.totalPayeCents !== undefined) {
        updateData.totalPayeCents = dto.totalPayeCents;
      }
      if (dto.totalUifCents !== undefined) {
        updateData.totalUifCents = dto.totalUifCents;
      }
      if (dto.totalSdlCents !== undefined) {
        updateData.totalSdlCents = dto.totalSdlCents;
      }
      if (dto.documentData !== undefined) {
        updateData.documentData = dto.documentData as Prisma.InputJsonValue;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }
      if (dto.status !== undefined) {
        updateData.status = mapToPrismaStatus(dto.status);
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update SARS submission ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'SARS submission for this period already exists',
            { periodStart: dto.periodStart },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark a SARS submission as ready for submission
   * Transitions from DRAFT to READY
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in DRAFT status or is finalized
   * @throws DatabaseException for database errors
   */
  async markAsReady(id: string, tenantId: string): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.isFinalized) {
        throw new BusinessException(
          `Cannot mark SARS submission '${id}' as ready - submission is finalized and immutable`,
          'SUBMISSION_FINALIZED',
          { submissionId: id, isFinalized: true },
        );
      }

      if (existing.status !== PrismaSubmissionStatus.DRAFT) {
        throw new BusinessException(
          `Cannot mark SARS submission '${id}' as ready - current status is '${existing.status}', expected 'DRAFT'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: PrismaSubmissionStatus.READY,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to mark SARS submission as ready: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markAsReady',
        'Failed to mark SARS submission as ready',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Submit a SARS return to SARS
   * Transitions from READY to SUBMITTED and records submitter
   * @throws NotFoundException if submission doesn't exist
   * @throws NotFoundException if submitter user doesn't exist
   * @throws BusinessException if submission is not in READY status or is finalized
   * @throws DatabaseException for database errors
   */
  async submit(
    id: string,
    tenantId: string,
    dto: SubmitSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.isFinalized) {
        throw new BusinessException(
          `Cannot submit SARS submission '${id}' - submission is already finalized`,
          'SUBMISSION_FINALIZED',
          { submissionId: id, isFinalized: true },
        );
      }

      if (existing.status !== PrismaSubmissionStatus.READY) {
        throw new BusinessException(
          `Cannot submit SARS submission '${id}' - current status is '${existing.status}', expected 'READY'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: PrismaSubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
          submittedBy: dto.submittedBy,
          sarsReference: dto.sarsReference ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to submit SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          // Check for submitted_by FK violation by constraint name or field name
          if (error.message.includes('submitted_by')) {
            throw new NotFoundException('User', dto.submittedBy);
          }
        }
      }
      throw new DatabaseException(
        'submit',
        'Failed to submit SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Record SARS acknowledgment for a submitted return
   * Transitions from SUBMITTED to ACKNOWLEDGED and records SARS reference
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in SUBMITTED status
   * @throws DatabaseException for database errors
   */
  async acknowledge(
    id: string,
    tenantId: string,
    dto: AcknowledgeSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.status !== PrismaSubmissionStatus.SUBMITTED) {
        throw new BusinessException(
          `Cannot acknowledge SARS submission '${id}' - current status is '${existing.status}', expected 'SUBMITTED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: PrismaSubmissionStatus.ACKNOWLEDGED,
          sarsReference: dto.sarsReference,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to acknowledge SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'acknowledge',
        'Failed to acknowledge SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Finalize a SARS submission (make it immutable)
   * Can only finalize submissions that have been ACKNOWLEDGED
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in ACKNOWLEDGED status
   * @throws DatabaseException for database errors
   */
  async finalize(id: string, tenantId: string): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.isFinalized) {
        throw new BusinessException(
          `SARS submission '${id}' is already finalized`,
          'ALREADY_FINALIZED',
          { submissionId: id },
        );
      }

      // TASK-SARS-005: Accept ACKNOWLEDGED status (ACCEPTED maps to ACKNOWLEDGED in DB)
      // Once Prisma migration is run, both ACCEPTED and ACKNOWLEDGED will be valid
      if (existing.status !== PrismaSubmissionStatus.ACKNOWLEDGED) {
        throw new BusinessException(
          `Cannot finalize SARS submission '${id}' - current status is '${existing.status}', expected 'ACKNOWLEDGED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          isFinalized: true,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to finalize SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'finalize',
        'Failed to finalize SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a SARS submission (hard delete)
   * Can only delete DRAFT submissions that are not finalized
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not DRAFT or is finalized
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.isFinalized) {
        throw new BusinessException(
          `Cannot delete SARS submission '${id}' - submission is finalized and immutable`,
          'SUBMISSION_FINALIZED',
          { submissionId: id, isFinalized: true },
        );
      }

      if (existing.status !== PrismaSubmissionStatus.DRAFT) {
        throw new BusinessException(
          `Cannot delete SARS submission '${id}' - only DRAFT submissions can be deleted, current status is '${existing.status}'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      await this.prisma.sarsSubmission.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TASK-SARS-005: Accept a SARS submission
   * Transitions from SUBMITTED to ACCEPTED and records SARS reference
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in SUBMITTED status
   * @throws DatabaseException for database errors
   */
  async accept(
    id: string,
    tenantId: string,
    sarsReference: string,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.status !== PrismaSubmissionStatus.SUBMITTED) {
        throw new BusinessException(
          `Cannot accept SARS submission '${id}' - current status is '${existing.status}', expected 'SUBMITTED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      // TASK-SARS-005: Map ACCEPTED to ACKNOWLEDGED for DB compatibility
      // Once migration is run, this will use ACCEPTED directly
      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: mapToPrismaStatus(SubmissionStatus.ACCEPTED),
          sarsReference,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to accept SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'accept',
        'Failed to accept SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TASK-SARS-005: Reject a SARS submission
   * Transitions from SUBMITTED to REJECTED and records rejection details
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in SUBMITTED status
   * @throws DatabaseException for database errors
   */
  async reject(
    id: string,
    tenantId: string,
    rejectionReason: string,
    rejectionCode?: string,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.status !== PrismaSubmissionStatus.SUBMITTED) {
        throw new BusinessException(
          `Cannot reject SARS submission '${id}' - current status is '${existing.status}', expected 'SUBMITTED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      // Get current document data and add rejection to history
      const documentData =
        (existing.documentData as Record<string, unknown>) ?? {};
      const retryHistory = (documentData.retryHistory as Array<unknown>) ?? [];
      const retryCount = (documentData.retryCount as number) ?? 0;

      // Add current attempt to retry history
      retryHistory.push({
        attemptNumber: retryCount + 1,
        submittedAt: existing.submittedAt,
        rejectedAt: new Date(),
        rejectionReason,
        rejectionCode,
      });

      // TASK-SARS-005: Map REJECTED to DRAFT for DB compatibility (stores rejection in documentData)
      // Once migration is run, this will use REJECTED directly
      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: mapToPrismaStatus(SubmissionStatus.REJECTED),
          documentData: {
            ...documentData,
            retryCount: retryCount + 1,
            lastRetryAt: new Date(),
            retryHistory,
            rejectionReason,
            rejectionCode,
            // TASK-SARS-005: Store logical status in documentData until migration
            logicalStatus: SubmissionStatus.REJECTED,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to reject SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'reject',
        'Failed to reject SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TASK-SARS-005: Retry a rejected SARS submission
   * Transitions from REJECTED back to SUBMITTED for a new attempt
   * @throws NotFoundException if submission doesn't exist
   * @throws BusinessException if submission is not in REJECTED status or exceeds max retries
   * @throws DatabaseException for database errors
   */
  async retry(
    id: string,
    tenantId: string,
    submittedBy: string,
    maxRetries: number = 3,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      // TASK-SARS-005: Check for logical status in documentData (until migration is run)
      const documentData =
        (existing.documentData as Record<string, unknown>) ?? {};
      const logicalStatus = documentData.logicalStatus as string | undefined;

      // Check if submission is in REJECTED state (either in DB or documentData)
      const isRejected =
        logicalStatus === SubmissionStatus.REJECTED ||
        existing.status === mapToPrismaStatus(SubmissionStatus.REJECTED);

      if (!isRejected && logicalStatus !== SubmissionStatus.REJECTED) {
        throw new BusinessException(
          `Cannot retry SARS submission '${id}' - current status is '${existing.status}', expected 'REJECTED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }
      const retryCount = (documentData.retryCount as number) ?? 0;

      if (retryCount >= maxRetries) {
        throw new BusinessException(
          `Cannot retry SARS submission '${id}' - maximum retry attempts (${maxRetries}) exceeded`,
          'MAX_RETRIES_EXCEEDED',
          { submissionId: id, retryCount, maxRetries },
        );
      }

      // Clear logical status when retrying (moving back to SUBMITTED)
      const { logicalStatus: _, ...cleanDocumentData } = documentData;

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: PrismaSubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
          submittedBy,
          documentData: {
            ...cleanDocumentData,
            lastRetryAt: new Date(),
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to retry SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'retry',
        'Failed to retry SARS submission',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TASK-SARS-005: Get retry history for a submission
   * @returns Array of retry attempts with details
   * @throws NotFoundException if submission doesn't exist
   * @throws DatabaseException for database errors
   */
  async getRetryHistory(
    id: string,
    tenantId: string,
  ): Promise<{
    retryCount: number;
    lastRetryAt: Date | null;
    history: Array<{
      attemptNumber: number;
      submittedAt: Date;
      rejectedAt?: Date;
      rejectionReason?: string;
      rejectionCode?: string;
    }>;
  }> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      const documentData =
        (existing.documentData as Record<string, unknown>) ?? {};
      const retryCount = (documentData.retryCount as number) ?? 0;
      const lastRetryAt = documentData.lastRetryAt
        ? new Date(documentData.lastRetryAt as string)
        : null;
      const retryHistory =
        (documentData.retryHistory as Array<{
          attemptNumber: number;
          submittedAt: string;
          rejectedAt?: string;
          rejectionReason?: string;
          rejectionCode?: string;
        }>) ?? [];

      return {
        retryCount,
        lastRetryAt,
        history: retryHistory.map((r) => ({
          attemptNumber: r.attemptNumber,
          submittedAt: new Date(r.submittedAt),
          rejectedAt: r.rejectedAt ? new Date(r.rejectedAt) : undefined,
          rejectionReason: r.rejectionReason,
          rejectionCode: r.rejectionCode,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get retry history for SARS submission: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getRetryHistory',
        'Failed to get retry history',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate VAT totals for a period
   * @returns Object with VAT amounts for the period
   * @throws DatabaseException for database errors
   */
  async calculateVatTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    totalOutputVat: number;
    totalInputVat: number;
    totalNetVat: number;
  }> {
    try {
      const result = await this.prisma.sarsSubmission.aggregate({
        where: {
          tenantId,
          submissionType: 'VAT201',
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
          status: { not: PrismaSubmissionStatus.DRAFT },
        },
        _sum: {
          outputVatCents: true,
          inputVatCents: true,
          netVatCents: true,
        },
      });

      return {
        totalOutputVat: result._sum.outputVatCents ?? 0,
        totalInputVat: result._sum.inputVatCents ?? 0,
        totalNetVat: result._sum.netVatCents ?? 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate VAT totals for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculateVatTotals',
        'Failed to calculate VAT totals',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate payroll tax totals for a period
   * @returns Object with PAYE, UIF, and SDL amounts for the period
   * @throws DatabaseException for database errors
   */
  async calculatePayrollTaxTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    totalPaye: number;
    totalUif: number;
    totalSdl: number;
  }> {
    try {
      const result = await this.prisma.sarsSubmission.aggregate({
        where: {
          tenantId,
          submissionType: 'EMP201',
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
          status: { not: PrismaSubmissionStatus.DRAFT },
        },
        _sum: {
          totalPayeCents: true,
          totalUifCents: true,
          totalSdlCents: true,
        },
      });

      return {
        totalPaye: result._sum.totalPayeCents ?? 0,
        totalUif: result._sum.totalUifCents ?? 0,
        totalSdl: result._sum.totalSdlCents ?? 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate payroll tax totals for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculatePayrollTaxTotals',
        'Failed to calculate payroll tax totals',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
