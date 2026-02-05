/**
 * Twilio Content API Service
 * TASK-WA-007: Twilio Content API Integration Service
 *
 * Provides rich WhatsApp messaging via Twilio Content API.
 * Uses native fetch API for consistency with existing TwilioWhatsAppService.
 *
 * Supports:
 * - Cards with media headers (PDF invoices, receipts)
 * - Quick reply buttons (Pay Now, Contact Us, Request Extension)
 * - Call-to-action buttons (URL + Phone)
 * - List pickers for interactive menus (session only)
 *
 * IMPORTANT: All templates use tenant.tradingName for branding, NOT "CrecheBooks"
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';
import { BusinessException } from '../../../shared/exceptions';
import {
  ContentTemplate,
  ContentVariable,
  ContentMessageResult,
  TemplateRegistrationResult,
  ApprovalSubmissionResult,
  ContentTemplateDefinition,
  QuickReplyAction,
  ListPickerItem,
  ContentApprovalStatus,
  CONTENT_LIMITS,
} from '../types/content.types';
import { WhatsAppContextType } from '../types/message-history.types';

/**
 * Twilio Content API response for content list
 */
interface TwilioContentListResponse {
  contents: TwilioContentItem[];
  meta: {
    page: number;
    page_size: number;
    first_page_url: string;
    previous_page_url: string | null;
    url: string;
    next_page_url: string | null;
    key: string;
  };
}

/**
 * Twilio Content API response for single content item
 */
interface TwilioContentItem {
  sid: string;
  friendly_name: string;
  language: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
  date_created: string;
  date_updated: string;
  url: string;
  account_sid: string;
}

/**
 * Twilio Messages API response
 */
interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

/**
 * Twilio Content API configuration
 */
interface TwilioContentConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
  statusCallbackUrl?: string;
}

/**
 * Twilio Content API Service
 *
 * Manages Twilio Content API integration for rich WhatsApp templates.
 * Templates are cached in memory and database for performance.
 */
@Injectable()
export class TwilioContentService implements OnModuleInit {
  private readonly logger = new Logger(TwilioContentService.name);
  private config: TwilioContentConfig | null = null;
  private templateCache: Map<string, ContentTemplate> = new Map();
  private readonly contentApiUrl = 'https://content.twilio.com/v1';
  private readonly messagesApiUrl = 'https://api.twilio.com/2010-04-01';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Initialize Twilio client and load templates on module startup
   */
  async onModuleInit(): Promise<void> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const whatsappNumber = this.configService.get<string>(
      'TWILIO_WHATSAPP_NUMBER',
    );
    const statusCallbackUrl = this.configService.get<string>(
      'TWILIO_STATUS_CALLBACK_URL',
    );

