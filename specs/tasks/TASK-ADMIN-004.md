<task_spec id="TASK-ADMIN-004" version="2.0">

<metadata>
  <title>User Management - API and Backend</title>
  <status>ready</status>
  <layer>backend</layer>
  <sequence>304</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-USER-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/api/src/api/admin/user-management.controller.ts (NEW)
  - apps/api/src/api/admin/user-management.service.ts (NEW)
  - apps/api/src/api/admin/dto/user-management.dto.ts (NEW)

  **Files to Modify:**
  - apps/api/src/api/admin/admin.module.ts (UPDATE - add user management)

  **Current Problem:**
  No API endpoints for SUPER_ADMIN to manage users across the platform.
  Cannot list all users, activate/deactivate, or view user details across tenants.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. User Management DTOs
  ```typescript
  // apps/api/src/api/admin/dto/user-management.dto.ts
  import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsBoolean } from 'class-validator';
  import { UserRole } from '@prisma/client';

  export class ListUsersQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    tenantId?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;
  }

  export class UpdateUserDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
  }

  export class UserStatsDto {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    superAdmins: number;
    owners: number;
    admins: number;
    viewers: number;
    newUsersThisMonth: number;
  }

  export class ImpersonateResponseDto {
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
    };
  }
  ```

  ### 3. User Management Service
  ```typescript
  // apps/api/src/api/admin/user-management.service.ts
  import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
  import { PrismaService } from '@/database/prisma.service';
  import { JwtService } from '@nestjs/jwt';
  import { ListUsersQueryDto, UpdateUserDto, UserStatsDto } from './dto/user-management.dto';
  import { UserRole } from '@prisma/client';

  @Injectable()
  export class UserManagementService {
    constructor(
      private prisma: PrismaService,
      private jwtService: JwtService,
    ) {}

    async listUsers(query: ListUsersQueryDto) {
      const { search, tenantId, role, isActive, page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (tenantId) where.tenantId = tenantId;
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            tenant: { select: { id: true, name: true } },
          },
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        data: users.map((u) => ({
          ...u,
          // Don't expose sensitive fields
          auth0Id: undefined,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    async getUserById(id: string) {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          tenant: { select: { id: true, name: true, email: true } },
          userTenantRoles: {
            include: { tenant: { select: { id: true, name: true } } },
          },
        },
      });
      if (!user) throw new NotFoundException('User not found');
      return {
        ...user,
        auth0Id: undefined,
      };
    }

    async updateUser(id: string, dto: UpdateUserDto) {
      const user = await this.getUserById(id);

      // Cannot change SUPER_ADMIN role
      if (user.role === 'SUPER_ADMIN' && dto.role && dto.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Cannot demote SUPER_ADMIN');
      }

      return this.prisma.user.update({
        where: { id },
        data: dto,
      });
    }

    async deactivateUser(id: string) {
      const user = await this.getUserById(id);
      if (user.role === 'SUPER_ADMIN') {
        throw new ForbiddenException('Cannot deactivate SUPER_ADMIN');
      }
      return this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
    }

    async activateUser(id: string) {
      return this.prisma.user.update({
        where: { id },
        data: { isActive: true },
      });
    }

    async getStats(): Promise<UserStatsDto> {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [roleStats, activeStats, newUsers] = await Promise.all([
        this.prisma.user.groupBy({
          by: ['role'],
          _count: true,
        }),
        this.prisma.user.groupBy({
          by: ['isActive'],
          _count: true,
        }),
        this.prisma.user.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
      ]);

      const stats: UserStatsDto = {
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        superAdmins: 0,
        owners: 0,
        admins: 0,
        viewers: 0,
        newUsersThisMonth: newUsers,
      };

      roleStats.forEach((s) => {
        stats.totalUsers += s._count;
        if (s.role === 'SUPER_ADMIN') stats.superAdmins = s._count;
        if (s.role === 'OWNER') stats.owners = s._count;
        if (s.role === 'ADMIN') stats.admins = s._count;
        if (s.role === 'VIEWER') stats.viewers = s._count;
      });

      activeStats.forEach((s) => {
        if (s.isActive) stats.activeUsers = s._count;
        else stats.inactiveUsers = s._count;
      });

      return stats;
    }

    async getUserActivity(id: string) {
      // Get recent audit logs for this user
      const logs = await this.prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return logs;
    }

    async impersonateUser(adminId: string, targetUserId: string) {
      const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
      if (!admin || admin.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Only SUPER_ADMIN can impersonate');
      }

      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: { tenant: true },
      });
      if (!target) throw new NotFoundException('User not found');
      if (target.role === 'SUPER_ADMIN') {
        throw new ForbiddenException('Cannot impersonate another SUPER_ADMIN');
      }

      // Generate impersonation token
      const token = this.jwtService.sign({
        sub: target.id,
        email: target.email,
        role: target.role,
        tenantId: target.tenantId,
        impersonatedBy: adminId,
      });

      // Log impersonation
      await this.prisma.auditLog.create({
        data: {
          userId: adminId,
          tenantId: target.tenantId,
          action: 'IMPERSONATE_USER',
          resourceType: 'User',
          resourceId: targetUserId,
          details: { targetEmail: target.email },
        },
      });

      return {
        token,
        user: {
          id: target.id,
          email: target.email,
          name: target.name,
          role: target.role,
          tenantId: target.tenantId,
        },
      };
    }
  }
  ```

  ### 4. User Management Controller
  ```typescript
  // apps/api/src/api/admin/user-management.controller.ts
  import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
  import { UserManagementService } from './user-management.service';
  import { ListUsersQueryDto, UpdateUserDto } from './dto/user-management.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';

  @Controller('api/v1/admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  export class UserManagementController {
    constructor(private service: UserManagementService) {}

    @Get()
    listUsers(@Query() query: ListUsersQueryDto) {
      return this.service.listUsers(query);
    }

    @Get('stats')
    getStats() {
      return this.service.getStats();
    }

    @Get(':id')
    getUser(@Param('id') id: string) {
      return this.service.getUserById(id);
    }

    @Get(':id/activity')
    getUserActivity(@Param('id') id: string) {
      return this.service.getUserActivity(id);
    }

    @Patch(':id')
    updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
      return this.service.updateUser(id, dto);
    }

    @Post(':id/deactivate')
    deactivateUser(@Param('id') id: string) {
      return this.service.deactivateUser(id);
    }

    @Post(':id/activate')
    activateUser(@Param('id') id: string) {
      return this.service.activateUser(id);
    }

    @Post(':id/impersonate')
    impersonateUser(@Request() req, @Param('id') id: string) {
      return this.service.impersonateUser(req.user.id, id);
    }
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - List all users with pagination, search, filter
    - Get user details
    - Update user role (except SUPER_ADMIN)
    - Activate/deactivate users
    - User statistics
    - User activity log
    - Impersonate user (for support)
  </in_scope>
  <out_of_scope>
    - Create users (users self-register or are invited)
    - Delete users (deactivate instead)
    - Password reset (handled by Auth0)
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - All endpoints return correct data
    - Only SUPER_ADMIN can access
    - Cannot deactivate SUPER_ADMIN
    - Impersonation creates audit log
  </verification>
</definition_of_done>

</task_spec>
