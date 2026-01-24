/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * Service for managing impersonation sessions
 */

import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, AuditAction } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  StartImpersonationDto,
  ImpersonationSessionDto,
  ImpersonationResponseDto,
  TenantForImpersonationDto,
  TenantsForImpersonationResponseDto,
  CurrentImpersonationResponseDto,
  EndImpersonationResponseDto,
  ImpersonationSessionHistoryDto,
  ListImpersonationSessionsQueryDto,
  IMPERSONATION_ROLES,
  ImpersonationRole,
} from './dto/impersonation.dto';

// Maximum session duration: 4 hours
const MAX_SESSION_DURATION_HOURS = 4;
const MAX_SESSION_DURATION_MS = MAX_SESSION_DURATION_HOURS * 60 * 60 * 1000;

export interface ImpersonationContext {
  sessionId: string;
  tenantId: string;
  role: UserRole;
  startedAt: number;
  expiresAt: number;
}

export interface ImpersonationJwtPayload {
  sub: string;
  email: string;
  impersonation: ImpersonationContext;
  iat: number;
  exp: number;
}

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);
  private readonly jwtExpiration: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Use shorter expiration for impersonation tokens (max 4 hours)
    const configExpiration =
      this.configService.get<number>('JWT_EXPIRATION') || 28800;
    this.jwtExpiration = Math.min(
      configExpiration,
      MAX_SESSION_DURATION_MS / 1000,
    );
  }

  /**
   * Get list of tenants available for impersonation
   */
  async getTenantsForImpersonation(
    search?: string,
  ): Promise<TenantsForImpersonationResponseDto> {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { tradingName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          tradingName: true,
          email: true,
          subscriptionStatus: true,
          _count: {
            select: {
              users: true,
              children: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const tenantsDto: TenantForImpersonationDto[] = tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      tradingName: tenant.tradingName ?? undefined,
      email: tenant.email,
      subscriptionStatus: tenant.subscriptionStatus,
      availableRoles: [...IMPERSONATION_ROLES],
      userCount: tenant._count.users,
      childCount: tenant._count.children,
    }));

    return { tenants: tenantsDto, total };
  }

  /**
   * Start an impersonation session
   */
  async startImpersonation(
    superAdminId: string,
    dto: StartImpersonationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ response: ImpersonationResponseDto; accessToken: string }> {
    // Validate role is in allowed list (ImpersonationRole type already excludes SUPER_ADMIN)
    if (!IMPERSONATION_ROLES.includes(dto.role)) {
      throw new BadRequestException('Invalid impersonation role');
    }

    // Verify super admin exists and is active
    const superAdmin = await this.prisma.user.findUnique({
      where: { id: superAdminId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!superAdmin || superAdmin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN users can impersonate');
    }

    if (!superAdmin.isActive) {
      throw new ForbiddenException('User account is deactivated');
    }

    // Verify target tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true, name: true, subscriptionStatus: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} not found`);
    }

    // Check for existing active session
    const existingSession = await this.prisma.impersonationSession.findFirst({
      where: {
        superAdminId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingSession) {
      throw new ConflictException(
        'You already have an active impersonation session. End it before starting a new one.',
      );
    }

    // Create session
    const expiresAt = new Date(Date.now() + MAX_SESSION_DURATION_MS);
    const session = await this.prisma.impersonationSession.create({
      data: {
        superAdminId,
        targetTenantId: dto.tenantId,
        assumedRole: dto.role,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        reason: dto.reason ?? null,
        isActive: true,
      },
      include: {
        targetTenant: { select: { name: true } },
      },
    });

    // Create audit log
    await this.createAuditLog(
      superAdminId,
      dto.tenantId,
      AuditAction.IMPERSONATION_START,
      {
        sessionId: session.id,
        assumedRole: dto.role,
        reason: dto.reason,
      },
      ipAddress,
      userAgent,
    );

    // Generate impersonation JWT
    const impersonationContext: ImpersonationContext = {
      sessionId: session.id,
      tenantId: dto.tenantId,
      role: dto.role,
      startedAt: Math.floor(session.startedAt.getTime() / 1000),
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };

    const payload: Omit<ImpersonationJwtPayload, 'iat' | 'exp'> = {
      sub: superAdminId,
      email: superAdmin.email,
      impersonation: impersonationContext,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.jwtExpiration,
    });

    const sessionDto: ImpersonationSessionDto = {
      id: session.id,
      superAdminId: session.superAdminId,
      targetTenantId: session.targetTenantId,
      tenantName: session.targetTenant.name,
      assumedRole: session.assumedRole as ImpersonationRole,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      expiresAt: session.expiresAt,
      isActive: session.isActive,
      reason: session.reason ?? undefined,
    };

    this.logger.log(
      `Impersonation started: Admin ${superAdminId} -> Tenant ${dto.tenantId} as ${dto.role}`,
    );

    return {
      response: {
        success: true,
        message: `Now viewing ${tenant.name} as ${dto.role}`,
        session: sessionDto,
        expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      },
      accessToken,
    };
  }

  /**
   * End the current impersonation session
   */
  async endImpersonation(
    superAdminId: string,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EndImpersonationResponseDto> {
    const whereClause = sessionId
      ? { id: sessionId, superAdminId, isActive: true }
      : { superAdminId, isActive: true };

    const session = await this.prisma.impersonationSession.findFirst({
      where: whereClause,
      include: {
        targetTenant: { select: { name: true } },
      },
    });

    if (!session) {
      return {
        success: true,
        message: 'No active impersonation session found',
      };
    }

    // End the session
    const endedSession = await this.prisma.impersonationSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
      include: {
        targetTenant: { select: { name: true } },
      },
    });

    // Create audit log
    await this.createAuditLog(
      superAdminId,
      session.targetTenantId,
      AuditAction.IMPERSONATION_END,
      {
        sessionId: session.id,
        duration: Math.floor((Date.now() - session.startedAt.getTime()) / 1000),
      },
      ipAddress,
      userAgent,
    );

    this.logger.log(
      `Impersonation ended: Admin ${superAdminId} <- Tenant ${session.targetTenantId}`,
    );

    return {
      success: true,
      message: `Exited impersonation of ${session.targetTenant.name}`,
      session: {
        id: endedSession.id,
        superAdminId: endedSession.superAdminId,
        targetTenantId: endedSession.targetTenantId,
        tenantName: endedSession.targetTenant.name,
        assumedRole: endedSession.assumedRole as ImpersonationRole,
        startedAt: endedSession.startedAt,
        endedAt: endedSession.endedAt ?? undefined,
        expiresAt: endedSession.expiresAt,
        isActive: endedSession.isActive,
        reason: endedSession.reason ?? undefined,
      },
    };
  }

  /**
   * Get current impersonation session for a user
   */
  async getCurrentSession(
    superAdminId: string,
  ): Promise<CurrentImpersonationResponseDto> {
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        superAdminId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: {
        targetTenant: { select: { name: true } },
      },
    });

    if (!session) {
      return { isImpersonating: false };
    }

    const timeRemaining = Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    );

    return {
      isImpersonating: true,
      session: {
        id: session.id,
        superAdminId: session.superAdminId,
        targetTenantId: session.targetTenantId,
        tenantName: session.targetTenant.name,
        assumedRole: session.assumedRole as ImpersonationRole,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? undefined,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
        reason: session.reason ?? undefined,
      },
      timeRemaining,
    };
  }

  /**
   * Get impersonation session by ID
   */
  async getSessionById(
    sessionId: string,
  ): Promise<ImpersonationSessionDto | null> {
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: sessionId },
      include: {
        targetTenant: { select: { name: true } },
      },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      superAdminId: session.superAdminId,
      targetTenantId: session.targetTenantId,
      tenantName: session.targetTenant.name,
      assumedRole: session.assumedRole as ImpersonationRole,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      expiresAt: session.expiresAt,
      isActive: session.isActive,
      reason: session.reason ?? undefined,
    };
  }

  /**
   * Validate and get impersonation context from JWT payload
   */
  async validateImpersonationContext(
    impersonation: ImpersonationContext,
  ): Promise<{ tenantId: string; role: UserRole } | null> {
    // Check if session exists and is still valid
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: impersonation.sessionId },
    });

    if (!session) {
      this.logger.warn(
        `Impersonation session not found: ${impersonation.sessionId}`,
      );
      return null;
    }

    if (!session.isActive) {
      this.logger.warn(
        `Impersonation session no longer active: ${impersonation.sessionId}`,
      );
      return null;
    }

    if (session.expiresAt < new Date()) {
      this.logger.warn(
        `Impersonation session expired: ${impersonation.sessionId}`,
      );
      // Auto-deactivate expired session
      await this.prisma.impersonationSession.update({
        where: { id: session.id },
        data: { isActive: false, endedAt: new Date() },
      });
      return null;
    }

    return {
      tenantId: session.targetTenantId,
      role: session.assumedRole,
    };
  }

  /**
   * Get session history for audit purposes
   */
  async getSessionHistory(
    query: ListImpersonationSessionsQueryDto,
  ): Promise<ImpersonationSessionHistoryDto> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.tenantId) {
      where.targetTenantId = query.tenantId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [sessions, total] = await Promise.all([
      this.prisma.impersonationSession.findMany({
        where,
        include: {
          targetTenant: { select: { name: true } },
          superAdmin: { select: { name: true, email: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.impersonationSession.count({ where }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        superAdminId: s.superAdminId,
        targetTenantId: s.targetTenantId,
        tenantName: s.targetTenant.name,
        assumedRole: s.assumedRole as ImpersonationRole,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? undefined,
        expiresAt: s.expiresAt,
        isActive: s.isActive,
        reason: s.reason ?? undefined,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Create audit log entry for impersonation actions
   */
  private async createAuditLog(
    userId: string,
    tenantId: string,
    action: AuditAction,
    afterValue: {
      sessionId: string;
      assumedRole?: string;
      reason?: string;
      duration?: number;
    },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'ImpersonationSession',
          entityId: afterValue.sessionId,
          action,
          afterValue: JSON.parse(JSON.stringify(afterValue)),
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create audit log for impersonation', error);
    }
  }
}
