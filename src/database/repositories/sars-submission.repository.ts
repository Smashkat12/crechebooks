import { Injectable, Logger } from '@nestjs/common';
import { SarsSubmission, Prisma, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSarsSubmissionDto,
  UpdateSarsSubmissionDto,
  SubmitSarsSubmissionDto,
  AcknowledgeSarsSubmissionDto,
  SarsSubmissionFilterDto,
} from '../dto/sars-submission.dto';
import { SubmissionType } from '../entities/sars-submission.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';

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
   * Find SARS submission by ID
   * @returns SarsSubmission or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<SarsSubmission | null> {
    try {
      return await this.prisma.sarsSubmission.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find SARS submission by id: ${id}`,
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
        where.status = filter.status;
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
            in: [SubmissionStatus.DRAFT, SubmissionStatus.READY],
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
    dto: UpdateSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id);
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
        updateData.status = dto.status;
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
  async markAsReady(id: string): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id);
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

      if (existing.status !== SubmissionStatus.DRAFT) {
        throw new BusinessException(
          `Cannot mark SARS submission '${id}' as ready - current status is '${existing.status}', expected 'DRAFT'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.READY,
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
    dto: SubmitSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id);
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

      if (existing.status !== SubmissionStatus.READY) {
        throw new BusinessException(
          `Cannot submit SARS submission '${id}' - current status is '${existing.status}', expected 'READY'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.SUBMITTED,
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
    dto: AcknowledgeSarsSubmissionDto,
  ): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('SarsSubmission', id);
      }

      if (existing.status !== SubmissionStatus.SUBMITTED) {
        throw new BusinessException(
          `Cannot acknowledge SARS submission '${id}' - current status is '${existing.status}', expected 'SUBMITTED'`,
          'INVALID_STATUS',
          { submissionId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.sarsSubmission.update({
        where: { id },
        data: {
          status: SubmissionStatus.ACKNOWLEDGED,
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
  async finalize(id: string): Promise<SarsSubmission> {
    try {
      const existing = await this.findById(id);
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

      if (existing.status !== SubmissionStatus.ACKNOWLEDGED) {
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
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
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

      if (existing.status !== SubmissionStatus.DRAFT) {
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
          status: { not: SubmissionStatus.DRAFT },
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
          status: { not: SubmissionStatus.DRAFT },
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
