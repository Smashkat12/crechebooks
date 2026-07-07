/**
 * list_parents tool
 *
 * Lists parents/guardians for the current tenant.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';

interface ListParentsInput {
  limit?: number;
  activeOnly?: boolean;
}

export const listParentsTool: AgentTool = {
  name: 'list_parents',
  description:
    'List parents/guardians for the current tenant. Defaults to active only. Returns most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      activeOnly: {
        type: 'boolean',
        description: 'Restrict to active parents (default true).',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Max rows (default 25, cap 100).',
      },
    },
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as ListParentsInput;
    const limit = clampLimit(input.limit);
    const activeOnly = input.activeOnly ?? true;

    const parents = await ctx.prisma.parent.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        preferredContact: true,
        whatsappOptIn: true,
        isActive: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: parents.length,
      activeOnly,
      parents,
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}
