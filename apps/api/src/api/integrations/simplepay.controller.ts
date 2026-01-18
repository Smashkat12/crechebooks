/**
 * SimplePay Integration Controller
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 *
 * Rate Limiting: SimplePay API allows 60 requests per minute.
 * The API client implements automatic rate limiting and exponential backoff retry.
 *
 * @module api/integrations/simplepay
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole, SimplePaySyncStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { SimplePayConnectionService } from '../../integrations/simplepay/simplepay-connection.service';
import { SimplePayEmployeeService } from '../../integrations/simplepay/simplepay-employee.service';
import { SimplePayPayslipService } from '../../integrations/simplepay/simplepay-payslip.service';
import { SimplePayTaxService } from '../../integrations/simplepay/simplepay-tax.service';
import { SimplePayProfileService } from '../../integrations/simplepay/simplepay-profile.service';
import {
  SetupConnectionDto,
  ConnectionStatusDto,
  TestConnectionResultDto,
  EmployeeSyncStatusDto,
  SyncEmployeeResultDto,
  SyncAllEmployeesResultDto,
  EmployeeComparisonDto,
  ImportPayslipsDto,
  PayslipImportDto,
  BulkImportResultDto,
  Irp5CertificateDto,
  Emp201DataDto,
  ListEmployeeMappingsDto,
  ListPayslipImportsDto,
} from '../../database/dto/simplepay.dto';

/**
 * SimplePay Integration Controller
 *
 * Provides REST API endpoints for managing SimplePay payroll integration.
 * All endpoints require authentication and appropriate role permissions.
 *
 * Rate Limit: 60 requests/minute (enforced by SimplePay API)
 */
@ApiTags('SimplePay Integration')
@ApiBearerAuth()
@Controller('integrations/simplepay')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiExtraModels(
  SetupConnectionDto,
  ConnectionStatusDto,
  TestConnectionResultDto,
  EmployeeSyncStatusDto,
  SyncEmployeeResultDto,
  SyncAllEmployeesResultDto,
  EmployeeComparisonDto,
  ImportPayslipsDto,
  PayslipImportDto,
  BulkImportResultDto,
  Irp5CertificateDto,
  Emp201DataDto,
  ListEmployeeMappingsDto,
  ListPayslipImportsDto,
)
export class SimplePayController {
  constructor(
    private readonly connectionService: SimplePayConnectionService,
    private readonly employeeService: SimplePayEmployeeService,
    private readonly payslipService: SimplePayPayslipService,
    private readonly taxService: SimplePayTaxService,
    private readonly profileService: SimplePayProfileService,
  ) {}

  // ============================================
  // Connection Management
  // ============================================

  @Post('discover-clients')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Discover SimplePay clients',
    description:
      'List all SimplePay clients accessible with the given API key. ' +
      'Use this to find your client ID before setting up the connection.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of accessible clients',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        clients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid API key' })
  async discoverClients(@Body() body: { apiKey: string }): Promise<{
    success: boolean;
    clients?: Array<{ id: string; name: string }>;
    message?: string;
  }> {
    const result = await this.connectionService.listAvailableClients(
      body.apiKey,
    );
    if (!result.success) {
      throw new BadRequestException(result.message || 'Failed to list clients');
    }
    return result;
  }

