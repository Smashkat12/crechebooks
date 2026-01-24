import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma';
import { SubscriptionStatus, UserRole, AuditAction } from '@prisma/client';
import {
  ContactSubmissionsResponseDto,
  DemoRequestsResponseDto,
} from './dto/submissions.dto';
import {
  ListTenantsQueryDto,
  CreateTenantDto,
  UpdateTenantDto,
  TenantSummaryDto,
  TenantDetailDto,
  TenantStatsDto,
  TenantsListResponseDto,
} from './dto/tenants.dto';
import {
  ListUsersQueryDto,
  UserSummaryDto,
  UserDetailDto,
  UserStatsDto,
  UsersListResponseDto,
  UserActivityDto,
} from './dto/users.dto';
import {
  PlatformMetricsDto,
  TenantGrowthDto,
  SubscriptionBreakdownDto,
  TopTenantDto,
  RecentActivityDto,
} from './dto/analytics.dto';
import {
  ListAuditLogsQueryDto,
  AuditLogEntryDto,
  AuditLogStatsDto,
  AuditLogsListResponseDto,
} from './dto/audit-logs.dto';
import { NotFoundException } from '../../shared/exceptions';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // CONTACT & DEMO SUBMISSIONS (existing)
  // ============================================

  async getContactSubmissions(): Promise<ContactSubmissionsResponseDto> {
    try {
      const [submissions, total, pendingCount] = await Promise.all([
        this.prisma.contactSubmission.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.contactSubmission.count(),
        this.prisma.contactSubmission.count({
          where: { status: 'PENDING' },
        }),
      ]);

      this.logger.log(`Retrieved ${submissions.length} contact submissions`);

      const transformedSubmissions = submissions.map((s) => ({
        ...s,
        phone: s.phone ?? undefined,
      }));

      return {
        submissions: transformedSubmissions,
        total,
        pendingCount,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve contact submissions', error);
      throw error;
    }
  }

  async getDemoRequests(): Promise<DemoRequestsResponseDto> {
    try {
      const [requests, total, pendingCount] = await Promise.all([
        this.prisma.demoRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.demoRequest.count(),
        this.prisma.demoRequest.count({
          where: { status: 'PENDING' },
        }),
      ]);

      this.logger.log(`Retrieved ${requests.length} demo requests`);

      const transformedRequests = requests.map((r) => ({
        ...r,
        currentSoftware: r.currentSoftware ?? undefined,
        preferredTime: r.preferredTime ?? undefined,
      }));

      return {
        requests: transformedRequests,
        total,
        pendingCount,
      };
    } catch (error) {
      this.logger.error('Failed to retrieve demo requests', error);
      throw error;
    }
  }

  async updateContactSubmissionStatus(
    id: string,
    status: 'PENDING' | 'CONTACTED',
  ): Promise<void> {
    try {
      await this.prisma.contactSubmission.update({
        where: { id },
        data: { status },
      });
      this.logger.log(`Updated contact submission ${id} status to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update contact submission ${id} status`,
        error,
      );
      throw error;
    }
  }

  async updateDemoRequestStatus(
    id: string,
    status: 'PENDING' | 'CONTACTED',
  ): Promise<void> {
    try {
      await this.prisma.demoRequest.update({
        where: { id },
        data: { status },
      });
      this.logger.log(`Updated demo request ${id} status to ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update demo request ${id} status`, error);
      throw error;
    }
  }

  // ============================================
  // TENANT MANAGEMENT
  // ============================================

  async listTenants(
    query: ListTenantsQueryDto,
  ): Promise<TenantsListResponseDto> {
    const { search, subscriptionStatus, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (subscriptionStatus) {
      where.subscriptionStatus = subscriptionStatus;
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              children: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const data: TenantSummaryDto[] = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phone ?? undefined,
      subscriptionStatus: t.subscriptionStatus,
      trialExpiresAt: t.trialExpiresAt ?? undefined,
      isActive:
        t.subscriptionStatus !== SubscriptionStatus.SUSPENDED &&
        t.subscriptionStatus !== SubscriptionStatus.CANCELLED,
      userCount: t._count.users,
      childrenCount: t._count.children,
      createdAt: t.createdAt,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTenant(id: string): Promise<TenantDetailDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            children: true,
          },
        },
        users: {
          where: { role: UserRole.OWNER },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }

    const owner = tenant.users[0];

    return {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone ?? undefined,
      subscriptionStatus: tenant.subscriptionStatus,
      trialExpiresAt: tenant.trialExpiresAt ?? undefined,
      isActive:
        tenant.subscriptionStatus !== SubscriptionStatus.SUSPENDED &&
        tenant.subscriptionStatus !== SubscriptionStatus.CANCELLED,
      userCount: tenant._count.users,
      childrenCount: tenant._count.children,
      createdAt: tenant.createdAt,
      tradingName: tenant.tradingName ?? undefined,
      registrationNumber: tenant.registrationNumber ?? undefined,
      vatNumber: tenant.vatNumber ?? undefined,
      addressLine1: tenant.addressLine1 ?? undefined,
      city: tenant.city ?? undefined,
      province: tenant.province ?? undefined,
      updatedAt: tenant.updatedAt,
      xeroConnectedAt: tenant.xeroConnectedAt ?? undefined,
      ownerName: owner?.name ?? undefined,
      ownerEmail: owner?.email ?? undefined,
    };
  }

  async getTenantStats(): Promise<TenantStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      newThisMonth,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({
        where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.tenant.count({
        where: { subscriptionStatus: SubscriptionStatus.TRIAL },
      }),
      this.prisma.tenant.count({
        where: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
      }),
      this.prisma.tenant.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      newThisMonth,
    };
  }

  async createTenant(dto: CreateTenantDto): Promise<TenantDetailDto> {
    // Create tenant with minimal required fields
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? '',
        subscriptionStatus: dto.subscriptionPlan ?? SubscriptionStatus.TRIAL,
        trialExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
        addressLine1: 'To be updated',
        city: 'To be updated',
        province: 'To be updated',
        postalCode: '0000',
      },
    });

    this.logger.log(`Created tenant ${tenant.id}: ${tenant.name}`);

    // Note: Owner user creation would typically be done via invitation flow
    // For now, we just create the tenant and return it

    return this.getTenant(tenant.id);
  }

  async updateTenant(
    id: string,
    dto: UpdateTenantDto,
  ): Promise<TenantDetailDto> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }

    await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.subscriptionStatus && {
          subscriptionStatus: dto.subscriptionStatus,
        }),
      },
    });

    this.logger.log(`Updated tenant ${id}`);
    return this.getTenant(id);
  }

  async suspendTenant(id: string, reason?: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
    });

    this.logger.log(
      `Suspended tenant ${id}. Reason: ${reason ?? 'Not specified'}`,
    );
  }

  async activateTenant(id: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
    });

    this.logger.log(`Activated tenant ${id}`);
  }

  // ============================================
  // USER MANAGEMENT
  // ============================================

  async listUsers(query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    const { search, tenantId, role, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: { name: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: UserSummaryDto[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ?? undefined,
      createdAt: u.createdAt,
      tenantId: u.tenantId ?? undefined,
      tenantName: u.tenant?.name ?? undefined,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(id: string): Promise<UserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User', id);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tenantId: user.tenantId ?? undefined,
      tenantName: user.tenant?.name ?? undefined,
      auth0Id: user.auth0Id ?? undefined,
      currentTenantId: user.currentTenantId ?? undefined,
    };
  }

  async getUserStats(): Promise<UserStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      superAdmins,
      owners,
      admins,
      newThisMonth,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } }),
      this.prisma.user.count({ where: { role: UserRole.OWNER } }),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      superAdmins,
      owners,
      admins,
      newThisMonth,
    };
  }

  async getUserActivity(userId: string): Promise<UserActivityDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      resourceType: log.entityType,
      resourceId: log.entityId ?? undefined,
      details: log.changeSummary ?? undefined,
      createdAt: log.createdAt,
    }));
  }

  async deactivateUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User', id);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Deactivated user ${id}`);
  }

  async activateUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User', id);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    this.logger.log(`Activated user ${id}`);
  }

  // ============================================
  // ANALYTICS
  // ============================================

  async getPlatformMetrics(): Promise<PlatformMetricsDto> {
    const [
      totalTenants,
      totalUsers,
      totalChildren,
      invoiceSum,
      totalTransactions,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.child.count(),
      this.prisma.invoice.aggregate({
        _sum: { totalCents: true },
      }),
      this.prisma.transaction.count(),
    ]);

    return {
      totalTenants,
      totalUsers,
      totalChildren,
      totalInvoicedCents: Number(invoiceSum._sum.totalCents ?? 0),
      totalTransactions,
    };
  }

  async getTenantGrowth(): Promise<TenantGrowthDto[]> {
    // Get tenant counts grouped by month for the last 12 months
    const now = new Date();
    const months: TenantGrowthDto[] = [];
    let cumulative = 0;

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthName = date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const count = await this.prisma.tenant.count({
        where: {
          createdAt: {
            gte: date,
            lte: endDate,
          },
        },
      });

      cumulative += count;
      months.push({
        month: monthName,
        newTenants: count,
        cumulativeTenants: cumulative,
      });
    }

    // Adjust cumulative to reflect actual total by subtracting and re-adding
    const totalBefore = await this.prisma.tenant.count({
      where: {
        createdAt: {
          lt: new Date(now.getFullYear(), now.getMonth() - 11, 1),
        },
      },
    });

    return months.map((m, idx) => ({
      ...m,
      cumulativeTenants:
        totalBefore +
        months.slice(0, idx + 1).reduce((sum, x) => sum + x.newTenants, 0),
    }));
  }

  async getSubscriptionBreakdown(): Promise<SubscriptionBreakdownDto[]> {
    const counts = await this.prisma.tenant.groupBy({
      by: ['subscriptionStatus'],
      _count: true,
    });

    const total = counts.reduce((sum, c) => sum + c._count, 0);

    return counts.map((c) => ({
      status: c.subscriptionStatus,
      count: c._count,
      percentage: total > 0 ? Math.round((c._count / total) * 100) : 0,
    }));
  }

  async getTopTenants(limit: number = 10): Promise<TopTenantDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      take: limit,
      orderBy: {
        children: {
          _count: 'desc',
        },
      },
      include: {
        _count: {
          select: {
            children: true,
            users: true,
          },
        },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      childrenCount: t._count.children,
      userCount: t._count.users,
      subscriptionStatus: t.subscriptionStatus,
    }));
  }

  async getRecentActivity(limit: number = 20): Promise<RecentActivityDto[]> {
    // Combine recent tenant creations and user logins
    const [recentTenants, recentUsers] = await Promise.all([
      this.prisma.tenant.findMany({
        take: limit / 2,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { lastLoginAt: { not: null } },
        take: limit / 2,
        orderBy: { lastLoginAt: 'desc' },
        select: {
          id: true,
          name: true,
          lastLoginAt: true,
          tenant: { select: { name: true } },
        },
      }),
    ]);

    const activities: RecentActivityDto[] = [
      ...recentTenants.map((t) => ({
        id: t.id,
        type: 'TENANT_CREATED',
        description: `New tenant "${t.name}" created`,
        tenantName: t.name,
        createdAt: t.createdAt,
      })),
      ...recentUsers.map((u) => ({
        id: u.id,
        type: 'USER_LOGIN',
        description: `${u.name} logged in`,
        tenantName: u.tenant?.name,
        userName: u.name,
        createdAt: u.lastLoginAt!,
      })),
    ];

    return activities
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ============================================
  // AUDIT LOGS
  // ============================================

  async listAuditLogs(
    query: ListAuditLogsQueryDto,
  ): Promise<AuditLogsListResponseDto> {
    const {
      search,
      tenantId,
      userId,
      action,
      resourceType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.changeSummary = { contains: search, mode: 'insensitive' };
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (resourceType) {
      where.entityType = resourceType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Fetch user and tenant info for the logs
    const userIds = [
      ...new Set(logs.map((l) => l.userId).filter(Boolean)),
    ] as string[];
    const tenantIds = [...new Set(logs.map((l) => l.tenantId))];

    const [users, tenants] = await Promise.all([
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      tenantIds.length > 0
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const userMap = new Map<
      string,
      { id: string; name: string; email: string }
    >(
      users.map(
        (u) =>
          [u.id, u] as [string, { id: string; name: string; email: string }],
      ),
    );
    const tenantMap = new Map<string, { id: string; name: string }>(
      tenants.map((t) => [t.id, t] as [string, { id: string; name: string }]),
    );

    const data: AuditLogEntryDto[] = logs.map((log) => {
      const userInfo = log.userId ? userMap.get(log.userId) : undefined;
      const tenantInfo = tenantMap.get(log.tenantId);
      return {
        id: log.id,
        tenantId: log.tenantId,
        userId: log.userId ?? undefined,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        changeSummary: log.changeSummary ?? undefined,
        ipAddress: log.ipAddress ?? undefined,
        createdAt: log.createdAt,
        user: userInfo
          ? { name: userInfo.name, email: userInfo.email }
          : undefined,
        tenant: tenantInfo ? { name: tenantInfo.name } : undefined,
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAuditLogStats(): Promise<AuditLogStatsDto> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, todayCount, thisWeekCount, thisMonthCount, topActionsRaw] =
      await Promise.all([
        this.prisma.auditLog.count(),
        this.prisma.auditLog.count({
          where: { createdAt: { gte: startOfDay } },
        }),
        this.prisma.auditLog.count({
          where: { createdAt: { gte: startOfWeek } },
        }),
        this.prisma.auditLog.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          _count: true,
          orderBy: { _count: { action: 'desc' } },
          take: 5,
        }),
      ]);

    return {
      total,
      todayCount,
      thisWeekCount,
      thisMonthCount,
      topActions: topActionsRaw.map((a) => ({
        action: a.action,
        count: a._count,
      })),
    };
  }

  getAuditLogActions(): string[] {
    return Object.values(AuditAction);
  }

  async getAuditLogResourceTypes(): Promise<string[]> {
    const types = await this.prisma.auditLog.findMany({
      distinct: ['entityType'],
      select: { entityType: true },
    });
    return types.map((t) => t.entityType);
  }
}
