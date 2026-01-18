<task_spec id="TASK-WEB-050" version="2.0">

<metadata>
  <title>Leave Balance API Endpoints and Frontend Hook</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>250</sequence>
  <implements>
    <requirement_ref>REQ-LEAVE-API-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/api/src/api/staff/leave.controller.ts (NEW)
  - apps/web/src/hooks/use-leave.ts (NEW)
  - apps/web/src/lib/api/leave.ts (NEW)

  **Current Problem:**
  The backend simplepay-leave.service.ts has comprehensive leave management:
  - getLeaveTypes() - Get all leave types
  - getLeaveBalances(tenantId) - Get all balances
  - getLeaveBalancesByStaff(tenantId, staffId) - Get staff balances
  - getLeaveDays(tenantId, staffId, options) - Get leave history
  - createLeaveDay(tenantId, staffId, data) - Create leave request

  BUT there is NO API controller exposing these to the frontend!

  **API Endpoints to Create:**
  | Method | Path | Description |
  |--------|------|-------------|
  | GET | /staff/leave/types | Get all leave types |
  | GET | /staff/:staffId/leave/balances | Get leave balances for staff |
  | GET | /staff/:staffId/leave/history | Get leave history |
  | POST | /staff/:staffId/leave/request | Create leave request |
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Leave Controller Pattern
  ```typescript
  import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
  import { UserRole } from '@prisma/client';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';
  import { CurrentUser } from '../auth/decorators/current-user.decorator';
  import type { IUser } from '../../database/entities/user.entity';
  import { SimplePayLeaveService } from '../../integrations/simplepay/simplepay-leave.service';

  @ApiTags('Staff Leave')
  @ApiBearerAuth()
  @Controller('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class LeaveController {
    constructor(private readonly leaveService: SimplePayLeaveService) {}

    @Get('leave/types')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
    @ApiOperation({ summary: 'Get available leave types' })
    async getLeaveTypes(@CurrentUser() user: IUser) {
      return this.leaveService.getLeaveTypes(user.tenantId);
    }

    @Get(':staffId/leave/balances')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
    @ApiOperation({ summary: 'Get leave balances for staff member' })
    async getLeaveBalances(@CurrentUser() user: IUser, @Param('staffId') staffId: string) {
      return this.leaveService.getLeaveBalancesByStaff(user.tenantId, staffId);
    }

    @Get(':staffId/leave/history')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
    @ApiOperation({ summary: 'Get leave history for staff member' })
    async getLeaveHistory(
      @CurrentUser() user: IUser,
      @Param('staffId') staffId: string,
      @Query('fromDate') fromDate?: string,
      @Query('toDate') toDate?: string,
    ) {
      return this.leaveService.getLeaveDays(user.tenantId, staffId, {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
      });
    }

    @Post(':staffId/leave/request')
    @Roles(UserRole.OWNER, UserRole.ADMIN)
    @ApiOperation({ summary: 'Create leave request' })
    async createLeaveRequest(@CurrentUser() user: IUser, @Param('staffId') staffId: string, @Body() dto: any) {
      return this.leaveService.createLeaveDay(user.tenantId, staffId, dto);
    }
  }
  ```

  ### 3. Frontend Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-leave.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { leaveApi } from '@/lib/api/leave';

  export function useLeaveTypes() {
    return useQuery({ queryKey: ['leave', 'types'], queryFn: () => leaveApi.getLeaveTypes() });
  }

  export function useLeaveBalances(staffId: string) {
    return useQuery({
      queryKey: ['staff', staffId, 'leave', 'balances'],
      queryFn: () => leaveApi.getLeaveBalances(staffId),
      enabled: !!staffId,
    });
  }

  export function useLeaveHistory(staffId: string, options?: { fromDate?: string; toDate?: string }) {
    return useQuery({
      queryKey: ['staff', staffId, 'leave', 'history', options],
      queryFn: () => leaveApi.getLeaveHistory(staffId, options),
      enabled: !!staffId,
    });
  }

  export function useCreateLeaveRequest() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ staffId, ...data }: { staffId: string; [key: string]: any }) =>
        leaveApi.createLeaveRequest(staffId, data),
      onSuccess: (_, { staffId }) => {
        queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'leave'] });
      },
    });
  }
  ```

  ### 4. API Client Pattern
  ```typescript
  // apps/web/src/lib/api/leave.ts
  import { apiClient } from './client';

  export const leaveApi = {
    getLeaveTypes: async () => {
      const { data } = await apiClient.get('/staff/leave/types');
      return data;
    },
    getLeaveBalances: async (staffId: string) => {
      const { data } = await apiClient.get(`/staff/${staffId}/leave/balances`);
      return data;
    },
    getLeaveHistory: async (staffId: string, options?: { fromDate?: string; toDate?: string }) => {
      const { data } = await apiClient.get(`/staff/${staffId}/leave/history`, { params: options });
      return data;
    },
    createLeaveRequest: async (staffId: string, body: any) => {
      const { data } = await apiClient.post(`/staff/${staffId}/leave/request`, body);
      return data;
    },
  };
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Create LeaveController with REST endpoints
    - Create leave.ts API client
    - Create use-leave.ts hooks
    - Update staff.module.ts to include LeaveController
  </in_scope>
  <out_of_scope>
    - Leave approval workflow
    - Manager notifications
    - Leave policy enforcement
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - pnpm test --runInBand: all tests passing
    - GET /staff/leave/types returns leave types
    - GET /staff/:staffId/leave/balances returns balances
    - Hooks fetch data correctly
  </verification>
</definition_of_done>

</task_spec>
