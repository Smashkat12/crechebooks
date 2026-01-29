/**
 * Communication Operations MCP Tools
 * TASK-SDK-005: CrecheBooks Communication Tools
 *
 * MCP tools for broadcast messaging to parents and staff.
 * Supports multi-channel delivery (email, WhatsApp, SMS).
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

// ============================================
// Input Types
// ============================================

export interface ListBroadcastsInput {
  tenantId: string;
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partially_sent' | 'failed' | 'cancelled';
  recipientType?: 'parent' | 'staff' | 'custom';
  limit?: number;
  page?: number;
}

export interface CreateBroadcastInput {
  tenantId: string;
  subject?: string;
  body: string;
  recipientType: 'parent' | 'staff' | 'custom';
  channel: 'email' | 'whatsapp' | 'sms' | 'all';
  recipientFilter?: {
    parentFilter?: {
      isActive?: boolean;
      hasOutstandingBalance?: boolean;
      daysOverdue?: number;
    };
    staffFilter?: {
      isActive?: boolean;
      employmentType?: string[];
    };
    selectedIds?: string[];
  };
  scheduledAt?: string;
  userId?: string;
}

export interface SendBroadcastInput {
  tenantId: string;
  broadcastId: string;
  userId?: string;
}

export interface PreviewRecipientsInput {
  tenantId: string;
  recipientType: 'parent' | 'staff';
  channel: 'email' | 'whatsapp' | 'sms' | 'all';
  filter?: {
    parentFilter?: {
      isActive?: boolean;
      hasOutstandingBalance?: boolean;
    };
    staffFilter?: {
      isActive?: boolean;
    };
  };
}

// ============================================
// Output Types
// ============================================

export interface BroadcastRecord {
  id: string;
  subject: string | null;
  body: string;
  recipientType: string;
  channel: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
}

export interface RecipientPreview {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

// ============================================
// Tool Implementations
// ============================================

/**
 * List broadcast messages with filtering
 */
