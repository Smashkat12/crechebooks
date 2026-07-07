/**
 * get_tenant tool
 *
 * Returns the current tenant's basic settings (name, VAT status, address).
 * Read-only. Enforces tenant isolation — a tool call can never pull another
 * tenant.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

export const getTenantTool: AgentTool = {
  name: 'get_tenant',
  description:
    'Get the current tenant (creche) profile: name, trading name, VAT status, address, tax status.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async handler(_input: Record<string, unknown>, ctx: AgentToolContext) {
    const tenant = await ctx.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        name: true,
        tradingName: true,
        registrationNumber: true,
        vatNumber: true,
        taxStatus: true,
        vatCategory: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        province: true,
        postalCode: true,
        phone: true,
      },
    });
    if (!tenant) {
      throw new AgentToolError(
        `tenant ${ctx.tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }
    return tenant;
  },
};
