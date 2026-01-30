/**
 * Child Operations MCP Tools
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Tools for child and enrollment management operations.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  ListChildrenInput,
  ListChildrenOutput,
  CreateChildInput,
  CreateChildOutput,
  CreateEnrollmentInput,
  CreateEnrollmentOutput,
} from '../../types/child-operations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

/**
 * List children tool
 */
export function listChildren(
  prisma: PrismaService,
): McpToolDefinition<ListChildrenInput, McpToolResult<ListChildrenOutput>> {
  return {
    name: 'list_children',
    description:
      'List children with optional filtering by parent, enrollment status, or active status. Includes parent name and current enrollment info.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        parentId: {
          type: 'string',
          description: 'Filter by parent ID',
        },
        enrolled: {
          type: 'boolean',
          description:
            'Filter by enrollment status (true = has active enrollment)',
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
      args: ListChildrenInput,
    ): Promise<McpToolResult<ListChildrenOutput>> => {
      const startTime = Date.now();

      try {
        const limit = Math.min(args.limit ?? 50, 200);
        const offset = args.offset ?? 0;

        // Build where clause
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
          deletedAt: null, // Exclude soft-deleted
        };

        if (args.parentId) {
          where.parentId = args.parentId;
        }

        if (args.isActive !== undefined) {
          where.isActive = args.isActive;
        }

        // For enrollment filtering, we need to use a subquery approach
        if (args.enrolled !== undefined) {
          if (args.enrolled) {
            where.enrollments = {
              some: {
                status: 'ACTIVE',
              },
            };
          } else {
            where.enrollments = {
              none: {
                status: 'ACTIVE',
              },
            };
          }
        }

        const [children, total] = await Promise.all([
          prisma.child.findMany({
            where,
            include: {
              parent: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              enrollments: {
                where: { status: 'ACTIVE' },
                include: {
                  feeStructure: {
                    select: {
                      name: true,
                      amountCents: true,
                    },
                  },
                },
                take: 1,
              },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: limit,
            skip: offset,
          }),
          prisma.child.count({ where }),
        ]);

        const formattedChildren = children.map((c) => {
          const activeEnrollment = c.enrollments[0];
          return {
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            dateOfBirth: c.dateOfBirth.toISOString().split('T')[0],
            gender: c.gender,
            isActive: c.isActive,
            parentId: c.parentId,
            parentName: `${c.parent.firstName} ${c.parent.lastName}`,
            enrollmentStatus: activeEnrollment?.status ?? null,
            enrollmentId: activeEnrollment?.id ?? null,
            feeStructureName: activeEnrollment?.feeStructure.name ?? null,
            monthlyFeeCents: activeEnrollment?.feeStructure.amountCents ?? null,
          };
        });

        return {
          success: true,
          data: {
            children: formattedChildren,
            total,
            limit,
            offset,
          },
          metadata: {
            toolName: 'list_children',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: children.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to list children: ${errorMessage}`,
          metadata: {
            toolName: 'list_children',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create child tool
 */
export function createChild(
  prisma: PrismaService,
): McpToolDefinition<CreateChildInput, McpToolResult<CreateChildOutput>> {
  return {
    name: 'create_child',
    description:
      'Create a new child record linked to a parent. Use create_enrollment to set up their fee structure.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        parentId: {
          type: 'string',
          description: 'Parent ID the child belongs to',
        },
        firstName: {
          type: 'string',
          description: 'First name',
        },
        lastName: {
          type: 'string',
          description: 'Last name',
        },
        dateOfBirth: {
          type: 'string',
          description: 'Date of birth in YYYY-MM-DD format',
        },
        gender: {
          type: 'string',
          description: 'Gender: MALE, FEMALE, or OTHER',
          enum: ['MALE', 'FEMALE', 'OTHER'],
        },
        medicalNotes: {
          type: 'string',
          description: 'Medical notes (allergies, conditions, medication)',
        },
        emergencyContact: {
          type: 'string',
          description: 'Emergency contact name',
        },
        emergencyPhone: {
          type: 'string',
          description: 'Emergency contact phone',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit trail)',
        },
      },
      required: [
        'tenantId',
        'parentId',
        'firstName',
        'lastName',
        'dateOfBirth',
      ],
    },
    handler: async (
      args: CreateChildInput,
    ): Promise<McpToolResult<CreateChildOutput>> => {
      const startTime = Date.now();

      try {
        // Verify parent exists and belongs to tenant
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
              toolName: 'create_child',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Parse and validate date of birth
        const dobDate = new Date(args.dateOfBirth);
        if (isNaN(dobDate.getTime())) {
          return {
            success: false,
            error: 'Invalid date of birth format. Use YYYY-MM-DD.',
            metadata: {
              toolName: 'create_child',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        if (dobDate > new Date()) {
          return {
            success: false,
            error: 'Date of birth cannot be in the future',
            metadata: {
              toolName: 'create_child',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        const child = await prisma.child.create({
          data: {
            tenantId: args.tenantId,
            parentId: args.parentId,
            firstName: args.firstName,
            lastName: args.lastName,
            dateOfBirth: dobDate,
            gender: args.gender,
            medicalNotes: args.medicalNotes,
            emergencyContact: args.emergencyContact,
            emergencyPhone: args.emergencyPhone,
            isActive: true,
          },
          include: {
            parent: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        return {
          success: true,
          data: {
            id: child.id,
            firstName: child.firstName,
            lastName: child.lastName,
            dateOfBirth: child.dateOfBirth.toISOString().split('T')[0],
            gender: child.gender,
            parentId: child.parentId,
            parentName: `${child.parent.firstName} ${child.parent.lastName}`,
            isActive: child.isActive,
            createdAt: child.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'create_child',
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
          error: `Failed to create child: ${errorMessage}`,
          metadata: {
            toolName: 'create_child',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create enrollment tool
 */
export function createEnrollment(
  prisma: PrismaService,
): McpToolDefinition<
  CreateEnrollmentInput,
  McpToolResult<CreateEnrollmentOutput>
> {
  return {
    name: 'create_enrollment',
    description:
      'Create an enrollment for a child, linking them to a fee structure. Supports sibling discounts and custom fee overrides.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        childId: {
          type: 'string',
          description: 'Child ID to enroll',
        },
        feeStructureId: {
          type: 'string',
          description: 'Fee structure ID',
        },
        startDate: {
          type: 'string',
          description: 'Enrollment start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'Enrollment end date in YYYY-MM-DD format (optional)',
        },
        siblingDiscountApplied: {
          type: 'boolean',
          description: 'Whether sibling discount should be applied',
        },
        customFeeOverrideCents: {
          type: 'number',
          description: 'Custom monthly fee override in cents (optional)',
          minimum: 0,
        },
        notes: {
          type: 'string',
          description: 'Enrollment notes',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit trail)',
        },
      },
      required: ['tenantId', 'childId', 'feeStructureId', 'startDate'],
    },
    handler: async (
      args: CreateEnrollmentInput,
    ): Promise<McpToolResult<CreateEnrollmentOutput>> => {
      const startTime = Date.now();

      try {
        // Verify child exists and belongs to tenant
        const child = await prisma.child.findFirst({
          where: {
            id: args.childId,
            tenantId: args.tenantId,
            deletedAt: null,
          },
        });

        if (!child) {
          return {
            success: false,
            error: `Child ${args.childId} not found`,
            metadata: {
              toolName: 'create_enrollment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Check for existing active enrollment
        const existingEnrollment = await prisma.enrollment.findFirst({
          where: {
            childId: args.childId,
            status: 'ACTIVE',
          },
        });

        if (existingEnrollment) {
          return {
            success: false,
            error: 'Child already has an active enrollment',
            metadata: {
              toolName: 'create_enrollment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Verify fee structure exists and is active
        const feeStructure = await prisma.feeStructure.findFirst({
          where: {
            id: args.feeStructureId,
            tenantId: args.tenantId,
            isActive: true,
          },
        });

        if (!feeStructure) {
          return {
            success: false,
            error: `Fee structure ${args.feeStructureId} not found or inactive`,
            metadata: {
              toolName: 'create_enrollment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Parse dates
        const startDate = new Date(args.startDate);
        if (isNaN(startDate.getTime())) {
          return {
            success: false,
            error: 'Invalid start date format. Use YYYY-MM-DD.',
            metadata: {
              toolName: 'create_enrollment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        let endDate: Date | undefined;
        if (args.endDate) {
          endDate = new Date(args.endDate);
          if (isNaN(endDate.getTime())) {
            return {
              success: false,
              error: 'Invalid end date format. Use YYYY-MM-DD.',
              metadata: {
                toolName: 'create_enrollment',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
              },
            };
          }
          if (endDate <= startDate) {
            return {
              success: false,
              error: 'End date must be after start date',
              metadata: {
                toolName: 'create_enrollment',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
              },
            };
          }
        }

        const enrollment = await prisma.enrollment.create({
          data: {
            tenantId: args.tenantId,
            childId: args.childId,
            feeStructureId: args.feeStructureId,
            startDate,
            endDate,
            status: 'ACTIVE',
            siblingDiscountApplied: args.siblingDiscountApplied ?? false,
            customFeeOverrideCents: args.customFeeOverrideCents,
            notes: args.notes,
          },
          include: {
            feeStructure: {
              select: {
                name: true,
                amountCents: true,
              },
            },
            child: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        // Calculate effective fee
        const effectiveFeeCents =
          args.customFeeOverrideCents ?? feeStructure.amountCents;

        return {
          success: true,
          data: {
            id: enrollment.id,
            childId: enrollment.childId,
            childName: `${enrollment.child.firstName} ${enrollment.child.lastName}`,
            feeStructureId: enrollment.feeStructureId,
            feeStructureName: enrollment.feeStructure.name,
            feeCents: feeStructure.amountCents,
            effectiveFeeCents,
            startDate: enrollment.startDate.toISOString().split('T')[0],
            endDate: enrollment.endDate?.toISOString().split('T')[0] ?? null,
            status: enrollment.status,
            siblingDiscountApplied: enrollment.siblingDiscountApplied,
            createdAt: enrollment.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'create_enrollment',
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
          error: `Failed to create enrollment: ${errorMessage}`,
          metadata: {
            toolName: 'create_enrollment',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}
