/**
 * Recipient Group Entity Service
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 *
 * Handles CRUD operations for recipient groups (saved recipient lists).
 * Supports system-defined and user-created groups.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RecipientGroup, Prisma } from '@prisma/client';
import {
  RecipientType,
  CreateRecipientGroupData,
  RecipientFilterCriteria,
} from '../types/communication.types';

@Injectable()
export class RecipientGroupEntity {
  private readonly logger = new Logger(RecipientGroupEntity.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new recipient group
   */
  async create(
    data: CreateRecipientGroupData,
    userId: string,
  ): Promise<RecipientGroup> {
    this.logger.debug(
      `Creating recipient group "${data.name}" for tenant ${data.tenantId}`,
    );

    return this.prisma.recipientGroup.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        recipientType: data.recipientType,
        filterCriteria: data.filterCriteria as Prisma.JsonObject,
        isSystem: data.isSystem ?? false,
        createdBy: userId,
      },
    });
  }

  /**
   * Find recipient group by ID
   */
  async findById(id: string): Promise<RecipientGroup | null> {
    return this.prisma.recipientGroup.findUnique({
      where: { id },
    });
  }

  /**
   * Find recipient groups by tenant
   */
  async findByTenant(
    tenantId: string,
    recipientType?: RecipientType,
  ): Promise<RecipientGroup[]> {
    const where: Prisma.RecipientGroupWhereInput = { tenantId };

    if (recipientType) {
      where.recipientType = recipientType;
    }

    return this.prisma.recipientGroup.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Find recipient group by name (unique within tenant)
   */
  async findByName(
    tenantId: string,
    name: string,
  ): Promise<RecipientGroup | null> {
    return this.prisma.recipientGroup.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name,
        },
      },
    });
  }

  /**
   * Update a recipient group
   */
  async update(
    tenantId: string,
    id: string,
    data: Partial<CreateRecipientGroupData>,
  ): Promise<RecipientGroup> {
    const group = await this.findById(id);
    if (!group) {
      throw new NotFoundException(`Recipient group ${id} not found`);
    }

    if (group.tenantId !== tenantId) {
      throw new NotFoundException(`Recipient group ${id} not found`);
    }

    if (group.isSystem) {
      throw new BadRequestException('Cannot update system groups');
    }

    return this.prisma.recipientGroup.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        recipientType: data.recipientType,
        filterCriteria: data.filterCriteria
          ? (data.filterCriteria as Prisma.JsonObject)
          : undefined,
      },
    });
  }

  /**
   * Delete a recipient group
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const group = await this.findById(id);
    if (!group) {
      throw new NotFoundException(`Recipient group ${id} not found`);
    }

    if (group.tenantId !== tenantId) {
      throw new NotFoundException(`Recipient group ${id} not found`);
    }

    if (group.isSystem) {
      throw new BadRequestException('Cannot delete system groups');
    }

    await this.prisma.recipientGroup.delete({
      where: { id },
    });
  }

  /**
   * Get filter criteria for a group
   */
  async getFilterCriteria(id: string): Promise<RecipientFilterCriteria | null> {
    const group = await this.findById(id);
    if (!group) {
      return null;
    }
    return group.filterCriteria as unknown as RecipientFilterCriteria;
  }

  /**
   * Seed system groups for a tenant
   * Called when a tenant is created
   */
  async seedSystemGroups(tenantId: string): Promise<void> {
    this.logger.log(`Seeding system recipient groups for tenant ${tenantId}`);

    const systemGroups: Array<{
      name: string;
      description: string;
      recipientType: RecipientType;
      filterCriteria: RecipientFilterCriteria;
    }> = [
      {
        name: 'All Active Parents',
        description: 'All parents with active enrollments',
        recipientType: RecipientType.PARENT,
        filterCriteria: {
          parentFilter: { isActive: true },
        },
      },
      {
        name: 'All Staff',
        description: 'All active staff members',
        recipientType: RecipientType.STAFF,
        filterCriteria: {
          staffFilter: { isActive: true },
        },
      },
      {
        name: 'Parents with Arrears',
        description: 'Parents with outstanding balance',
        recipientType: RecipientType.PARENT,
        filterCriteria: {
          parentFilter: { isActive: true, hasOutstandingBalance: true },
        },
      },
      {
        name: 'Parents 30+ Days Overdue',
        description: 'Parents with invoices overdue by 30+ days',
        recipientType: RecipientType.PARENT,
        filterCriteria: {
          parentFilter: { isActive: true, daysOverdue: 30 },
        },
      },
      {
        name: 'WhatsApp Enabled Parents',
        description: 'Parents who have opted in to WhatsApp messages',
        recipientType: RecipientType.PARENT,
        filterCriteria: {
          parentFilter: { isActive: true, whatsappOptIn: true },
        },
      },
    ];

    for (const group of systemGroups) {
      await this.prisma.recipientGroup.upsert({
        where: {
          tenantId_name: {
            tenantId,
            name: group.name,
          },
        },
        create: {
          tenantId,
          name: group.name,
          description: group.description,
          recipientType: group.recipientType,
          filterCriteria: group.filterCriteria as Prisma.JsonObject,
          isSystem: true,
        },
        update: {
          description: group.description,
          filterCriteria: group.filterCriteria as Prisma.JsonObject,
        },
      });
    }

    this.logger.log(
      `Seeded ${systemGroups.length} system groups for tenant ${tenantId}`,
    );
  }

  /**
   * Check if system groups exist for a tenant
   */
  async hasSystemGroups(tenantId: string): Promise<boolean> {
    const count = await this.prisma.recipientGroup.count({
      where: {
        tenantId,
        isSystem: true,
      },
    });
    return count > 0;
  }

  /**
   * Count groups by tenant
   */
  async countByTenant(tenantId: string): Promise<number> {
    return this.prisma.recipientGroup.count({
      where: { tenantId },
    });
  }
}
