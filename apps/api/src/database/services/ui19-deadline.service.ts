/**
 * UI-19 Deadline Service
 * TASK-STAFF-006: Enforce UI-19 14-Day Deadline
 *
 * Handles UI-19 submission deadline tracking and enforcement for South African UIF compliance.
 * The UI-19 form must be submitted to the Department of Labour within 14 days of:
 * - An employee starting work (commencement)
 * - An employee leaving work (termination)
 *
 * Reference: Unemployment Insurance Act 63 of 2001
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  UI19Type,
  UI19Status,
  UI19AlertSeverity,
  IUI19DeadlineConfig,
  IUI19Alert,
  IUI19Submission,
  UI19_DEFAULTS,
  UI19_CONFIG_KEYS,
} from '../constants/ui19.constants';

/**
 * Staff data required for submission creation
 */
export interface IUI19StaffData {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  startDate: Date;
  endDate?: Date | null;
}

/**
 * Options for creating a submission
 */
export interface ICreateSubmissionOptions {
  notes?: string;
}

/**
 * Options for submitting a UI-19 form
 */
export interface ISubmitUI19Options {
  referenceNumber?: string;
  lateReason?: string;
  notes?: string;
}

/**
 * Dashboard filter options
 */
export interface IUI19FilterOptions {
  status?: UI19Status | UI19Status[];
  type?: UI19Type;
  includeSubmitted?: boolean;
}

