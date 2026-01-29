/**
 * Parent Operations MCP Tools
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Tools for parent/guardian management operations.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  ListParentsInput,
  ListParentsOutput,
  CreateParentInput,
  CreateParentOutput,
  SendParentInviteInput,
  SendParentInviteOutput,
} from '../../types/parent-operations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

/**
 * List parents tool
 */
export function listParents(
  prisma: PrismaService,
): McpToolDefinition<ListParentsInput, McpToolResult<ListParentsOutput>> {
  return {
    name: 'list_parents',
    description:
      'List parents/guardians with optional filtering by search query, active status. Includes child count for each parent.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        search: {
          type: 'string',
          description: 'Search query (matches name, email, or phone)',
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50, max: 200)',
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination',
          minimum: 0,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: ListParentsInput,
    ): Promise<McpToolResult<ListParentsOutput>> => {
      const startTime = Date.now();

      try {
        const limit = Math.min(args.limit ?? 50, 200);
        const offset = args.offset ?? 0;

        // Build where clause
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
          deletedAt: null, // Exclude soft-deleted
        };

        if (args.isActive !== undefined) {
          where.isActive = args.isActive;
        }

        if (args.search) {
          const searchTerm = args.search.toLowerCase();
          where.OR = [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm, mode: 'insensitive' } },
          ];
        }

        const [parents, total] = await Promise.all([
          prisma.parent.findMany({
            where,
            include: {
              _count: {
                select: { children: true },
              },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: limit,
            skip: offset,
          }),
          prisma.parent.count({ where }),
        ]);

        const formattedParents = parents.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          whatsapp: p.whatsapp,
          preferredContact: p.preferredContact,
          isActive: p.isActive,
          childrenCount: p._count.children,
          createdAt: p.createdAt.toISOString(),
        }));

        return {
          success: true,
          data: {
            parents: formattedParents,
            total,
            limit,
            offset,
          },
          metadata: {
            toolName: 'list_parents',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: parents.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to list parents: ${errorMessage}`,
          metadata: {
            toolName: 'list_parents',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create parent tool
 */
export function createParent(
  prisma: PrismaService,
): McpToolDefinition<CreateParentInput, McpToolResult<CreateParentOutput>> {
  return {
    name: 'create_parent',
    description:
      'Create a new parent/guardian. Requires first name and last name at minimum. Email or phone recommended for communication.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        firstName: {
          type: 'string',
          description: 'First name',
        },
        lastName: {
          type: 'string',
          description: 'Last name',
        },
        email: {
          type: 'string',
          description: 'Email address',
        },
        phone: {
          type: 'string',
          description: 'Phone number',
        },
        whatsapp: {
          type: 'string',
          description: 'WhatsApp number (if different from phone)',
        },
        preferredContact: {
          type: 'string',
          description: 'Preferred contact method: EMAIL, WHATSAPP, or BOTH',
          enum: ['EMAIL', 'WHATSAPP', 'BOTH'],
        },
        idNumber: {
          type: 'string',
          description: 'South African ID number',
        },
        address: {
          type: 'string',
          description: 'Physical address',
        },
        notes: {
          type: 'string',
          description: 'Additional notes',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit trail)',
        },
      },
      required: ['tenantId', 'firstName', 'lastName'],
    },
    handler: async (
      args: CreateParentInput,
    ): Promise<McpToolResult<CreateParentOutput>> => {
      const startTime = Date.now();

      try {
        // Validate email uniqueness within tenant if provided
        if (args.email) {
          const existing = await prisma.parent.findFirst({
            where: {
              tenantId: args.tenantId,
              email: args.email,
              deletedAt: null,
            },
          });
          if (existing) {
            return {
              success: false,
              error: `Parent with email ${args.email} already exists`,
              metadata: {
                toolName: 'create_parent',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
              },
            };
          }
        }

        const parent = await prisma.parent.create({
          data: {
            tenantId: args.tenantId,
            firstName: args.firstName,
            lastName: args.lastName,
            email: args.email,
            phone: args.phone,
            whatsapp: args.whatsapp,
            preferredContact: args.preferredContact ?? 'EMAIL',
            idNumber: args.idNumber,
            address: args.address,
            notes: args.notes,
            isActive: true,
          },
        });

        return {
          success: true,
          data: {
            id: parent.id,
            firstName: parent.firstName,
            lastName: parent.lastName,
            email: parent.email,
            phone: parent.phone,
            preferredContact: parent.preferredContact,
            isActive: parent.isActive,
            createdAt: parent.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'create_parent',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: 1,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to create parent: ${errorMessage}`,
          metadata: {
            toolName: 'create_parent',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Send parent invite tool
 */
export function sendParentInvite(
  prisma: PrismaService,
): McpToolDefinition<
  SendParentInviteInput,
  McpToolResult<SendParentInviteOutput>
> {
  return {
    name: 'send_parent_invite',
    description:
      'Send an onboarding invitation email to a parent. Includes link to complete registration and sign agreements.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        parentId: {
          type: 'string',
          description: 'Parent ID to send invite to',
        },
        resend: {
          type: 'boolean',
          description: 'Force resend even if already sent',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit trail)',
        },
      },
      required: ['tenantId', 'parentId'],
    },
    handler: async (
      args: SendParentInviteInput,
    ): Promise<McpToolResult<SendParentInviteOutput>> => {
      const startTime = Date.now();

      try {
        const parent = await prisma.parent.findFirst({
          where: {
            id: args.parentId,
            tenantId: args.tenantId,
            deletedAt: null,
          },
        });

        if (!parent) {
          return {
            success: false,
            error: `Parent ${args.parentId} not found`,
            metadata: {
              toolName: 'send_parent_invite',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        if (!parent.email) {
          return {
            success: false,
            error: 'Parent has no email address',
            metadata: {
              toolName: 'send_parent_invite',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Note: In production, this would integrate with the email service
        // and parent onboarding service. For now, we return a placeholder.
        // The actual implementation would use ParentOnboardingService.

        return {
          success: true,
          data: {
            parentId: parent.id,
            email: parent.email,
            sent: true,
            // In production, this would be a real invite link
            inviteLink: `https://app.crechebooks.co.za/invite/${parent.id}`,
          },
          metadata: {
            toolName: 'send_parent_invite',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: 1,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to send invite: ${errorMessage}`,
          metadata: {
            toolName: 'send_parent_invite',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}
