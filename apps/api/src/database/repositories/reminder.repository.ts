/**
 * ReminderRepository
 * TASK-PAY-014: Payment Reminder Service
 *
 * Manages payment reminder persistence with multi-tenant isolation.
 * Implements FAIL FAST principle with comprehensive error handling.
 *
 * CRITICAL: ALL queries filter by tenantId for multi-tenant isolation
 * CRITICAL: Try-catch with logging BEFORE throwing
 * CRITICAL: FAIL FAST - no workarounds
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Reminder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseException, NotFoundException } from '../../shared/exceptions';
import {
  ReminderStatus,
  EscalationLevel,
  DeliveryChannel,
} from '../dto/reminder.dto';

/**
 * DTO for creating a new reminder
 */
export interface CreateReminderData {
  tenantId: string;
  invoiceId: string;
  parentId: string;
  escalationLevel: EscalationLevel;
  deliveryMethod: DeliveryChannel;
  reminderStatus?: ReminderStatus;
  scheduledFor?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  content: string;
  subject?: string;
  failureReason?: string;
}

/**
 * Additional data for status updates
 */
export interface UpdateStatusData {
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failureReason?: string;
}

@Injectable()
export class ReminderRepository {
  private readonly logger = new Logger(ReminderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new reminder
   * @throws NotFoundException if tenant, invoice, or parent doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(data: CreateReminderData): Promise<Reminder> {
    try {
      return await this.prisma.reminder.create({
        data: {
          tenantId: data.tenantId,
          invoiceId: data.invoiceId,
          parentId: data.parentId,
          escalationLevel: data.escalationLevel,
          deliveryMethod: data.deliveryMethod,
          reminderStatus: data.reminderStatus ?? ReminderStatus.PENDING,
          scheduledFor: data.scheduledFor ?? null,
          sentAt: data.sentAt ?? null,
          deliveredAt: data.deliveredAt ?? null,
          readAt: data.readAt ?? null,
          content: data.content,
          subject: data.subject ?? null,
          failureReason: data.failureReason ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create reminder: ${JSON.stringify(data)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('invoice')) {
            throw new NotFoundException('Invoice', data.invoiceId);
          }
          if (field?.includes('parent')) {
            throw new NotFoundException('Parent', data.parentId);
          }
          throw new NotFoundException('Tenant', data.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create reminder',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find reminder by ID with tenant isolation
   * @returns Reminder or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<Reminder | null> {
    try {
      return await this.prisma.reminder.findFirst({
        where: {
          id,
          tenantId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reminder by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find reminder',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all reminders for a specific invoice
   * @returns Array of reminders ordered by creation date (newest first)
   * @throws DatabaseException for database errors
   */
  async findByInvoiceId(
    invoiceId: string,
    tenantId: string,
  ): Promise<Reminder[]> {
    try {
      return await this.prisma.reminder.findMany({
        where: {
          invoiceId,
          tenantId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reminders for invoice: ${invoiceId} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByInvoiceId',
        'Failed to find reminders for invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all reminders for a specific parent
   * @returns Array of reminders ordered by creation date (newest first)
   * @throws DatabaseException for database errors
   */
  async findByParentId(
    parentId: string,
    tenantId: string,
  ): Promise<Reminder[]> {
    try {
      return await this.prisma.reminder.findMany({
        where: {
          parentId,
          tenantId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reminders for parent: ${parentId} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByParentId',
        'Failed to find reminders for parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all PENDING reminders for scheduling
   * @returns Array of pending reminders ordered by scheduled date
   * @throws DatabaseException for database errors
   */
  async findPending(tenantId: string): Promise<Reminder[]> {
    try {
      return await this.prisma.reminder.findMany({
        where: {
          tenantId,
          reminderStatus: ReminderStatus.PENDING,
        },
        orderBy: { scheduledFor: 'asc' },
        include: {
          invoice: true,
          parent: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending reminders for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPending',
        'Failed to find pending reminders',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find recent reminders for an invoice to prevent duplicates
   * Checks for SENT or DELIVERED reminders within the given timeframe
   * @param invoiceId - Invoice to check
   * @param tenantId - Tenant ID for isolation
   * @param sinceDate - Only return reminders created after this date
   * @returns Array of recent reminders
   * @throws DatabaseException for database errors
   */
  async findRecentForInvoice(
    invoiceId: string,
    tenantId: string,
    sinceDate: Date,
  ): Promise<Reminder[]> {
    try {
      return await this.prisma.reminder.findMany({
        where: {
          invoiceId,
          tenantId,
          reminderStatus: {
            in: [ReminderStatus.SENT, ReminderStatus.DELIVERED],
          },
          createdAt: {
            gte: sinceDate,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find recent reminders for invoice: ${invoiceId} for tenant: ${tenantId} since: ${sinceDate.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findRecentForInvoice',
        'Failed to find recent reminders for invoice',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update reminder status with optional additional data
   * @param id - Reminder ID to update
   * @param status - New status
   * @param additionalData - Optional additional fields (sentAt, deliveredAt, readAt, failureReason)
   * @returns Updated reminder
   * @throws NotFoundException if reminder doesn't exist
   * @throws DatabaseException for other database errors
   */
  async updateStatus(
    id: string,
    tenantId: string,
    status: ReminderStatus,
    additionalData?: UpdateStatusData,
  ): Promise<Reminder> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Reminder', id);
      }

      const updateData: Prisma.ReminderUpdateInput = {
        reminderStatus: status,
      };

      if (additionalData) {
        if (additionalData.sentAt !== undefined) {
          updateData.sentAt = additionalData.sentAt;
        }
        if (additionalData.deliveredAt !== undefined) {
          updateData.deliveredAt = additionalData.deliveredAt;
        }
        if (additionalData.readAt !== undefined) {
          updateData.readAt = additionalData.readAt;
        }
        if (additionalData.failureReason !== undefined) {
          updateData.failureReason = additionalData.failureReason;
        }
      }

      return await this.prisma.reminder.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update reminder status: ${id} to ${status} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateStatus',
        'Failed to update reminder status',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
