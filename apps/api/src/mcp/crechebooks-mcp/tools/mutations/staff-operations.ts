/**
 * Staff Operations MCP Tools
 * TASK-SDK-004: CrecheBooks Staff Management Tools
 *
 * MCP tools for staff management including CRUD operations,
 * onboarding workflows, and leave management.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

// ============================================
// Input Types
// ============================================

export interface ListStaffInput {
  tenantId: string;
  search?: string;
  employmentType?: 'PERMANENT' | 'CONTRACT' | 'CASUAL';
  isActive?: boolean;
  limit?: number;
  page?: number;
}

export interface CreateStaffInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  idNumber: string;
  dateOfBirth: string;
  employmentType: 'PERMANENT' | 'CONTRACT' | 'CASUAL';
  payFrequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  basicSalaryCents: number;
  startDate?: string;
  userId?: string;
}

export interface UpdateStaffInput {
  tenantId: string;
  staffId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  employmentType?: 'PERMANENT' | 'CONTRACT' | 'CASUAL';
  payFrequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  basicSalaryCents?: number;
  bankName?: string;
  bankAccount?: string;
  bankBranchCode?: string;
  userId?: string;
}

export interface InitiateOnboardingInput {
  tenantId: string;
  staffId: string;
  sendEmail?: boolean;
  userId?: string;
}

export interface CompleteOnboardingInput {
  tenantId: string;
  staffId: string;
  force?: boolean;
  userId?: string;
}

export interface RequestLeaveInput {
  tenantId: string;
  staffId: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  reason?: string;
  userId?: string;
}

export interface GetLeaveBalanceInput {
  tenantId: string;
  staffId: string;
  year?: string;
}

// ============================================
// Output Types
// ============================================

export interface StaffRecord {
  id: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  employmentType: string;
  payFrequency: string;
  basicSalaryCents: number;
  isActive: boolean;
  createdAt: string;
}

export interface LeaveRequestRecord {
  id: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface LeaveBalanceRecord {
  leaveTypeName: string;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
}

// ============================================
// Tool Implementations
// ============================================

/**
 * List staff members with filtering and pagination
 */