@Injectable()
export class UI19DeadlineService {
  private readonly logger = new Logger(UI19DeadlineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get deadline configuration from environment/tenant settings
   */
  getConfig(): IUI19DeadlineConfig {
    return {
      deadlineDays:
        this.configService.get<number>(UI19_CONFIG_KEYS.DEADLINE_DAYS) ??
        UI19_DEFAULTS.deadlineDays,
      warningDays:
        this.configService.get<number>(UI19_CONFIG_KEYS.WARNING_DAYS) ??
        UI19_DEFAULTS.warningDays,
      enforcementMode:
        (this.configService.get<string>(
          UI19_CONFIG_KEYS.ENFORCEMENT_MODE,
        ) as IUI19DeadlineConfig['enforcementMode']) ??
        UI19_DEFAULTS.enforcementMode,
    };
  }

  /**
   * Calculate due date based on event date
   * Due date is 14 days (configurable) from the event date
   *
   * @param eventDate - The start or end date of employment
   * @returns Due date for UI-19 submission
   */
  calculateDueDate(eventDate: Date): Date {
    const config = this.getConfig();
    const date = new Date(eventDate);
    // Start of the event day
    date.setHours(0, 0, 0, 0);
    // Add deadline days
    date.setDate(date.getDate() + config.deadlineDays);
    return date;
  }

  /**
   * Calculate days remaining until deadline
   *
   * @param dueDate - The deadline date
   * @returns Number of days remaining (negative if overdue)
   */
  getDaysRemaining(dueDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Check if a submission is overdue
   *
   * @param dueDate - The deadline date
   * @returns True if past deadline
   */
  isOverdue(dueDate: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return today > due;
  }

  /**
   * Check if a submission is approaching its deadline
   * (within the warning period but not yet overdue)
   *
   * @param dueDate - The deadline date
   * @returns True if within warning period
   */
  isApproachingDeadline(dueDate: Date): boolean {
    const config = this.getConfig();
    const daysRemaining = this.getDaysRemaining(dueDate);
    return daysRemaining <= config.warningDays && daysRemaining > 0;
  }

  /**
   * Get alert severity based on days remaining
   *
   * @param dueDate - The deadline date
   * @returns Alert severity level
   */
  getAlertSeverity(dueDate: Date): UI19AlertSeverity {
    if (this.isOverdue(dueDate)) {
      return 'critical';
    }
    if (this.isApproachingDeadline(dueDate)) {
      return 'warning';
    }
    return 'info';
  }

  /**
   * Create a commencement submission for a new staff member
   *
   * @param staff - Staff data including start date
   * @param options - Optional notes
   * @returns Created submission record
   */
  async createCommencementSubmission(
    staff: IUI19StaffData,
    options?: ICreateSubmissionOptions,
  ): Promise<IUI19Submission> {
    this.logger.log(
      `Creating UI-19 commencement submission for staff ${staff.id}`,
    );

    const dueDate = this.calculateDueDate(staff.startDate);

    // Check for existing submission to avoid duplicates
    const existing = await this.prisma.uI19Submission.findFirst({
      where: {
        staffId: staff.id,
        type: UI19Type.COMMENCEMENT,
        eventDate: staff.startDate,
      },
    });

    if (existing) {
      this.logger.warn(
        `Commencement submission already exists for staff ${staff.id}`,
      );
      return existing as unknown as IUI19Submission;
    }

    const submission = await this.prisma.uI19Submission.create({
      data: {
        staffId: staff.id,
        tenantId: staff.tenantId,
        type: UI19Type.COMMENCEMENT,
        eventDate: staff.startDate,
        dueDate,
        status: UI19Status.PENDING,
        notes: options?.notes,
      },
    });

    this.logger.log(
      `Created commencement submission ${submission.id} for staff ${staff.id}, due ${dueDate.toISOString()}`,
    );

    return submission as unknown as IUI19Submission;
  }

  /**
   * Create a termination submission for a departing staff member
   *
   * @param staff - Staff data
   * @param endDate - The last working day
   * @param options - Optional notes
   * @returns Created submission record
   */
  async createTerminationSubmission(
    staff: IUI19StaffData,
    endDate: Date,
    options?: ICreateSubmissionOptions,
  ): Promise<IUI19Submission> {
    this.logger.log(
      `Creating UI-19 termination submission for staff ${staff.id}`,
    );

    const dueDate = this.calculateDueDate(endDate);

    // Check for existing submission
    const existing = await this.prisma.uI19Submission.findFirst({
      where: {
        staffId: staff.id,
        type: UI19Type.TERMINATION,
        eventDate: endDate,
      },
    });

    if (existing) {
      this.logger.warn(
        `Termination submission already exists for staff ${staff.id}`,
      );
      return existing as unknown as IUI19Submission;
    }

    const submission = await this.prisma.uI19Submission.create({
      data: {
        staffId: staff.id,
        tenantId: staff.tenantId,
        type: UI19Type.TERMINATION,
        eventDate: endDate,
        dueDate,
        status: UI19Status.PENDING,
        notes: options?.notes,
      },
    });

    this.logger.log(
      `Created termination submission ${submission.id} for staff ${staff.id}, due ${dueDate.toISOString()}`,
    );

    return submission as unknown as IUI19Submission;
  }

  /**
   * Submit a UI-19 form
   * Handles late submission enforcement based on configuration
   *
   * @param submissionId - The submission ID
   * @param userId - The user submitting the form
   * @param options - Optional reference number and late reason
   * @returns Updated submission record
   */
  async submitUI19(
    submissionId: string,
    userId: string,
    options?: ISubmitUI19Options,
  ): Promise<IUI19Submission> {
    this.logger.log(`Submitting UI-19 ${submissionId} by user ${userId}`);

    const submission = await this.prisma.uI19Submission.findUnique({
      where: { id: submissionId },
      include: { staff: true },
    });

    if (!submission) {
      throw new NotFoundException(
        `UI-19 submission not found: ${submissionId}`,
      );
    }

    const isLate = this.isOverdue(submission.dueDate);
    const config = this.getConfig();

    // Enforce late submission rules
    if (isLate) {
      if (config.enforcementMode === 'block' && !options?.lateReason) {
        throw new BadRequestException(
          'UI-19 submission is past due date. A reason for late submission is required.',
        );
      }

      if (config.enforcementMode === 'warn') {
        this.logger.warn(
          `Late UI-19 submission for staff ${submission.staffId}: ` +
            `Due ${submission.dueDate.toISOString()}, submitted ${new Date().toISOString()}`,
        );
      }

      if (config.enforcementMode === 'log') {
        this.logger.log(
          `Late UI-19 submission recorded for staff ${submission.staffId}`,
        );
      }
    }

    const updatedSubmission = await this.prisma.uI19Submission.update({
      where: { id: submissionId },
      data: {
        status: isLate ? UI19Status.LATE_SUBMITTED : UI19Status.SUBMITTED,
        submittedAt: new Date(),
        submittedBy: userId,
        referenceNumber: options?.referenceNumber,
        lateReason: isLate ? options?.lateReason : null,
        notes: options?.notes ?? submission.notes,
      },
    });

    this.logger.log(
      `UI-19 ${submissionId} submitted successfully, status: ${updatedSubmission.status}`,
    );

    return updatedSubmission as unknown as IUI19Submission;
  }

  /**
   * Get all pending submissions for a tenant
   *
   * @param tenantId - The tenant ID
   * @param options - Filter options
   * @returns List of pending submissions
   */
  async getPendingSubmissions(
    tenantId: string,
    options?: IUI19FilterOptions,
  ): Promise<IUI19Submission[]> {
    const statusFilter = options?.status
      ? Array.isArray(options.status)
        ? options.status
        : [options.status]
      : [UI19Status.PENDING, UI19Status.OVERDUE];

    const whereClause: any = {
      tenantId,
      status: { in: statusFilter },
    };

    if (options?.type) {
      whereClause.type = options.type;
    }

    const submissions = await this.prisma.uI19Submission.findMany({
      where: whereClause,
      include: { staff: true },
      orderBy: { dueDate: 'asc' },
    });

    return submissions as unknown as IUI19Submission[];
  }

  /**
   * Get all overdue submissions for a tenant
   *
   * @param tenantId - The tenant ID
   * @returns List of overdue submissions
   */
  async getOverdueSubmissions(tenantId: string): Promise<IUI19Submission[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const submissions = await this.prisma.uI19Submission.findMany({
      where: {
        tenantId,
        status: UI19Status.PENDING,
        dueDate: { lt: today },
      },
      include: { staff: true },
      orderBy: { dueDate: 'asc' },
    });

    return submissions as unknown as IUI19Submission[];
  }

  /**
   * Update statuses of overdue submissions
   * Should be called by a scheduled job
   *
   * @param tenantId - The tenant ID
   * @returns Number of submissions updated
   */
  async updateOverdueStatuses(tenantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.uI19Submission.updateMany({
      where: {
        tenantId,
        status: UI19Status.PENDING,
        dueDate: { lt: today },
      },
      data: {
        status: UI19Status.OVERDUE,
      },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Updated ${result.count} submissions to OVERDUE status for tenant ${tenantId}`,
      );
    }

    return result.count;
  }

  /**
   * Get dashboard alerts for a tenant
   * Returns alerts sorted by severity (critical first)
   *
   * @param tenantId - The tenant ID
   * @returns List of alerts with severity levels
   */
  async getDashboardAlerts(tenantId: string): Promise<IUI19Alert[]> {
    const submissions = await this.prisma.uI19Submission.findMany({
      where: {
        tenantId,
        status: { in: [UI19Status.PENDING, UI19Status.OVERDUE] },
      },
      include: { staff: true },
      orderBy: { dueDate: 'asc' },
    });

    const alerts: IUI19Alert[] = submissions.map((submission) => ({
      submissionId: submission.id,
      staffId: submission.staffId,
      staffName: `${submission.staff.firstName} ${submission.staff.lastName}`,
      type: submission.type as UI19Type,
      eventDate: submission.eventDate,
      dueDate: submission.dueDate,
      daysRemaining: this.getDaysRemaining(submission.dueDate),
      isOverdue: this.isOverdue(submission.dueDate),
      isApproaching: this.isApproachingDeadline(submission.dueDate),
      severity: this.getAlertSeverity(submission.dueDate),
    }));

    // Sort by severity: critical first, then warning, then info
    const severityOrder: Record<UI19AlertSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };

    return alerts.sort((a, b) => {
      const severityDiff =
        severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      // Within same severity, sort by days remaining (ascending)
      return a.daysRemaining - b.daysRemaining;
    });
  }

  /**
   * Get a specific submission by ID
   *
   * @param submissionId - The submission ID
   * @returns Submission record or null
   */
  async getSubmissionById(
    submissionId: string,
  ): Promise<IUI19Submission | null> {
    const submission = await this.prisma.uI19Submission.findUnique({
      where: { id: submissionId },
      include: { staff: true },
    });

    return submission as unknown as IUI19Submission | null;
  }

  /**
   * Get all submissions for a specific staff member
   *
   * @param staffId - The staff ID
   * @returns List of submissions
   */
  async getSubmissionsForStaff(staffId: string): Promise<IUI19Submission[]> {
    const submissions = await this.prisma.uI19Submission.findMany({
      where: { staffId },
      orderBy: { createdAt: 'desc' },
    });

    return submissions as unknown as IUI19Submission[];
  }

  /**
   * Get submission statistics for a tenant
   *
   * @param tenantId - The tenant ID
   * @returns Statistics object
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    pending: number;
    submitted: number;
    lateSubmitted: number;
    overdue: number;
    onTimeRate: number;
  }> {
    const [total, pending, submitted, lateSubmitted, overdue] =
      await Promise.all([
        this.prisma.uI19Submission.count({ where: { tenantId } }),
        this.prisma.uI19Submission.count({
          where: { tenantId, status: UI19Status.PENDING },
        }),
        this.prisma.uI19Submission.count({
          where: { tenantId, status: UI19Status.SUBMITTED },
        }),
        this.prisma.uI19Submission.count({
          where: { tenantId, status: UI19Status.LATE_SUBMITTED },
        }),
        this.prisma.uI19Submission.count({
          where: { tenantId, status: UI19Status.OVERDUE },
        }),
      ]);

    const completedCount = submitted + lateSubmitted;
    const onTimeRate =
      completedCount > 0 ? (submitted / completedCount) * 100 : 100;

    return {
      total,
      pending,
      submitted,
      lateSubmitted,
      overdue,
      onTimeRate: Math.round(onTimeRate * 100) / 100,
    };
  }
}