export function listBroadcasts(
  prisma: PrismaService,
): McpToolDefinition<ListBroadcastsInput, McpToolResult<BroadcastRecord[]>> {
  return {
    name: 'list_broadcasts',
    description:
      'List broadcast messages with optional filtering by status and recipient type. Returns paginated results.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'scheduled', 'sending', 'sent', 'partially_sent', 'failed', 'cancelled'],
          description: 'Filter by broadcast status',
        },
        recipientType: {
          type: 'string',
          enum: ['parent', 'staff', 'custom'],
          description: 'Filter by recipient type',
        },
        limit: {
          type: 'number',
          description: 'Number of results per page (default 20)',
          default: 20,
        },
        page: {
          type: 'number',
          description: 'Page number (1-indexed)',
          default: 1,
        },
      },
      required: ['tenantId'],
    },
    handler: async (args: ListBroadcastsInput): Promise<McpToolResult<BroadcastRecord[]>> => {
      const startTime = Date.now();
      const limit = args.limit || 20;
      const page = args.page || 1;
      const skip = (page - 1) * limit;

      try {
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (args.status) {
          where.status = args.status;
        }

        if (args.recipientType) {
          where.recipientType = args.recipientType;
        }

        const broadcasts = await prisma.broadcastMessage.findMany({
          where,
          take: limit,
          skip,
          orderBy: { createdAt: 'desc' },
        });

        const results: BroadcastRecord[] = broadcasts.map((b) => ({
          id: b.id,
          subject: b.subject,
          body: b.body,
          recipientType: b.recipientType,
          channel: b.channel,
          status: b.status,
          totalRecipients: b.totalRecipients,
          sentCount: b.sentCount,
          failedCount: b.failedCount,
          createdAt: b.createdAt.toISOString(),
          scheduledAt: b.scheduledAt?.toISOString() || null,
          sentAt: b.sentAt?.toISOString() || null,
        }));

        return {
          success: true,
          data: results,
          metadata: {
            toolName: 'list_broadcasts',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: results.length,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to list broadcasts: ${errorMessage}`,
          metadata: {
            toolName: 'list_broadcasts',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create a new broadcast message
 */
export function createBroadcast(
  prisma: PrismaService,
): McpToolDefinition<CreateBroadcastInput, McpToolResult<BroadcastRecord>> {
  return {
    name: 'create_broadcast',
    description:
      'Create a new broadcast message for parents or staff. The broadcast is created as a draft and must be explicitly sent.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        subject: {
          type: 'string',
          description: 'Email subject (for email channel)',
        },
        body: {
          type: 'string',
          description: 'Message body (plain text)',
        },
        recipientType: {
          type: 'string',
          enum: ['parent', 'staff', 'custom'],
          description: 'Target recipient type',
        },
        channel: {
          type: 'string',
          enum: ['email', 'whatsapp', 'sms', 'all'],
          description: 'Communication channel',
        },
        recipientFilter: {
          type: 'object',
          description: 'Filter criteria for recipient selection',
        },
        scheduledAt: {
          type: 'string',
          description: 'Schedule for future delivery (ISO 8601)',
        },
        userId: {
          type: 'string',
          description: 'User ID creating the broadcast (for audit)',
        },
      },
      required: ['tenantId', 'body', 'recipientType', 'channel'],
    },
    handler: async (args: CreateBroadcastInput): Promise<McpToolResult<BroadcastRecord>> => {
      const startTime = Date.now();

      try {
        // Count recipients based on type
        let totalRecipients = 0;

        if (args.recipientType === 'parent') {
          totalRecipients = await prisma.parent.count({
            where: {
              tenantId: args.tenantId,
              isActive: true,
            },
          });
        } else if (args.recipientType === 'staff') {
          totalRecipients = await prisma.staff.count({
            where: {
              tenantId: args.tenantId,
              isActive: true,
            },
          });
        }

        const broadcast = await prisma.broadcastMessage.create({
          data: {
            tenantId: args.tenantId,
            subject: args.subject,
            body: args.body,
            recipientType: args.recipientType,
            recipientFilter: args.recipientFilter as object || undefined,
            channel: args.channel,
            status: 'draft',
            totalRecipients,
            scheduledAt: args.scheduledAt ? new Date(args.scheduledAt) : undefined,
            createdBy: args.userId || 'system',
          },
        });

        return {
          success: true,
          data: {
            id: broadcast.id,
            subject: broadcast.subject,
            body: broadcast.body,
            recipientType: broadcast.recipientType,
            channel: broadcast.channel,
            status: broadcast.status,
            totalRecipients: broadcast.totalRecipients,
            sentCount: broadcast.sentCount,
            failedCount: broadcast.failedCount,
            createdAt: broadcast.createdAt.toISOString(),
            scheduledAt: broadcast.scheduledAt?.toISOString() || null,
            sentAt: broadcast.sentAt?.toISOString() || null,
          },
          metadata: {
            toolName: 'create_broadcast',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to create broadcast: ${errorMessage}`,
          metadata: {
            toolName: 'create_broadcast',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Preview recipients for a broadcast
 */
export function previewRecipients(
  prisma: PrismaService,
): McpToolDefinition<PreviewRecipientsInput, McpToolResult<{ total: number; recipients: RecipientPreview[] }>> {
  return {
    name: 'preview_recipients',
    description:
      'Preview recipients that would receive a broadcast based on filter criteria. Returns count and sample of recipients.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        recipientType: {
          type: 'string',
          enum: ['parent', 'staff'],
          description: 'Target recipient type',
        },
        channel: {
          type: 'string',
          enum: ['email', 'whatsapp', 'sms', 'all'],
          description: 'Communication channel',
        },
        filter: {
          type: 'object',
          description: 'Filter criteria',
        },
      },
      required: ['tenantId', 'recipientType', 'channel'],
    },
    handler: async (
      args: PreviewRecipientsInput,
    ): Promise<McpToolResult<{ total: number; recipients: RecipientPreview[] }>> => {
      const startTime = Date.now();

      try {
        let recipients: RecipientPreview[] = [];
        let total = 0;

        if (args.recipientType === 'parent') {
          const parents = await prisma.parent.findMany({
            where: {
              tenantId: args.tenantId,
              isActive: args.filter?.parentFilter?.isActive ?? true,
            },
            take: 20,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          });

          total = await prisma.parent.count({
            where: {
              tenantId: args.tenantId,
              isActive: args.filter?.parentFilter?.isActive ?? true,
            },
          });

          recipients = parents.map((p) => ({
            id: p.id,
            name: `${p.firstName} ${p.lastName}`,
            email: p.email,
            phone: p.phone,
          }));
        } else if (args.recipientType === 'staff') {
          const staff = await prisma.staff.findMany({
            where: {
              tenantId: args.tenantId,
              isActive: args.filter?.staffFilter?.isActive ?? true,
            },
            take: 20,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          });

          total = await prisma.staff.count({
            where: {
              tenantId: args.tenantId,
              isActive: args.filter?.staffFilter?.isActive ?? true,
            },
          });

          recipients = staff.map((s) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`,
            email: s.email,
            phone: s.phone,
          }));
        }

        return {
          success: true,
          data: {
            total,
            recipients,
          },
          metadata: {
            toolName: 'preview_recipients',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: recipients.length,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to preview recipients: ${errorMessage}`,
          metadata: {
            toolName: 'preview_recipients',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Send a draft broadcast
 */
export function sendBroadcast(
  prisma: PrismaService,
): McpToolDefinition<SendBroadcastInput, McpToolResult<{ broadcastId: string; status: string }>> {
  return {
    name: 'send_broadcast',
    description:
      'Queue a draft broadcast for sending. The broadcast will be processed in the background.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        broadcastId: {
          type: 'string',
          description: 'Broadcast ID to send',
        },
        userId: {
          type: 'string',
          description: 'User ID sending the broadcast (for audit)',
        },
      },
      required: ['tenantId', 'broadcastId'],
    },
    handler: async (
      args: SendBroadcastInput,
    ): Promise<McpToolResult<{ broadcastId: string; status: string }>> => {
      const startTime = Date.now();

      try {
        // Verify broadcast exists and is draft
        const broadcast = await prisma.broadcastMessage.findFirst({
          where: {
            id: args.broadcastId,
            tenantId: args.tenantId,
          },
        });

        if (!broadcast) {
          return {
            success: false,
            error: `Broadcast ${args.broadcastId} not found`,
            metadata: {
              toolName: 'send_broadcast',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        if (broadcast.status !== 'draft') {
          return {
            success: false,
            error: `Cannot send broadcast with status: ${broadcast.status}. Only DRAFT broadcasts can be sent.`,
            metadata: {
              toolName: 'send_broadcast',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Update status to scheduled (queue processor will pick it up)
        await prisma.broadcastMessage.update({
          where: { id: args.broadcastId },
          data: {
            status: 'scheduled',
          },
        });

        return {
          success: true,
          data: {
            broadcastId: args.broadcastId,
            status: 'scheduled',
          },
          metadata: {
            toolName: 'send_broadcast',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to send broadcast: ${errorMessage}`,
          metadata: {
            toolName: 'send_broadcast',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}