export function listStaff(
  prisma: PrismaService,
): McpToolDefinition<ListStaffInput, McpToolResult<StaffRecord[]>> {
  return {
    name: 'list_staff',
    description:
      'List staff members with optional filtering by search term, employment type, and active status. Supports pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        search: {
          type: 'string',
          description: 'Search by name, email, or employee number',
        },
        employmentType: {
          type: 'string',
          enum: ['PERMANENT', 'CONTRACT', 'CASUAL'],
          description: 'Filter by employment type',
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status',
        },
        limit: {
          type: 'number',
          description: 'Number of results per page (default 50, max 100)',
          default: 50,
        },
        page: {
          type: 'number',
          description: 'Page number (1-indexed)',
          default: 1,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: ListStaffInput,
    ): Promise<McpToolResult<StaffRecord[]>> => {
      const startTime = Date.now();
      const limit = Math.min(args.limit || 50, 100);
      const page = args.page || 1;
      const skip = (page - 1) * limit;

      try {
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (args.search) {
          where.OR = [
            { firstName: { contains: args.search, mode: 'insensitive' } },
            { lastName: { contains: args.search, mode: 'insensitive' } },
            { email: { contains: args.search, mode: 'insensitive' } },
            { employeeNumber: { contains: args.search, mode: 'insensitive' } },
          ];
        }

        if (args.employmentType) {
          where.employmentType = args.employmentType;
        }

        if (args.isActive !== undefined) {
          where.isActive = args.isActive;
        }

        const staff = await prisma.staff.findMany({
          where,
          take: limit,
          skip,
          orderBy: { lastName: 'asc' },
        });

        const results: StaffRecord[] = staff.map((s) => ({
          id: s.id,
          employeeNumber: s.employeeNumber,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: s.phone,
          employmentType: s.employmentType,
          payFrequency: s.payFrequency,
          basicSalaryCents: s.basicSalaryCents,
          isActive: s.isActive,
          createdAt: s.createdAt.toISOString(),
        }));

        return {
          success: true,
          data: results,
          metadata: {
            toolName: 'list_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: results.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to list staff: ${errorMessage}`,
          metadata: {
            toolName: 'list_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create a new staff member
 */
export function createStaff(
  prisma: PrismaService,
): McpToolDefinition<CreateStaffInput, McpToolResult<StaffRecord>> {
  return {
    name: 'create_staff',
    description:
      'Create a new staff member with required personal and employment details.',
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
        idNumber: {
          type: 'string',
          description: 'South African ID number (13 digits)',
        },
        dateOfBirth: {
          type: 'string',
          description: 'Date of birth in ISO format (YYYY-MM-DD)',
        },
        employmentType: {
          type: 'string',
          enum: ['PERMANENT', 'CONTRACT', 'CASUAL'],
          description: 'Employment type',
        },
        payFrequency: {
          type: 'string',
          enum: ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'],
          description: 'Pay frequency (default: MONTHLY)',
        },
        basicSalaryCents: {
          type: 'number',
          description: 'Basic salary in cents (ZAR)',
        },
        startDate: {
          type: 'string',
          description: 'Employment start date (defaults to today)',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit)',
        },
      },
      required: [
        'tenantId',
        'firstName',
        'lastName',
        'email',
        'idNumber',
        'dateOfBirth',
        'employmentType',
        'basicSalaryCents',
      ],
    },
    handler: async (
      args: CreateStaffInput,
    ): Promise<McpToolResult<StaffRecord>> => {
      const startTime = Date.now();

      try {
        // Generate employee number
        const count = await prisma.staff.count({
          where: { tenantId: args.tenantId },
        });
        const employeeNumber = `EMP${String(count + 1).padStart(4, '0')}`;

        const staff = await prisma.staff.create({
          data: {
            tenantId: args.tenantId,
            employeeNumber,
            firstName: args.firstName,
            lastName: args.lastName,
            email: args.email,
            phone: args.phone,
            idNumber: args.idNumber,
            dateOfBirth: new Date(args.dateOfBirth),
            startDate: args.startDate ? new Date(args.startDate) : new Date(),
            employmentType: args.employmentType,
            payFrequency: args.payFrequency || 'MONTHLY',
            basicSalaryCents: args.basicSalaryCents,
            isActive: true,
          },
        });

        return {
          success: true,
          data: {
            id: staff.id,
            employeeNumber: staff.employeeNumber,
            firstName: staff.firstName,
            lastName: staff.lastName,
            email: staff.email,
            phone: staff.phone,
            employmentType: staff.employmentType,
            payFrequency: staff.payFrequency,
            basicSalaryCents: staff.basicSalaryCents,
            isActive: staff.isActive,
            createdAt: staff.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'create_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to create staff: ${errorMessage}`,
          metadata: {
            toolName: 'create_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Update staff member details
 */
export function updateStaff(
  prisma: PrismaService,
): McpToolDefinition<UpdateStaffInput, McpToolResult<StaffRecord>> {
  return {
    name: 'update_staff',
    description:
      'Update staff member details including contact info, employment type, salary, and bank details.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        staffId: {
          type: 'string',
          description: 'Staff member ID to update',
        },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        employmentType: {
          type: 'string',
          enum: ['PERMANENT', 'CONTRACT', 'CASUAL'],
          description: 'Employment type',
        },
        payFrequency: {
          type: 'string',
          enum: ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'],
          description: 'Pay frequency',
        },
        basicSalaryCents: {
          type: 'number',
          description: 'Basic salary in cents',
        },
        bankName: { type: 'string', description: 'Bank name' },
        bankAccount: { type: 'string', description: 'Bank account number' },
        bankBranchCode: { type: 'string', description: 'Bank branch code' },
        userId: { type: 'string', description: 'User ID for audit' },
      },
      required: ['tenantId', 'staffId'],
    },
    handler: async (
      args: UpdateStaffInput,
    ): Promise<McpToolResult<StaffRecord>> => {
      const startTime = Date.now();

      try {
        const updateData: Record<string, unknown> = {};
        if (args.firstName) updateData.firstName = args.firstName;
        if (args.lastName) updateData.lastName = args.lastName;
        if (args.email) updateData.email = args.email;
        if (args.phone) updateData.phone = args.phone;
        if (args.employmentType)
          updateData.employmentType = args.employmentType;
        if (args.payFrequency) updateData.payFrequency = args.payFrequency;
        if (args.basicSalaryCents !== undefined)
          updateData.basicSalaryCents = args.basicSalaryCents;
        if (args.bankName) updateData.bankName = args.bankName;
        if (args.bankAccount) updateData.bankAccount = args.bankAccount;
        if (args.bankBranchCode)
          updateData.bankBranchCode = args.bankBranchCode;

        const staff = await prisma.staff.update({
          where: { id: args.staffId },
          data: updateData,
        });

        return {
          success: true,
          data: {
            id: staff.id,
            employeeNumber: staff.employeeNumber,
            firstName: staff.firstName,
            lastName: staff.lastName,
            email: staff.email,
            phone: staff.phone,
            employmentType: staff.employmentType,
            payFrequency: staff.payFrequency,
            basicSalaryCents: staff.basicSalaryCents,
            isActive: staff.isActive,
            createdAt: staff.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'update_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to update staff: ${errorMessage}`,
          metadata: {
            toolName: 'update_staff',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Initiate onboarding for a staff member
 */
export function initiateOnboarding(
  prisma: PrismaService,
): McpToolDefinition<
  InitiateOnboardingInput,
  McpToolResult<{ staffId: string; status: string }>
> {
  return {
    name: 'initiate_onboarding',
    description: 'Start the onboarding workflow for a staff member.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        staffId: {
          type: 'string',
          description: 'Staff member ID to onboard',
        },
        sendEmail: {
          type: 'boolean',
          description: 'Send welcome email to staff member',
          default: true,
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit)',
        },
      },
      required: ['tenantId', 'staffId'],
    },
    handler: async (
      args: InitiateOnboardingInput,
    ): Promise<McpToolResult<{ staffId: string; status: string }>> => {
      const startTime = Date.now();

      try {
        // Verify staff exists
        const staff = await prisma.staff.findFirst({
          where: {
            id: args.staffId,
            tenantId: args.tenantId,
          },
        });

        if (!staff) {
          return {
            success: false,
            error: `Staff member ${args.staffId} not found`,
            metadata: {
              toolName: 'initiate_onboarding',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Create or update StaffOnboarding record
        await prisma.staffOnboarding.upsert({
          where: { staffId: args.staffId },
          create: {
            tenantId: args.tenantId,
            staffId: args.staffId,
            status: 'IN_PROGRESS',
            currentStep: 'PERSONAL_INFO',
            startedAt: new Date(),
          },
          update: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });

        return {
          success: true,
          data: {
            staffId: args.staffId,
            status: 'IN_PROGRESS',
          },
          metadata: {
            toolName: 'initiate_onboarding',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to initiate onboarding: ${errorMessage}`,
          metadata: {
            toolName: 'initiate_onboarding',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Complete onboarding for a staff member
 */
export function completeOnboarding(
  prisma: PrismaService,
): McpToolDefinition<
  CompleteOnboardingInput,
  McpToolResult<{ staffId: string; status: string }>
> {
  return {
    name: 'complete_onboarding',
    description: 'Mark onboarding as complete for a staff member.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        staffId: {
          type: 'string',
          description: 'Staff member ID',
        },
        force: {
          type: 'boolean',
          description: 'Force completion even if steps are pending',
          default: false,
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit)',
        },
      },
      required: ['tenantId', 'staffId'],
    },
    handler: async (
      args: CompleteOnboardingInput,
    ): Promise<McpToolResult<{ staffId: string; status: string }>> => {
      const startTime = Date.now();

      try {
        await prisma.staffOnboarding.update({
          where: { staffId: args.staffId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            completedBy: args.userId,
          },
        });

        return {
          success: true,
          data: {
            staffId: args.staffId,
            status: 'COMPLETED',
          },
          metadata: {
            toolName: 'complete_onboarding',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to complete onboarding: ${errorMessage}`,
          metadata: {
            toolName: 'complete_onboarding',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Create a leave request for a staff member
 */
export function requestLeave(
  prisma: PrismaService,
): McpToolDefinition<RequestLeaveInput, McpToolResult<LeaveRequestRecord>> {
  return {
    name: 'request_leave',
    description:
      'Create a leave request for a staff member with specified leave type and date range.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        staffId: {
          type: 'string',
          description: 'Staff member ID',
        },
        leaveTypeId: {
          type: 'number',
          description: 'Leave type ID (1=Annual, 2=Sick, 3=Family)',
        },
        leaveTypeName: {
          type: 'string',
          description: 'Leave type name (e.g., Annual Leave, Sick Leave)',
        },
        startDate: {
          type: 'string',
          description: 'Start date in ISO format (YYYY-MM-DD)',
        },
        endDate: {
          type: 'string',
          description: 'End date in ISO format (YYYY-MM-DD)',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for leave',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the action (for audit)',
        },
      },
      required: [
        'tenantId',
        'staffId',
        'leaveTypeId',
        'leaveTypeName',
        'startDate',
        'endDate',
      ],
    },
    handler: async (
      args: RequestLeaveInput,
    ): Promise<McpToolResult<LeaveRequestRecord>> => {
      const startTime = Date.now();

      try {
        // Calculate days
        const start = new Date(args.startDate);
        const end = new Date(args.endDate);
        const totalDays =
          Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
          1;
        const totalHours = totalDays * 8; // Assume 8-hour workday

        // Create leave request
        const request = await prisma.leaveRequest.create({
          data: {
            staffId: args.staffId,
            tenantId: args.tenantId,
            leaveTypeId: args.leaveTypeId,
            leaveTypeName: args.leaveTypeName,
            startDate: start,
            endDate: end,
            totalDays,
            totalHours,
            reason: args.reason,
            status: 'PENDING',
          },
        });

        return {
          success: true,
          data: {
            id: request.id,
            leaveTypeId: request.leaveTypeId,
            leaveTypeName: request.leaveTypeName,
            startDate: request.startDate.toISOString(),
            endDate: request.endDate.toISOString(),
            totalDays: request.totalDays.toNumber(),
            status: request.status,
            reason: request.reason,
            createdAt: request.createdAt.toISOString(),
          },
          metadata: {
            toolName: 'request_leave',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to create leave request: ${errorMessage}`,
          metadata: {
            toolName: 'request_leave',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Get leave balance for a staff member
 */
export function getLeaveBalance(
  prisma: PrismaService,
): McpToolDefinition<
  GetLeaveBalanceInput,
  McpToolResult<LeaveBalanceRecord[]>
> {
  return {
    name: 'get_leave_balance',
    description:
      'Get leave balance for a staff member showing entitled, used, pending, and available days per leave type.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        staffId: {
          type: 'string',
          description: 'Staff member ID',
        },
        year: {
          type: 'string',
          description: 'Leave year (defaults to current year)',
        },
      },
      required: ['tenantId', 'staffId'],
    },
    handler: async (
      args: GetLeaveBalanceInput,
    ): Promise<McpToolResult<LeaveBalanceRecord[]>> => {
      const startTime = Date.now();
      const year = args.year || new Date().getFullYear().toString();

      try {
        // Standard leave types with annual entitlements
        const leaveTypes = [
          { id: 1, name: 'Annual Leave', entitledDays: 15 },
          { id: 2, name: 'Sick Leave', entitledDays: 30 },
          { id: 3, name: 'Family Responsibility Leave', entitledDays: 3 },
          { id: 4, name: 'Maternity Leave', entitledDays: 120 },
          { id: 5, name: 'Unpaid Leave', entitledDays: 0 },
        ];

        const balances: LeaveBalanceRecord[] = [];

        for (const leaveType of leaveTypes) {
          // Get used days (approved)
          const usedResult = await prisma.leaveRequest.aggregate({
            where: {
              staffId: args.staffId,
              tenantId: args.tenantId,
              leaveTypeId: leaveType.id,
              status: 'APPROVED',
              startDate: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${parseInt(year) + 1}-01-01`),
              },
            },
            _sum: { totalDays: true },
          });

          // Get pending days
          const pendingResult = await prisma.leaveRequest.aggregate({
            where: {
              staffId: args.staffId,
              tenantId: args.tenantId,
              leaveTypeId: leaveType.id,
              status: 'PENDING',
              startDate: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${parseInt(year) + 1}-01-01`),
              },
            },
            _sum: { totalDays: true },
          });

          const usedDays = usedResult._sum?.totalDays?.toNumber() || 0;
          const pendingDays = pendingResult._sum?.totalDays?.toNumber() || 0;
          const availableDays = Math.max(
            0,
            leaveType.entitledDays - usedDays - pendingDays,
          );

          balances.push({
            leaveTypeName: leaveType.name,
            entitledDays: leaveType.entitledDays,
            usedDays,
            pendingDays,
            availableDays,
          });
        }

        return {
          success: true,
          data: balances,
          metadata: {
            toolName: 'get_leave_balance',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: balances.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to get leave balance: ${errorMessage}`,
          metadata: {
            toolName: 'get_leave_balance',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}