    if (accountSid && authToken && whatsappNumber) {
      this.config = {
        accountSid,
        authToken,
        whatsappNumber: whatsappNumber.startsWith('+')
          ? whatsappNumber
          : `+${whatsappNumber}`,
        statusCallbackUrl,
      };
      this.logger.log('Twilio Content API service initialized');

      // Load templates asynchronously to not block startup
      this.loadTemplates().catch((error) => {
        this.logger.warn(
          `Failed to load content templates on startup: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    } else {
      this.logger.warn(
        'Twilio Content API not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER.',
      );
    }
  }

  /**
   * Check if Twilio Content API is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Ensure Twilio is configured, throw if not
   */
  private ensureConfigured(): TwilioContentConfig {
    if (!this.config) {
      throw new BusinessException(
        'Twilio Content API not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER.',
        'TWILIO_CONTENT_NOT_CONFIGURED',
      );
    }
    return this.config;
  }

  /**
   * Get authorization header for Twilio API
   */
  private getAuthHeader(): string {
    const config = this.ensureConfigured();
    return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
  }

  /**
   * Load templates from Twilio and cache locally
   * Also syncs with database for persistence
   */
  async loadTemplates(): Promise<void> {
    const config = this.ensureConfigured();

    try {
      const response = await fetch(
        `${this.contentApiUrl}/Content?PageSize=100`,
        {
          method: 'GET',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || `Failed to load templates: ${response.status}`,
        );
      }

      const data = (await response.json()) as TwilioContentListResponse;

      for (const content of data.contents || []) {
        const template: ContentTemplate = {
          sid: content.sid,
          friendlyName: content.friendly_name,
          language: content.language,
          variables: content.variables || {},
          types: content.types || {},
        };

        this.templateCache.set(content.friendly_name, template);

        // Sync to database for persistence
        await this.syncTemplateToDatabase(template);
      }

      this.logger.log(`Loaded ${this.templateCache.size} content templates`);
    } catch (error) {
      this.logger.error(
        `Failed to load content templates: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Sync template to database for persistence across restarts
   */
  private async syncTemplateToDatabase(
    template: ContentTemplate,
  ): Promise<void> {
    try {
      await this.prisma.whatsAppContentTemplate.upsert({
        where: { friendlyName: template.friendlyName },
        create: {
          friendlyName: template.friendlyName,
          contentSid: template.sid,
          language: template.language,
          category: 'UTILITY',
          contentType: this.detectContentType(template.types),
          approvalStatus: template.approvalStatus,
          variables: template.variables,
        },
        update: {
          contentSid: template.sid,
          language: template.language,
          contentType: this.detectContentType(template.types),
          variables: template.variables,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync template to database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detect content type from types configuration
   */
  private detectContentType(types: Record<string, unknown>): string {
    const typeKeys = Object.keys(types);
    if (typeKeys.length === 0) return 'twilio/text';

    // Return the first content type found
    return typeKeys[0];
  }

  /**
   * Send message using content template with tenant-specific variables
   *
   * IMPORTANT: Variables MUST include tenant branding (tradingName), NOT "CrecheBooks"
   *
   * @param to Recipient phone number in E.164 format
   * @param contentSid Twilio content SID
   * @param variables Template variables (positional: '1', '2', etc.)
   * @param tenantId Optional tenant ID for audit trail
   * @param contextType Optional context type for message history
   * @param contextId Optional context ID (e.g., invoice number)
   */
  async sendContentMessage(
    to: string,
    contentSid: string,
    variables: ContentVariable[],
    tenantId?: string,
    contextType?: WhatsAppContextType,
    contextId?: string,
  ): Promise<ContentMessageResult> {
    const config = this.ensureConfigured();

    // Format phone number for WhatsApp
    const toNumber = this.formatWhatsAppNumber(to);
    const fromWhatsApp = `whatsapp:${config.whatsappNumber}`;

    // Convert array to Twilio format (positional variables)
    const contentVariables: Record<string, string> = {};
    variables.forEach((v, index) => {
      // Use provided key or positional index
      const key = v.key || (index + 1).toString();
      contentVariables[key] = v.value;
    });

    try {
      // Build form data for Twilio Messages API
      const formData = new URLSearchParams();
      formData.append('To', toNumber);
      formData.append('From', fromWhatsApp);
      formData.append('ContentSid', contentSid);

      if (Object.keys(contentVariables).length > 0) {
        formData.append('ContentVariables', JSON.stringify(contentVariables));
      }

      if (config.statusCallbackUrl) {
        formData.append('StatusCallback', config.statusCallbackUrl);
      }

      const response = await fetch(
        `${this.messagesApiUrl}/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        },
      );

      const data = (await response.json()) as TwilioMessageResponse;

      if (!response.ok) {
        this.logger.error({
          message: 'Twilio Content API error',
          status: response.status,
          error: data,
        });

        return {
          success: false,
          error: data.error_message || 'Failed to send content message',
          errorCode: data.error_code?.toString() || 'SEND_FAILED',
        };
      }

      this.logger.log(`Content message sent, SID: ${data.sid}`);

      // Audit log if tenant provided
      if (tenantId) {
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'WhatsAppContentMessage',
          entityId: data.sid,
          action: AuditAction.CREATE,
          afterValue: {
            provider: 'twilio-content',
            to,
            contentSid,
            messageSid: data.sid,
            contextType,
            contextId,
          },
          changeSummary: `WhatsApp content message sent to ${to}`,
        });
      }

      return {
        success: true,
        messageSid: data.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send content message: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'SEND_FAILED',
      };
    }
  }

  /**
   * Send a session message with media attachment (PDF, image, etc.)
   * TASK-WA-010: Option A hybrid approach - send PDFs in session window
   *
   * Session messages with media can be sent during the 24-hour conversation window.
   * The media URL must be publicly accessible (no authentication required).
   *
   * Supported media types:
   * - PDF documents (application/pdf)
   * - Images (image/jpeg, image/png)
   * - Audio (audio/mp3, audio/ogg)
   * - Video (video/mp4)
   *
   * @param to Recipient phone number in E.164 format
   * @param mediaUrl Publicly accessible URL to the media file
   * @param caption Optional caption text for the media
   * @param tenantId Optional tenant ID for audit trail
   */
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    tenantId?: string,
  ): Promise<ContentMessageResult> {
    const config = this.ensureConfigured();

    // Format phone number for WhatsApp
    const toNumber = this.formatWhatsAppNumber(to);
    const fromWhatsApp = `whatsapp:${config.whatsappNumber}`;

    try {
      // Build form data for Twilio Messages API (media message)
      const formData = new URLSearchParams();
      formData.append('To', toNumber);
      formData.append('From', fromWhatsApp);
      formData.append('MediaUrl', mediaUrl);

      if (caption) {
        formData.append('Body', caption);
      }

      if (config.statusCallbackUrl) {
        formData.append('StatusCallback', config.statusCallbackUrl);
      }

      const response = await fetch(
        `${this.messagesApiUrl}/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        },
      );

      const data = (await response.json()) as TwilioMessageResponse;

      if (!response.ok) {
        this.logger.error({
          message: 'Twilio media message error',
          status: response.status,
          error: data,
        });

        return {
          success: false,
          error: data.error_message || 'Failed to send media message',
          errorCode: data.error_code?.toString() || 'MEDIA_SEND_FAILED',
        };
      }

      this.logger.log(`Media message sent, SID: ${data.sid}`);

      // Audit log if tenant provided
      if (tenantId) {
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'WhatsAppMediaMessage',
          entityId: data.sid,
          action: AuditAction.CREATE,
          afterValue: {
            provider: 'twilio',
            to,
            mediaUrl,
            messageSid: data.sid,
            hasCaption: !!caption,
          },
          changeSummary: `WhatsApp media message sent to ${to}`,
        });
      }

      return {
        success: true,
        messageSid: data.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send media message: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'MEDIA_MESSAGE_FAILED',
      };
    }
  }

  /**
   * Send a plain text session message
   * TASK-WA-009: Session messages for button response follow-ups
   *
   * Session messages can be sent during the 24-hour conversation window
   * without requiring an approved template.
   *
   * @param to Recipient phone number in E.164 format
   * @param body Message body text
   * @param tenantId Optional tenant ID for audit trail
   */
  async sendSessionMessage(
    to: string,
    body: string,
    tenantId?: string,
  ): Promise<ContentMessageResult> {
    const config = this.ensureConfigured();

    // Format phone number for WhatsApp
    const toNumber = this.formatWhatsAppNumber(to);
    const fromWhatsApp = `whatsapp:${config.whatsappNumber}`;

    try {
      // Build form data for Twilio Messages API (plain text message)
      const formData = new URLSearchParams();
      formData.append('To', toNumber);
      formData.append('From', fromWhatsApp);
      formData.append('Body', body);

      if (config.statusCallbackUrl) {
        formData.append('StatusCallback', config.statusCallbackUrl);
      }

      const response = await fetch(
        `${this.messagesApiUrl}/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        },
      );

      const data = (await response.json()) as TwilioMessageResponse;

      if (!response.ok) {
        this.logger.error({
          message: 'Twilio session message error',
          status: response.status,
          error: data,
        });

        return {
          success: false,
          error: data.error_message || 'Failed to send session message',
          errorCode: data.error_code?.toString() || 'SEND_FAILED',
        };
      }

      this.logger.log(`Session message sent, SID: ${data.sid}`);

      // Audit log if tenant provided
      if (tenantId) {
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'WhatsAppSessionMessage',
          entityId: data.sid,
          action: AuditAction.CREATE,
          afterValue: {
            provider: 'twilio',
            to,
            messageSid: data.sid,
            bodyLength: body.length,
          },
          changeSummary: `WhatsApp session message sent to ${to}`,
        });
      }

      return {
        success: true,
        messageSid: data.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send session message: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'SESSION_MESSAGE_FAILED',
      };
    }
  }

  /**
   * Send session message with interactive quick reply buttons
   * Session messages don't require approval but are limited to 3 buttons
   *
   * @param to Recipient phone number
   * @param body Message body text
   * @param buttons Quick reply buttons (max 3)
   * @param tenantId Optional tenant ID for audit
   */
  async sendSessionQuickReply(
    to: string,
    body: string,
    buttons: Array<{ title: string; id: string }>,
    tenantId?: string,
  ): Promise<ContentMessageResult> {
    if (buttons.length > CONTENT_LIMITS.SESSION_QUICK_REPLY_BUTTONS) {
      return {
        success: false,
        error: `Session messages support max ${CONTENT_LIMITS.SESSION_QUICK_REPLY_BUTTONS} quick reply buttons`,
        errorCode: 'BUTTON_LIMIT_EXCEEDED',
      };
    }

    try {
      // Create temporary content for session
      const createResult = await this.createContentTemplate({
        friendlyName: `session_quick_reply_${Date.now()}`,
        language: 'en',
        category: 'UTILITY',
        variables: {},
        types: {
          'twilio/quick-reply': {
            body,
            actions: buttons.map(
              (b): QuickReplyAction => ({
                type: 'QUICK_REPLY',
                title: b.title.substring(0, CONTENT_LIMITS.QUICK_REPLY_TITLE),
                id: b.id.substring(0, CONTENT_LIMITS.QUICK_REPLY_ID),
              }),
            ),
          },
        },
      });

      if (!createResult.success || !createResult.contentSid) {
        return {
          success: false,
          error: createResult.error || 'Failed to create session content',
          errorCode: 'SESSION_CONTENT_FAILED',
        };
      }

      const result = await this.sendContentMessage(
        to,
        createResult.contentSid,
        [],
        tenantId,
        WhatsAppContextType.WELCOME,
      );

      // Clean up temporary content after sending (best effort)
      this.cleanupTemporaryContent(createResult.contentSid).catch(() => {
        // Ignore cleanup errors
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send session quick reply: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'SESSION_QUICK_REPLY_FAILED',
      };
    }
  }

  /**
   * Send list picker message (session only - cannot be approved)
   * Max 10 items
   *
   * @param to Recipient phone number
   * @param body Message body text
   * @param buttonText Button text to open list (max 20 chars)
   * @param items List items (max 10)
   * @param tenantId Optional tenant ID for audit
   */
  async sendListPicker(
    to: string,
    body: string,
    buttonText: string,
    items: ListPickerItem[],
    tenantId?: string,
  ): Promise<ContentMessageResult> {
    if (items.length > CONTENT_LIMITS.MAX_LIST_ITEMS) {
      return {
        success: false,
        error: `List picker supports max ${CONTENT_LIMITS.MAX_LIST_ITEMS} items`,
        errorCode: 'LIST_LIMIT_EXCEEDED',
      };
    }

    try {
      const createResult = await this.createContentTemplate({
        friendlyName: `list_picker_${Date.now()}`,
        language: 'en',
        category: 'UTILITY',
        variables: {},
        types: {
          'twilio/list-picker': {
            body,
            button: buttonText.substring(0, CONTENT_LIMITS.LIST_PICKER_BUTTON),
            items: items.map((i) => ({
              item: i.item.substring(0, CONTENT_LIMITS.LIST_ITEM_TITLE),
              id: i.id.substring(0, CONTENT_LIMITS.LIST_ITEM_ID),
              description: i.description?.substring(
                0,
                CONTENT_LIMITS.LIST_ITEM_DESCRIPTION,
              ),
            })),
          },
        },
      });

      if (!createResult.success || !createResult.contentSid) {
        return {
          success: false,
          error: createResult.error || 'Failed to create list picker content',
          errorCode: 'LIST_PICKER_CONTENT_FAILED',
        };
      }

      const result = await this.sendContentMessage(
        to,
        createResult.contentSid,
        [],
        tenantId,
        WhatsAppContextType.WELCOME,
      );

      // Clean up temporary content after sending
      this.cleanupTemporaryContent(createResult.contentSid).catch(() => {
        // Ignore cleanup errors
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send list picker: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'LIST_PICKER_FAILED',
      };
    }
  }

  /**
   * Get template by friendly name from cache
   *
   * @param friendlyName Template friendly name
   */
  getTemplate(friendlyName: string): ContentTemplate | undefined {
    return this.templateCache.get(friendlyName);
  }

  /**
   * Get template by friendly name, loading from database if not in cache
   *
   * @param friendlyName Template friendly name
   */
  async getTemplateAsync(
    friendlyName: string,
  ): Promise<ContentTemplate | null> {
    // Check cache first
    const cached = this.templateCache.get(friendlyName);
    if (cached) return cached;

    // Load from database
    const dbTemplate = await this.prisma.whatsAppContentTemplate.findUnique({
      where: { friendlyName },
    });

    if (!dbTemplate) return null;

    const template: ContentTemplate = {
      sid: dbTemplate.contentSid,
      friendlyName: dbTemplate.friendlyName,
      language: dbTemplate.language,
      variables: (dbTemplate.variables as Record<string, string>) || {},
      types: {},
      approvalStatus: dbTemplate.approvalStatus as
        | ContentApprovalStatus
        | undefined,
    };

    // Cache for future use
    this.templateCache.set(friendlyName, template);

    return template;
  }

  /**
   * Register a new content template with Twilio
   *
   * @param definition Template definition
   */
  async registerTemplate(
    definition: ContentTemplateDefinition,
  ): Promise<TemplateRegistrationResult> {
    return this.createContentTemplate(definition);
  }

  /**
   * Create a content template in Twilio Content API
   */
  private async createContentTemplate(
    definition: ContentTemplateDefinition,
  ): Promise<TemplateRegistrationResult> {
    const config = this.ensureConfigured();

    try {
      const response = await fetch(`${this.contentApiUrl}/Content`, {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          friendly_name: definition.friendlyName,
          language: definition.language,
          variables: definition.variables,
          types: definition.types,
        }),
      });

      const data = (await response.json()) as TwilioContentItem;

      if (!response.ok) {
        const error = data as unknown as { message?: string };
        throw new Error(
          error.message || `Failed to create template: ${response.status}`,
        );
      }

      const template: ContentTemplate = {
        sid: data.sid,
        friendlyName: data.friendly_name,
        language: data.language,
        variables: data.variables || {},
        types: data.types || {},
      };

      // Cache and persist
      this.templateCache.set(definition.friendlyName, template);
      await this.syncTemplateToDatabase(template);

      this.logger.log(
        `Registered content template: ${definition.friendlyName} (${data.sid})`,
      );

      return {
        success: true,
        contentSid: data.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register template: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Submit template for WhatsApp approval
   * Required for templates used outside the 24-hour session window
   *
   * @param contentSid Twilio content SID
   * @param category Template category (UTILITY, MARKETING, AUTHENTICATION)
   */
  async submitForApproval(
    contentSid: string,
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' = 'UTILITY',
  ): Promise<ApprovalSubmissionResult> {
    const config = this.ensureConfigured();

    try {
      const response = await fetch(
        `${this.contentApiUrl}/Content/${contentSid}/ApprovalRequests/whatsapp`,
        {
          method: 'POST',
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: category.toLowerCase(),
            category,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || `Failed to submit for approval: ${response.status}`,
        );
      }

      // Update database with approval status
      await this.prisma.whatsAppContentTemplate.updateMany({
        where: { contentSid },
        data: {
          approvalStatus: 'pending',
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Submitted template ${contentSid} for approval (${category})`,
      );

      return {
        success: true,
        status: 'pending',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to submit for approval: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get approval status for a template
   *
   * @param contentSid Twilio content SID
   */
  async getApprovalStatus(
    contentSid: string,
  ): Promise<ContentApprovalStatus | null> {
    const config = this.ensureConfigured();

    try {
      const response = await fetch(
        `${this.contentApiUrl}/Content/${contentSid}/ApprovalRequests/whatsapp`,
        {
          method: 'GET',
          headers: {
            Authorization: this.getAuthHeader(),
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get approval status: ${response.status}`);
      }

      const data = (await response.json()) as { status: string };
      const status = data.status as ContentApprovalStatus;

      // Update database
      await this.prisma.whatsAppContentTemplate.updateMany({
        where: { contentSid },
        data: {
          approvalStatus: status,
          approvedAt: status === 'approved' ? new Date() : undefined,
          updatedAt: new Date(),
        },
      });

      return status;
    } catch (error) {
      this.logger.warn(
        `Failed to get approval status: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Get all cached templates
   */
  getAllTemplates(): ContentTemplate[] {
    return Array.from(this.templateCache.values());
  }

  /**
   * Refresh template cache from Twilio
   */
  async refreshCache(): Promise<void> {
    this.templateCache.clear();
    await this.loadTemplates();
  }

  /**
   * Format phone number for WhatsApp
   */
  private formatWhatsAppNumber(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // Assume South African number if starts with 0
      if (cleaned.startsWith('0')) {
        cleaned = '+27' + cleaned.slice(1);
      } else if (cleaned.startsWith('27')) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    return `whatsapp:${cleaned}`;
  }

  /**
   * Clean up temporary content after sending
   */
  private async cleanupTemporaryContent(contentSid: string): Promise<void> {
    if (!this.config) return;

    try {
      await fetch(`${this.contentApiUrl}/Content/${contentSid}`, {
        method: 'DELETE',
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });
    } catch (error) {
      // Log but don't throw - cleanup is best effort
      this.logger.warn(`Failed to cleanup temporary content ${contentSid}`);
    }
  }
}
