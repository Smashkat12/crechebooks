/**
 * list_children tool
 *
 * Lists children (students) for the current tenant. Optional lifecycle filter
 * (REGISTERED | ENROLLED | WITHDRAWN | GRADUATED).
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

const VALID_STATUSES = [
  'REGISTERED',
  'ENROLLED',
  'WITHDRAWN',
  'GRADUATED',
] as const;
type ChildStatus = (typeof VALID_STATUSES)[number];

interface ListChildrenInput {
  status?: string;
  limit?: number;
}

export const listChildrenTool: AgentTool = {
  name: 'list_children',
  description:
    'List children (students) for the current tenant. Optional lifecycle status filter. Returns most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: VALID_STATUSES as unknown as string[],
        description: 'REGISTERED | ENROLLED | WITHDRAWN | GRADUATED.',
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
    const input = rawInput as unknown as ListChildrenInput;
    const limit = clampLimit(input.limit);
    const status = normaliseStatus(input.status);

    const children = await ctx.prisma.child.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        parentId: true,
        classGroupId: true,
        dateOfBirth: true,
        status: true,
        isActive: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: children.length,
      children: children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        parentId: c.parentId,
        classGroupId: c.classGroupId,
        dateOfBirth: c.dateOfBirth.toISOString().slice(0, 10),
        status: c.status,
        isActive: c.isActive,
      })),
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

function normaliseStatus(raw: string | undefined): ChildStatus | undefined {
  if (raw == null) return undefined;
  const upper = raw.toUpperCase().trim();
  if ((VALID_STATUSES as readonly string[]).includes(upper)) {
    return upper as ChildStatus;
  }
  throw new AgentToolError(
    `unknown child status "${raw}". Valid: ${VALID_STATUSES.join(', ')}.`,
    'INVALID_INPUT',
  );
}
