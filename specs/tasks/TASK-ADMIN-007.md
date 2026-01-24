<task_spec id="TASK-ADMIN-007" version="2.0">

<metadata>
  <title>Audit Log Viewer</title>
  <status>ready</status>
  <layer>fullstack</layer>
  <sequence>307</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-AUDIT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-004</task_ref>
    <task_ref status="ready">TASK-ADMIN-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/api/src/api/admin/audit-logs.controller.ts (NEW)
  - apps/api/src/api/admin/audit-logs.service.ts (NEW)
  - apps/web/src/app/admin/audit-logs/page.tsx (NEW)
  - apps/web/src/components/admin/AuditLogTable.tsx (NEW)
  - apps/web/src/components/admin/AuditLogFilters.tsx (NEW)
  - apps/web/src/hooks/use-admin-audit-logs.ts (NEW)

  **Existing Infrastructure:**
  - AuditLog entity exists at apps/api/src/database/entities/audit-log.entity.ts
  - Audit logging is already implemented throughout the application
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Audit Logs Service
  ```typescript
  // apps/api/src/api/admin/audit-logs.service.ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '@/database/prisma.service';

  interface ListAuditLogsParams {
    search?: string;
    tenantId?: string;
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }

  @Injectable()
  export class AuditLogsService {
    constructor(private prisma: PrismaService) {}

    async listLogs(params: ListAuditLogsParams) {
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
      } = params;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (search) {
        where.OR = [
          { action: { contains: search, mode: 'insensitive' } },
          { resourceType: { contains: search, mode: 'insensitive' } },
          { resourceId: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (tenantId) where.tenantId = tenantId;
      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (resourceType) where.resourceType = resourceType;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
            tenant: { select: { id: true, name: true } },
          },
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    async getLogById(id: string) {
      return this.prisma.auditLog.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      });
    }

    async getDistinctActions() {
      const actions = await this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      });
      return actions.map((a) => a.action);
    }

    async getDistinctResourceTypes() {
      const types = await this.prisma.auditLog.findMany({
        distinct: ['resourceType'],
        select: { resourceType: true },
        orderBy: { resourceType: 'asc' },
      });
      return types.map((t) => t.resourceType);
    }

    async getStats() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [total, todayCount, actionBreakdown] = await Promise.all([
        this.prisma.auditLog.count(),
        this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          _count: true,
          orderBy: { _count: { action: 'desc' } },
          take: 10,
        }),
      ]);

      return {
        total,
        todayCount,
        topActions: actionBreakdown.map((a) => ({
          action: a.action,
          count: a._count,
        })),
      };
    }
  }
  ```

  ### 3. Audit Logs Controller
  ```typescript
  // apps/api/src/api/admin/audit-logs.controller.ts
  import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
  import { AuditLogsService } from './audit-logs.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';

  @Controller('api/v1/admin/audit-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  export class AuditLogsController {
    constructor(private service: AuditLogsService) {}

    @Get()
    listLogs(
      @Query('search') search?: string,
      @Query('tenantId') tenantId?: string,
      @Query('userId') userId?: string,
      @Query('action') action?: string,
      @Query('resourceType') resourceType?: string,
      @Query('startDate') startDate?: string,
      @Query('endDate') endDate?: string,
      @Query('page') page?: string,
      @Query('limit') limit?: string,
    ) {
      return this.service.listLogs({
        search,
        tenantId,
        userId,
        action,
        resourceType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
      });
    }

    @Get('stats')
    getStats() {
      return this.service.getStats();
    }

    @Get('actions')
    getActions() {
      return this.service.getDistinctActions();
    }

    @Get('resource-types')
    getResourceTypes() {
      return this.service.getDistinctResourceTypes();
    }

    @Get(':id')
    getLog(@Param('id') id: string) {
      return this.service.getLogById(id);
    }
  }
  ```

  ### 4. Audit Logs Page
  ```typescript
  // apps/web/src/app/admin/audit-logs/page.tsx
  'use client';

  import { useState } from 'react';
  import { useAdminAuditLogs, useAuditLogStats, useAuditLogFilters } from '@/hooks/use-admin-audit-logs';
  import { AuditLogTable } from '@/components/admin/AuditLogTable';
  import { AuditLogFilters } from '@/components/admin/AuditLogFilters';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { ScrollText, Clock, Activity } from 'lucide-react';

  export default function AuditLogsPage() {
    const [filters, setFilters] = useState({
      search: '',
      action: '',
      resourceType: '',
      tenantId: '',
      startDate: '',
      endDate: '',
    });
    const [page, setPage] = useState(1);

    const { data: logsData, isLoading } = useAdminAuditLogs({ ...filters, page });
    const { data: stats } = useAuditLogStats();
    const { data: filterOptions } = useAuditLogFilters();

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">View all activity across the platform</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
              <ScrollText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.todayCount || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Top Action</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topActions?.[0]?.action || '—'}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <AuditLogFilters
          filters={filters}
          onChange={setFilters}
          actions={filterOptions?.actions || []}
          resourceTypes={filterOptions?.resourceTypes || []}
        />

        {/* Log Table */}
        <AuditLogTable
          data={logsData?.data || []}
          isLoading={isLoading}
          pagination={logsData?.pagination}
          onPageChange={setPage}
        />
      </div>
    );
  }
  ```

  ### 5. Audit Log Table
  ```typescript
  // apps/web/src/components/admin/AuditLogTable.tsx
  'use client';

  import { Badge } from '@/components/ui/badge';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
  import { Button } from '@/components/ui/button';
  import { formatDistanceToNow } from 'date-fns';

  const actionColors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    LOGIN: 'bg-purple-100 text-purple-800',
    LOGOUT: 'bg-gray-100 text-gray-800',
  };

  interface AuditLogTableProps {
    data: any[];
    isLoading: boolean;
    pagination?: { page: number; totalPages: number; total: number };
    onPageChange: (page: number) => void;
  }

  export function AuditLogTable({ data, isLoading, pagination, onPageChange }: AuditLogTableProps) {
    if (isLoading) return <div className="py-8 text-center">Loading logs...</div>;

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {log.createdAt
                    ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                    : '—'}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div className="font-medium">{log.user?.name || '—'}</div>
                    <div className="text-muted-foreground">{log.user?.email}</div>
                  </div>
                </TableCell>
                <TableCell>{log.tenant?.name || '—'}</TableCell>
                <TableCell>
                  <Badge className={actionColors[log.action?.split('_')[0]] || 'bg-gray-100'}>
                    {log.action}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{log.resourceType}</div>
                    <div className="text-muted-foreground text-xs">{log.resourceId}</div>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details).slice(0, 50) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - List all audit logs across platform
    - Filter by action, resource type, tenant, user, date range
    - Search functionality
    - Pagination
    - Log statistics
    - Log detail view
  </in_scope>
  <out_of_scope>
    - Export to CSV/PDF
    - Log retention policies
    - Real-time streaming
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - Logs load with pagination
    - All filters work correctly
    - Only SUPER_ADMIN can access
  </verification>
</definition_of_done>

</task_spec>
