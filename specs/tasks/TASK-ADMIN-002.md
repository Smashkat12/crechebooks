<task_spec id="TASK-ADMIN-002" version="2.0">

<metadata>
  <title>Tenant Management - API and Backend</title>
  <status>ready</status>
  <layer>backend</layer>
  <sequence>302</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-TENANT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/api/src/api/admin/tenant-management.controller.ts (NEW)
  - apps/api/src/api/admin/tenant-management.service.ts (NEW)
  - apps/api/src/api/admin/dto/tenant-management.dto.ts (NEW)

  **Files to Modify:**
  - apps/api/src/api/admin/admin.module.ts (UPDATE - add tenant management)

  **Current Problem:**
  No API endpoints for SUPER_ADMIN to manage tenants across the platform.
  Cannot list, create, update, or suspend tenants from admin portal.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Tenant Management DTOs
  ```typescript
  // apps/api/src/api/admin/dto/tenant-management.dto.ts
  import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsEmail, IsArray } from 'class-validator';
  import { SubscriptionStatus, TaxStatus } from '@/database/entities/tenant.entity';

  export class ListTenantsQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(SubscriptionStatus)
    status?: SubscriptionStatus;

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

  export class CreateTenantDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    tradingName?: string;

    @IsEmail()
    email: string;

    @IsString()
    phone: string;

    @IsString()
    addressLine1: string;

    @IsOptional()
    @IsString()
    addressLine2?: string;

    @IsString()
    city: string;

    @IsString()
    province: string;

    @IsString()
    postalCode: string;

    @IsOptional()
    @IsEnum(TaxStatus)
    taxStatus?: TaxStatus;

    @IsOptional()
    @IsString()
    vatNumber?: string;
  }

  export class UpdateTenantDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    tradingName?: string;

    @IsOptional()
    @IsEnum(SubscriptionStatus)
    subscriptionStatus?: SubscriptionStatus;

    @IsOptional()
    @IsEnum(TaxStatus)
    taxStatus?: TaxStatus;

    @IsOptional()
    @IsString()
    vatNumber?: string;

    // ... other optional fields
  }

  export class TenantStatsDto {
    totalTenants: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    suspendedTenants: number;
    totalUsers: number;
    totalRevenue: number;
  }
  ```

  ### 3. Tenant Management Service
  ```typescript
  // apps/api/src/api/admin/tenant-management.service.ts
  import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
  import { PrismaService } from '@/database/prisma.service';
  import { ListTenantsQueryDto, CreateTenantDto, UpdateTenantDto, TenantStatsDto } from './dto/tenant-management.dto';
  import { SubscriptionStatus } from '@prisma/client';

  @Injectable()
  export class TenantManagementService {
    constructor(private prisma: PrismaService) {}

    async listTenants(query: ListTenantsQueryDto) {
      const { search, status, page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { tradingName: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (status) {
        where.subscriptionStatus = status;
      }

      const [tenants, total] = await Promise.all([
        this.prisma.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { users: true, children: true },
            },
          },
        }),
        this.prisma.tenant.count({ where }),
      ]);

      return {
        data: tenants,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    async getTenantById(id: string) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        include: {
          users: { select: { id: true, email: true, name: true, role: true, isActive: true } },
          _count: { select: { children: true, invoices: true, transactions: true } },
        },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return tenant;
    }

    async createTenant(dto: CreateTenantDto) {
      return this.prisma.tenant.create({
        data: {
          ...dto,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          invoiceDayOfMonth: 1,
          invoiceDueDays: 7,
          matchingToleranceCents: 100,
        },
      });
    }

    async updateTenant(id: string, dto: UpdateTenantDto) {
      await this.getTenantById(id); // Verify exists
      return this.prisma.tenant.update({
        where: { id },
        data: dto,
      });
    }

    async suspendTenant(id: string) {
      return this.updateTenant(id, { subscriptionStatus: SubscriptionStatus.SUSPENDED });
    }

    async activateTenant(id: string) {
      return this.updateTenant(id, { subscriptionStatus: SubscriptionStatus.ACTIVE });
    }

    async getStats(): Promise<TenantStatsDto> {
      const [tenantStats, userCount] = await Promise.all([
        this.prisma.tenant.groupBy({
          by: ['subscriptionStatus'],
          _count: true,
        }),
        this.prisma.user.count(),
      ]);

      const stats = {
        totalTenants: 0,
        activeSubscriptions: 0,
        trialSubscriptions: 0,
        suspendedTenants: 0,
        totalUsers: userCount,
        totalRevenue: 0, // Would need billing integration
      };

      tenantStats.forEach((s) => {
        stats.totalTenants += s._count;
        if (s.subscriptionStatus === 'ACTIVE') stats.activeSubscriptions = s._count;
        if (s.subscriptionStatus === 'TRIAL') stats.trialSubscriptions = s._count;
        if (s.subscriptionStatus === 'SUSPENDED') stats.suspendedTenants = s._count;
      });

      return stats;
    }
  }
  ```

  ### 4. Tenant Management Controller
  ```typescript
  // apps/api/src/api/admin/tenant-management.controller.ts
  import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
  import { TenantManagementService } from './tenant-management.service';
  import { ListTenantsQueryDto, CreateTenantDto, UpdateTenantDto } from './dto/tenant-management.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';

  @Controller('api/v1/admin/tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  export class TenantManagementController {
    constructor(private service: TenantManagementService) {}

    @Get()
    listTenants(@Query() query: ListTenantsQueryDto) {
      return this.service.listTenants(query);
    }

    @Get('stats')
    getStats() {
      return this.service.getStats();
    }

    @Get(':id')
    getTenant(@Param('id') id: string) {
      return this.service.getTenantById(id);
    }

    @Post()
    createTenant(@Body() dto: CreateTenantDto) {
      return this.service.createTenant(dto);
    }

    @Patch(':id')
    updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
      return this.service.updateTenant(id, dto);
    }

    @Post(':id/suspend')
    suspendTenant(@Param('id') id: string) {
      return this.service.suspendTenant(id);
    }

    @Post(':id/activate')
    activateTenant(@Param('id') id: string) {
      return this.service.activateTenant(id);
    }
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - List all tenants with pagination, search, filter
    - Get tenant details
    - Create new tenant
    - Update tenant settings
    - Suspend/activate tenant
    - Platform statistics
    - SUPER_ADMIN authorization
  </in_scope>
  <out_of_scope>
    - Frontend UI (TASK-ADMIN-003)
    - Billing/subscription management
    - Tenant data migration
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - All endpoints return correct data
    - Only SUPER_ADMIN can access
    - Pagination works correctly
    - Search filters work
    - Suspend/activate changes status
  </verification>
</definition_of_done>

</task_spec>
