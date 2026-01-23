/**
 * ReminderTemplateService
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 *
 * @module billing/reminder-template
 * @description Manages tenant-specific reminder templates with stage-based
 * escalation, multi-channel support, and template rendering.
 *
 * CRITICAL: All queries MUST filter by tenantId (multi-tenant isolation)
 * CRITICAL: Fail fast with detailed logging BEFORE throwing
 * CRITICAL: Try-catch with logging before throwing
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  ReminderStage,
  ReminderChannel,
  CreateReminderTemplateDto,
  UpdateReminderTemplateDto,
  ReminderTemplateResponse,
  TemplateVariables,
  DEFAULT_TEMPLATES,
  getDefaultTemplate,
} from './dto/reminder-template.dto';
import { NotFoundException, BusinessException } from '../shared/exceptions';

/**
 * Map Prisma ReminderTemplate to Response DTO
 */
function mapToResponse(template: {
  id: string;
  tenantId: string;
  stage: string;
  daysOverdue: number;
  channels: string[];
  emailSubject: string | null;
  emailBody: string | null;
  whatsappBody: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ReminderTemplateResponse {
  return {
    id: template.id,
    tenantId: template.tenantId,
    stage: template.stage as ReminderStage,
    daysOverdue: template.daysOverdue,
    channels: template.channels as ReminderChannel[],
    emailSubject: template.emailSubject,
    emailBody: template.emailBody,
    whatsappBody: template.whatsappBody,
    isActive: template.isActive,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

@Injectable()
export class ReminderTemplateService {
  private readonly logger = new Logger(ReminderTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all reminder templates for a tenant
   *
   * Returns all active and inactive templates, ordered by daysOverdue.
   *
   * @param tenantId - Tenant ID for isolation
   * @returns Array of reminder templates
   */
  async getTemplates(tenantId: string): Promise<ReminderTemplateResponse[]> {
    this.logger.log(`Getting all templates for tenant ${tenantId}`);

    try {
      const templates = await this.prisma.reminderTemplate.findMany({
        where: { tenantId: tenantId ?? undefined },
        orderBy: { daysOverdue: 'asc' },
      });

      return templates.map(mapToResponse);
    } catch (error) {
      this.logger.error(
        `Failed to get templates for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get active templates only for a tenant
   *
   * @param tenantId - Tenant ID for isolation
   * @returns Array of active reminder templates
   */
  async getActiveTemplates(
    tenantId: string,
  ): Promise<ReminderTemplateResponse[]> {
    this.logger.log(`Getting active templates for tenant ${tenantId}`);

    try {
      const templates = await this.prisma.reminderTemplate.findMany({
        where: { tenantId: tenantId ?? undefined, isActive: true },
        orderBy: { daysOverdue: 'asc' },
      });

      return templates.map(mapToResponse);
    } catch (error) {
      this.logger.error(
        `Failed to get active templates for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get template for a specific stage
   *
   * Returns the tenant's custom template if available, otherwise null.
   * Caller should fall back to defaults if null is returned.
   *
   * @param tenantId - Tenant ID for isolation
   * @param stage - Reminder stage (FIRST, SECOND, FINAL, ESCALATED)
   * @returns Template for the stage or null if not found
   */
  async getTemplateForStage(
    tenantId: string,
    stage: ReminderStage,
  ): Promise<ReminderTemplateResponse | null> {
    this.logger.debug(
      `Getting template for stage ${stage} (tenant: ${tenantId})`,
    );

    try {
      const template = await this.prisma.reminderTemplate.findUnique({
        where: {
          tenantId_stage: {
            tenantId,
            stage,
          },
        },
      });

      if (!template) {
        this.logger.debug(
          `No custom template found for stage ${stage}, using defaults`,
        );
        return null;
      }

      if (!template.isActive) {
        this.logger.debug(`Template for stage ${stage} is inactive`);
        return null;
      }

      return mapToResponse(template);
    } catch (error) {
      this.logger.error(
        `Failed to get template for stage ${stage} (tenant: ${tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get template by ID
   *
   * @param id - Template ID
   * @param tenantId - Tenant ID for isolation
   * @returns Template or throws NotFoundException
   */
  async getTemplateById(
    id: string,
    tenantId: string,
  ): Promise<ReminderTemplateResponse> {
    this.logger.debug(`Getting template ${id} for tenant ${tenantId}`);

    try {
      const template = await this.prisma.reminderTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!template) {
        this.logger.error(`Template ${id} not found for tenant ${tenantId}`);
        throw new NotFoundException('ReminderTemplate', id);
      }

      return mapToResponse(template);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get template ${id} (tenant: ${tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Create or update a reminder template
   *
   * Uses upsert to create new template or update existing one for the stage.
   * Each tenant can have one template per stage.
   *
   * @param tenantId - Tenant ID for isolation
   * @param data - Template data
   * @returns Created or updated template
   */
  async upsertTemplate(
    tenantId: string,
    data: CreateReminderTemplateDto,
  ): Promise<ReminderTemplateResponse> {
    this.logger.log(
      `Upserting template for stage ${data.stage} (tenant: ${tenantId})`,
    );

    try {
      // Validate email content if email channel is included
      if (
        data.channels.includes(ReminderChannel.EMAIL) &&
        (!data.emailSubject || !data.emailBody)
      ) {
        this.logger.error('Email channel requires emailSubject and emailBody');
        throw new BusinessException(
          'Email channel requires emailSubject and emailBody',
          'INVALID_TEMPLATE_CONTENT',
        );
      }

      // Validate WhatsApp content if WhatsApp channel is included
      if (
        data.channels.includes(ReminderChannel.WHATSAPP) &&
        !data.whatsappBody
      ) {
        this.logger.error('WhatsApp channel requires whatsappBody');
        throw new BusinessException(
          'WhatsApp channel requires whatsappBody',
          'INVALID_TEMPLATE_CONTENT',
        );
      }

      const template = await this.prisma.reminderTemplate.upsert({
        where: {
          tenantId_stage: {
            tenantId,
            stage: data.stage,
          },
        },
        update: {
          daysOverdue: data.daysOverdue,
          channels: data.channels,
          emailSubject: data.emailSubject ?? null,
          emailBody: data.emailBody ?? null,
          whatsappBody: data.whatsappBody ?? null,
          isActive: data.isActive ?? true,
        },
        create: {
          tenantId,
          stage: data.stage,
          daysOverdue: data.daysOverdue,
          channels: data.channels,
          emailSubject: data.emailSubject ?? null,
          emailBody: data.emailBody ?? null,
          whatsappBody: data.whatsappBody ?? null,
          isActive: data.isActive ?? true,
        },
      });

      this.logger.log(
        `Template upserted for stage ${data.stage} (id: ${template.id})`,
      );
      return mapToResponse(template);
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(
        `Failed to upsert template for stage ${data.stage} (tenant: ${tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Update an existing template
   *
   * @param id - Template ID
   * @param tenantId - Tenant ID for isolation
   * @param data - Fields to update
   * @returns Updated template
   */
  async updateTemplate(
    id: string,
    tenantId: string,
    data: UpdateReminderTemplateDto,
  ): Promise<ReminderTemplateResponse> {
    this.logger.log(`Updating template ${id} (tenant: ${tenantId})`);

    try {
      // Verify template exists and belongs to tenant
      const existing = await this.prisma.reminderTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        this.logger.error(`Template ${id} not found for tenant ${tenantId}`);
        throw new NotFoundException('ReminderTemplate', id);
      }

      // Validate email content if updating to include email channel
      const channels = data.channels ?? existing.channels;
      if (
        channels.includes(ReminderChannel.EMAIL) &&
        !(data.emailSubject ?? existing.emailSubject) &&
        !(data.emailBody ?? existing.emailBody)
      ) {
        this.logger.error('Email channel requires emailSubject and emailBody');
        throw new BusinessException(
          'Email channel requires emailSubject and emailBody',
          'INVALID_TEMPLATE_CONTENT',
        );
      }

      // Validate WhatsApp content if updating to include WhatsApp channel
      if (
        channels.includes(ReminderChannel.WHATSAPP) &&
        !(data.whatsappBody ?? existing.whatsappBody)
      ) {
        this.logger.error('WhatsApp channel requires whatsappBody');
        throw new BusinessException(
          'WhatsApp channel requires whatsappBody',
          'INVALID_TEMPLATE_CONTENT',
        );
      }

      const template = await this.prisma.reminderTemplate.update({
        where: { id },
        data: {
          daysOverdue: data.daysOverdue,
          channels: data.channels,
          emailSubject: data.emailSubject,
          emailBody: data.emailBody,
          whatsappBody: data.whatsappBody,
          isActive: data.isActive,
        },
      });

      this.logger.log(`Template ${id} updated successfully`);
      return mapToResponse(template);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update template ${id} (tenant: ${tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Delete a template
   *
   * @param id - Template ID
   * @param tenantId - Tenant ID for isolation
   */
  async deleteTemplate(id: string, tenantId?: string): Promise<void> {
    this.logger.log(`Deleting template ${id} (tenant: ${tenantId})`);

    try {
      // Verify template exists and belongs to tenant
      const existing = await this.prisma.reminderTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        this.logger.error(`Template ${id} not found for tenant ${tenantId}`);
        throw new NotFoundException('ReminderTemplate', id);
      }

      await this.prisma.reminderTemplate.delete({
        where: { id },
      });

      this.logger.log(`Template ${id} deleted successfully`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete template ${id} (tenant: ${tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Reset all templates to defaults for a tenant
   *
   * Deletes all custom templates and seeds with default templates.
   *
   * @param tenantId - Tenant ID for isolation
   */
  async resetToDefaults(tenantId: string): Promise<void> {
    this.logger.log(`Resetting templates to defaults for tenant ${tenantId}`);

    try {
      // Delete all existing templates
      await this.prisma.reminderTemplate.deleteMany({
        where: { tenantId: tenantId ?? undefined },
      });

      // Seed defaults
      await this.seedDefaults(tenantId);

      this.logger.log(`Templates reset to defaults for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(
        `Failed to reset templates for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Seed default templates for a tenant
   *
   * Creates all default templates if they don't exist.
   * Does not overwrite existing templates.
   *
   * @param tenantId - Tenant ID for isolation
   */
  async seedDefaults(tenantId: string): Promise<void> {
    this.logger.log(`Seeding default templates for tenant ${tenantId}`);

    try {
      for (const defaultTemplate of DEFAULT_TEMPLATES) {
        // Check if template already exists
        const existing = await this.prisma.reminderTemplate.findUnique({
          where: {
            tenantId_stage: {
              tenantId,
              stage: defaultTemplate.stage,
            },
          },
        });

        if (!existing) {
          await this.prisma.reminderTemplate.create({
            data: {
              tenantId,
              stage: defaultTemplate.stage,
              daysOverdue: defaultTemplate.daysOverdue,
              channels: defaultTemplate.channels,
              emailSubject: defaultTemplate.emailSubject,
              emailBody: defaultTemplate.emailBody,
              whatsappBody: defaultTemplate.whatsappBody,
              isActive: true,
            },
          });
          this.logger.debug(
            `Created default template for stage ${defaultTemplate.stage}`,
          );
        }
      }

      this.logger.log(`Default templates seeded for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(
        `Failed to seed defaults for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Render a template with variable substitution
   *
   * Replaces {{placeholder}} with actual values from variables.
   * Escapes HTML entities for email safety.
   *
   * @param template - Template string with {{placeholders}}
   * @param variables - Key-value pairs for replacement
   * @param escapeHtml - Whether to escape HTML entities (default: true for email)
   * @returns Rendered string with all placeholders replaced
   */
  renderTemplate(
    template: string,
    variables: TemplateVariables,
    escapeHtml = true,
  ): string {
    let result = template;

    // Replace all placeholders
    const replacements: Record<string, string> = {
      '{{parentName}}': variables.parentName,
      '{{childName}}': variables.childName,
      '{{invoiceNumber}}': variables.invoiceNumber,
      '{{amount}}': variables.amount,
      '{{dueDate}}': variables.dueDate,
      '{{daysOverdue}}': variables.daysOverdue,
      '{{crecheName}}': variables.crecheName,
      '{{crechePhone}}': variables.crechePhone,
      '{{crecheEmail}}': variables.crecheEmail,
      '{{bankName}}': variables.bankName ?? '',
      '{{accountNumber}}': variables.accountNumber ?? '',
      '{{branchCode}}': variables.branchCode ?? '',
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      const safeValue = escapeHtml ? this.escapeHtml(value) : value;
      result = result.replaceAll(placeholder, safeValue);
    }

    return result;
  }

  /**
   * Get effective template for a stage
   *
   * Returns tenant's custom template if exists and active,
   * otherwise returns the default template.
   *
   * @param tenantId - Tenant ID for isolation
   * @param stage - Reminder stage
   * @returns Template configuration with content
   */
  async getEffectiveTemplate(
    tenantId: string,
    stage: ReminderStage,
  ): Promise<{
    daysOverdue: number;
    channels: ReminderChannel[];
    emailSubject: string;
    emailBody: string;
    whatsappBody: string;
    isCustom: boolean;
  }> {
    const customTemplate = await this.getTemplateForStage(tenantId, stage);

    if (customTemplate) {
      return {
        daysOverdue: customTemplate.daysOverdue,
        channels: customTemplate.channels,
        emailSubject: customTemplate.emailSubject ?? '',
        emailBody: customTemplate.emailBody ?? '',
        whatsappBody: customTemplate.whatsappBody ?? '',
        isCustom: true,
      };
    }

    // Fall back to default
    const defaultTemplate = getDefaultTemplate(stage);
    if (!defaultTemplate) {
      this.logger.error(`No default template found for stage ${stage}`);
      throw new BusinessException(
        `No template found for stage ${stage}`,
        'TEMPLATE_NOT_FOUND',
      );
    }

    return {
      daysOverdue: defaultTemplate.daysOverdue,
      channels: defaultTemplate.channels,
      emailSubject: defaultTemplate.emailSubject,
      emailBody: defaultTemplate.emailBody,
      whatsappBody: defaultTemplate.whatsappBody,
      isCustom: false,
    };
  }

  /**
   * Escape HTML entities for safe email content
   *
   * Prevents XSS attacks when template variables contain user input.
   *
   * @param text - Text to escape
   * @returns HTML-escaped text
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return text.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
  }
}