  @Post('connect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Setup SimplePay connection',
    description:
      'Establish connection to SimplePay API. Credentials are encrypted before storage. ' +
      'Rate limit: 60 requests/minute.',
  })
  @ApiResponse({ status: 201, description: 'Connection established' })
  @ApiResponse({ status: 400, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (60 req/min)' })
  async setupConnection(
    @CurrentUser() user: IUser,
    @Body() dto: SetupConnectionDto,
  ): Promise<{ message: string }> {
    const tenantId = user.tenantId;

    // Test credentials first
    const test = await this.connectionService.testCredentials(
      dto.clientId,
      dto.apiKey,
    );
    if (!test.success) {
      throw new BadRequestException(
        test.message || 'Invalid SimplePay credentials',
      );
    }

    await this.connectionService.setupConnection(
      tenantId,
      dto.clientId,
      dto.apiKey,
    );
    return { message: 'SimplePay connection established successfully' };
  }

  @Get('status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get connection status' })
  @ApiResponse({ status: 200, type: ConnectionStatusDto })
  async getConnectionStatus(
    @CurrentUser() user: IUser,
  ): Promise<ConnectionStatusDto> {
    const status = await this.connectionService.getConnectionStatus(
      user.tenantId,
    );
    return {
      isConnected: status.isConnected,
      clientId: status.clientId ?? undefined,
      lastSyncAt: status.lastSyncAt ?? undefined,
      syncErrorMessage: status.syncErrorMessage ?? undefined,
      employeesSynced: status.employeesSynced,
      employeesOutOfSync: status.employeesOutOfSync,
    };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Test existing connection' })
  @ApiResponse({ status: 200, type: TestConnectionResultDto })
  async testConnection(
    @CurrentUser() user: IUser,
  ): Promise<TestConnectionResultDto> {
    return this.connectionService.testConnection(user.tenantId);
  }

  @Delete('disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Disconnect SimplePay integration' })
  @ApiResponse({ status: 204, description: 'Disconnected' })
  async disconnect(@CurrentUser() user: IUser): Promise<void> {
    await this.connectionService.disconnect(user.tenantId);
  }

  // ============================================
  // Profile Management
  // ============================================

  @Get('profiles')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get available SimplePay profiles',
    description:
      'List all payroll profiles (calculation templates) configured in SimplePay. ' +
      'Profiles define pay frequency, earnings, deductions, and leave settings.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available profiles',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'SimplePay profile ID' },
          name: { type: 'string', description: 'Profile name' },
          description: { type: 'string', description: 'Profile description' },
          calculationCount: {
            type: 'number',
            description: 'Number of calculations in profile',
          },
          isDefault: {
            type: 'boolean',
            description: 'Whether this is the default profile',
          },
        },
      },
    },
  })
  async getAvailableProfiles(@CurrentUser() user: IUser): Promise<
    Array<{
      id: number;
      name: string;
      description: string | null;
      calculationCount: number;
      isDefault: boolean;
    }>
  > {
    return this.profileService.getAvailableProfiles(user.tenantId);
  }

  // ============================================
  // Employee Sync
  // ============================================

  @Get('employees')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'List all SimplePay employees',
    description:
      'Fetch all employees from SimplePay for the connected client. ' +
      'Useful for debugging and verifying employee sync status.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of SimplePay employees',
    schema: {
      type: 'object',
      properties: {
        employees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              id_number: { type: 'string' },
              number: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
        count: { type: 'number' },
      },
    },
  })
  async listSimplePayEmployees(@CurrentUser() user: IUser): Promise<{
    employees: Array<{
      id: number;
      first_name: string;
      last_name: string;
      id_number: string;
      number: string;
      email: string;
    }>;
    count: number;
  }> {
    const employees = await this.connectionService.listEmployees(user.tenantId);
    return {
      employees,
      count: employees.length,
    };
  }

  @Post('employees/:staffId/sync')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sync single employee to SimplePay' })
  @ApiResponse({ status: 200, type: SyncEmployeeResultDto })
  async syncEmployee(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
  ): Promise<SyncEmployeeResultDto> {
    try {
      const mapping = await this.employeeService.syncEmployee(
        user.tenantId,
        staffId,
      );
      return {
        success: true,
        staffId,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        message: 'Employee synced successfully',
      };
    } catch (error) {
      return {
        success: false,
        staffId,
        message: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  @Post('employees/sync-all')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sync all employees to SimplePay' })
  @ApiResponse({ status: 200, type: SyncAllEmployeesResultDto })
  async syncAllEmployees(
    @CurrentUser() user: IUser,
  ): Promise<SyncAllEmployeesResultDto> {
    return this.employeeService.syncAllEmployees(user.tenantId);
  }

  @Get('employees/:staffId/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get employee sync status' })
  @ApiResponse({ status: 200, type: EmployeeSyncStatusDto })
  async getEmployeeSyncStatus(
    @Param('staffId') staffId: string,
  ): Promise<EmployeeSyncStatusDto> {
    const syncStatus = await this.employeeService.getSyncStatus(staffId);
    return {
      staffId,
      syncStatus: syncStatus,
    };
  }

  @Get('employees/:staffId/compare')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Compare local and SimplePay employee data' })
  @ApiResponse({ status: 200, type: EmployeeComparisonDto })
  async compareEmployee(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
  ): Promise<EmployeeComparisonDto> {
    return this.employeeService.compareEmployee(user.tenantId, staffId);
  }

  // ============================================
  // Payslip Import
  // ============================================

  @Post('payslips/import')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Import payslips from SimplePay' })
  @ApiResponse({ status: 200, type: BulkImportResultDto })
  async importPayslips(
    @CurrentUser() user: IUser,
    @Body() dto: ImportPayslipsDto,
  ): Promise<BulkImportResultDto> {
    return this.payslipService.importAllPayslips(
      user.tenantId,
      dto.payPeriodStart,
      dto.payPeriodEnd,
      dto.staffIds,
    );
  }

  @Get('employees/:staffId/payslips')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get imported payslips for employee' })
  @ApiResponse({ status: 200, type: [PayslipImportDto] })
  async getImportedPayslips(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ data: PayslipImportDto[]; total: number }> {
    return this.payslipService.getImportedPayslips(user.tenantId, staffId, {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('payslips/:id/pdf')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Download payslip PDF' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async downloadPayslipPdf(
    @CurrentUser() user: IUser,
    @Param('id') simplePayPayslipId: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.payslipService.getPayslipPdf(
      user.tenantId,
      simplePayPayslipId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${simplePayPayslipId}.pdf"`,
    });
    res.send(pdf);
  }

  // ============================================
  // Tax Documents
  // ============================================

  @Get('employees/:staffId/irp5')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Fetch IRP5 certificates for employee' })
  @ApiResponse({ status: 200, type: [Irp5CertificateDto] })
  async fetchIrp5(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
    @Query('year') year?: number,
  ): Promise<Irp5CertificateDto[]> {
    const certificates = await this.taxService.fetchIrp5Certificates(
      user.tenantId,
      staffId,
      year ? Number(year) : undefined,
    );
    return certificates.map((cert) => ({
      taxYear: cert.tax_year,
      certificateNumber: cert.certificate_number,
      grossRemuneration: cert.gross_remuneration,
      payeDeducted: cert.paye_deducted,
    }));
  }

  @Get('employees/:staffId/irp5/:year/pdf')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Download IRP5 PDF' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async downloadIrp5Pdf(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
    @Param('year') year: number,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.taxService.getIrp5Pdf(
      user.tenantId,
      staffId,
      Number(year),
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="irp5-${year}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('emp201')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Fetch EMP201 data for period' })
  @ApiResponse({ status: 200, type: Emp201DataDto })
  async fetchEmp201(
    @CurrentUser() user: IUser,
    @Query('date') date: string,
  ): Promise<Emp201DataDto> {
    const data = await this.taxService.fetchEmp201(
      user.tenantId,
      new Date(date),
    );
    return {
      period: data.period,
      totalPaye: data.total_paye,
      totalSdl: data.total_sdl,
      totalUifEmployer: data.total_uif_employer,
      totalUifEmployee: data.total_uif_employee,
      totalEti: data.total_eti,
      employeesCount: data.employees_count,
    };
  }
}
