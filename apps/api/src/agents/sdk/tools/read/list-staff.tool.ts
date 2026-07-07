/**
 * list_staff tool
 *
 * Lists staff (employees) for the current tenant.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';

interface ListStaffInput {
  limit?: number;
  activeOnly?: boolean;
}

export const listStaffTool: AgentTool = {
  name: 'list_staff',
  description:
    'List staff members for the current tenant. Defaults to active only. Returns most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      activeOnly: {
        type: 'boolean',
        description: 'Restrict to active staff (default true).',
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
    const input = rawInput as unknown as ListStaffInput;
    const limit = clampLimit(input.limit);
    const activeOnly = input.activeOnly ?? true;

    const staff = await ctx.prisma.staff.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { startDate: 'desc' },
      take: limit,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        employmentType: true,
        payFrequency: true,
        basicSalaryCents: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: staff.length,
      activeOnly,
      staff: staff.map((s) => ({
        ...s,
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
      })),
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}
