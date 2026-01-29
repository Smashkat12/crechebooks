/**
 * Tenant Operations MCP Tools
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Tools for tenant management operations.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  GetTenantInput,
  GetTenantOutput,
  UpdateTenantInput,
  UpdateTenantOutput,
} from '../../types/tenant-operations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

/**
 * Get tenant details tool
 */
export function getTenant(
  prisma: PrismaService,
): McpToolDefinition<GetTenantInput, McpToolResult<GetTenantOutput>> {
  return {
    name: 'get_tenant',
    description:
      'Get details of the current tenant including contact information, billing settings, and bank details.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: GetTenantInput,
    ): Promise<McpToolResult<GetTenantOutput>> => {
      const startTime = Date.now();

      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: args.tenantId },
        });

        if (!tenant) {
          return {
            success: false,
            error: `Tenant ${args.tenantId} not found`,
            metadata: {
              toolName: 'get_tenant',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        return {
          success: true,
          data: {
            id: tenant.id,
            name: tenant.name,
            tradingName: tenant.tradingName,
            registrationNumber: tenant.registrationNumber,
            vatNumber: tenant.vatNumber,
            taxStatus: tenant.taxStatus,
            addressLine1: tenant.addressLine1,
            addressLine2: tenant.addressLine2,
            city: tenant.city,
            province: tenant.province,
            postalCode: tenant.postalCode,
            phone: tenant.phone,
            email: tenant.email,
            invoiceDayOfMonth: tenant.invoiceDayOfMonth,
            invoiceDueDays: tenant.invoiceDueDays,
            subscriptionStatus: tenant.subscriptionStatus,
            subscriptionPlan: tenant.subscriptionPlan,
            trialExpiresAt: tenant.trialExpiresAt?.toISOString() ?? null,
            bankName: tenant.bankName,
            bankAccountHolder: tenant.bankAccountHolder,
            bankAccountNumber: tenant.bankAccountNumber,
            bankBranchCode: tenant.bankBranchCode,
            bankAccountType: tenant.bankAccountType,
            xeroConnectedAt: tenant.xeroConnectedAt?.toISOString() ?? null,
            xeroTenantName: tenant.xeroTenantName,
          },
          metadata: {
            toolName: 'get_tenant',
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
          error: `Failed to get tenant: ${errorMessage}`,
          metadata: {
            toolName: 'get_tenant',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Update tenant configuration tool
 */
export function updateTenant(
  prisma: PrismaService,
): McpToolDefinition<UpdateTenantInput, McpToolResult<UpdateTenantOutput>> {
  return {
    name: 'update_tenant',
    description:
      'Update tenant configuration including business details, billing settings, and bank information.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        name: {
          type: 'string',
          description: 'Business name',
        },
        tradingName: {
          type: 'string',
          description: 'Trading name (if different from business name)',
        },
        vatNumber: {
          type: 'string',
          description: 'VAT registration number',
        },
        phone: {
          type: 'string',
          description: 'Contact phone number',
        },
        addressLine1: {
          type: 'string',
          description: 'Address line 1',
        },
        addressLine2: {
          type: 'string',
          description: 'Address line 2',
        },
        city: {
          type: 'string',
          description: 'City',
        },
        province: {
          type: 'string',
          description: 'Province',
        },
        postalCode: {
          type: 'string',
          description: 'Postal code',
        },
        invoiceDayOfMonth: {
          type: 'number',
          description: 'Day of month to generate invoices (1-28)',
          minimum: 1,
          maximum: 28,
        },
        invoiceDueDays: {
          type: 'number',
          description: 'Number of days until invoice is due',
          minimum: 1,
          maximum: 90,
        },
        bankName: {
          type: 'string',
          description: 'Bank name for payments',
        },
        bankAccountHolder: {
          type: 'string',
          description: 'Bank account holder name',
        },
        bankAccountNumber: {
          type: 'string',
          description: 'Bank account number',
        },
        bankBranchCode: {
          type: 'string',
          description: 'Bank branch code',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the update (for audit trail)',
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: UpdateTenantInput,
    ): Promise<McpToolResult<UpdateTenantOutput>> => {
      const startTime = Date.now();

      try {
        // Build update data, excluding tenantId and userId
        const { tenantId, userId, ...updateFields } = args;

        // Filter out undefined values
        const updateData = Object.fromEntries(
          Object.entries(updateFields).filter(([, v]) => v !== undefined),
        );

        if (Object.keys(updateData).length === 0) {
          return {
            success: false,
            error: 'No fields to update',
            metadata: {
              toolName: 'update_tenant',
              executionMs: Date.now() - startTime,
              tenantId,
            },
          };
        }

        const tenant = await prisma.tenant.update({
          where: { id: tenantId },
          data: updateData,
        });

        // Log updated fields
        const updatedFields = Object.keys(updateData);

        return {
          success: true,
          data: {
            id: tenant.id,
            name: tenant.name,
            updatedFields,
          },
          metadata: {
            toolName: 'update_tenant',
            executionMs: Date.now() - startTime,
            tenantId,
            resultCount: 1,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to update tenant: ${errorMessage}`,
          metadata: {
            toolName: 'update_tenant',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}
