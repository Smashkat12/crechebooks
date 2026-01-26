import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
  Res,
  Req,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StaffAuthGuard } from '../auth/guards/staff-auth.guard';
import { CurrentStaff } from '../auth/decorators/current-staff.decorator';
import type { StaffSessionInfo } from '../auth/decorators/current-staff.decorator';
import { SimplePayPayslipService } from '../../integrations/simplepay/simplepay-payslip.service';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { StaffDashboardResponseDto } from './dto/staff-dashboard.dto';
import {
  PayslipsResponseDto,
  PayslipDetailDto,
} from './dto/staff-payslips.dto';
import {
  LeaveBalancesResponseDto,
  LeaveRequestsResponseDto,
  LeaveRequestDto,
  LeaveRequestSuccessDto,
  CreateLeaveRequestDto,
  LeaveType,
  LeaveStatus,
} from './dto/staff-leave.dto';
import {
  IRP5ListResponseDto,
  StaffProfileDto,
  UpdateProfileDto,
  ProfileUpdateSuccessDto,
  BankingDetailsDto,
} from './dto/staff-profile.dto';
import { StaffOnboardingService } from '../../database/services/staff-onboarding.service';
import { StaffDocumentService } from '../../database/services/staff-document.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  SignDocumentDto,
  OnboardingStep,
} from '../../database/dto/staff-onboarding.dto';
import { DocumentType } from '../../database/entities/staff-onboarding.entity';

@ApiTags('Staff Portal')
@UseGuards(StaffAuthGuard)
@Controller('staff-portal')
export class StaffPortalController {
  private readonly logger = new Logger(StaffPortalController.name);

  // In-memory store for mock leave requests (will be replaced with DB)
  private mockLeaveRequests: Map<string, LeaveRequestDto[]> = new Map();

  constructor(
    private readonly onboardingService: StaffOnboardingService,
    private readonly documentService: StaffDocumentService,
    private readonly prisma: PrismaService,
    private readonly payslipService: SimplePayPayslipService,
    private readonly simplePayRepo: SimplePayRepository,
  ) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Staff dashboard data retrieved successfully',
    type: StaffDashboardResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDashboard(@CurrentStaff() session: StaffSessionInfo) {
    this.logger.log(`Fetching dashboard for staff: ${session.staff.email}`);

    // Fetch real staff data from database
    const staff = await this.prisma.staff.findUnique({
      where: { id: session.staffId },
      include: { simplePayMapping: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    // Fetch recent imported payslips from SimplePay
    let recentPayslips: Array<{
      id: string;
      payDate: Date;
      period: string;
      grossPay: number;
      netPay: number;
    }> = [];

    try {
      const { data: imports } = await this.payslipService.getImportedPayslips(
        session.tenantId,
        session.staffId,
        { limit: 3 },
      );

      recentPayslips = imports.map((p) => ({
        id: p.id,
        payDate: p.payPeriodEnd,
        period: new Date(p.payPeriodStart).toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        }),
        grossPay: p.grossSalaryCents / 100,
        netPay: p.netSalaryCents / 100,
      }));
    } catch (err) {
      this.logger.warn(`Failed to fetch payslips for dashboard: ${err}`);
    }

    // Calculate YTD earnings from imported payslips
    const ytdEarnings = {
      grossEarnings: 0,
      netEarnings: 0,
      totalTax: 0,
      totalDeductions: 0,
    };

    try {
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const { data: ytdImports } =
        await this.payslipService.getImportedPayslips(
          session.tenantId,
          session.staffId,
          { fromDate: yearStart, limit: 100 },
        );

      for (const p of ytdImports) {
        ytdEarnings.grossEarnings += p.grossSalaryCents / 100;
        ytdEarnings.netEarnings += p.netSalaryCents / 100;
        ytdEarnings.totalTax += (p.payeCents || 0) / 100;
        ytdEarnings.totalDeductions +=
          (p.grossSalaryCents - p.netSalaryCents) / 100;
      }
    } catch (err) {
      this.logger.warn(`Failed to calculate YTD earnings: ${err}`);
    }

    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 25);

    return {
      employmentStatus: {
        position: staff.position || 'Staff Member',
        department: staff.department || undefined,
        startDate: staff.startDate,
        status: staff.isActive ? 'active' : 'terminated',
        employeeNumber: staff.employeeNumber || undefined,
      },
      recentPayslips,
      leaveBalance: {
        annual: 15,
        annualUsed: 0,
        sick: 10,
        sickUsed: 0,
        family: 3,
        familyUsed: 0,
      },
      nextPayDate: nextMonth,
      ytdEarnings,
      announcements: [],
    };
  }

  @Get('payslips')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff payslips' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Staff payslips retrieved successfully',
    type: PayslipsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPayslips(
    @CurrentStaff() session: StaffSessionInfo,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(
      `Fetching payslips for staff: ${session.staff.email}, year: ${year || 'current'}`,
    );

    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '12');

    // Build date range for year filter
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const fromDate = new Date(targetYear, 0, 1);
    const toDate = new Date(targetYear, 11, 31);

    const { data: imports, total } =
      await this.payslipService.getImportedPayslips(
        session.tenantId,
        session.staffId,
        { fromDate, toDate, page: pageNum, limit: limitNum },
      );

    const payslips = imports.map((p) => ({
      id: p.id,
      payDate: p.payPeriodEnd,
      period: new Date(p.payPeriodStart).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
      periodStart: p.payPeriodStart,
      periodEnd: p.payPeriodEnd,
      grossPay: p.grossSalaryCents / 100,
      netPay: p.netSalaryCents / 100,
      totalDeductions: (p.grossSalaryCents - p.netSalaryCents) / 100,
      status: 'paid' as const,
    }));

    return {
      data: payslips,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get('payslips/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payslip detail' })
  @ApiParam({ name: 'id', description: 'Payslip ID' })
  @ApiResponse({
    status: 200,
    description: 'Payslip detail retrieved successfully',
    type: PayslipDetailDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payslip not found' })
  async getPayslipDetail(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('id') id: string,
  ) {
    this.logger.log(
      `Fetching payslip detail for staff: ${session.staff.email}, id: ${id}`,
    );

    // Find the imported payslip record
    const payslipImport = await this.simplePayRepo.findPayslipImport(id);

    if (!payslipImport || payslipImport.staffId !== session.staffId) {
      throw new NotFoundException('Payslip not found');
    }

    // Parse stored SimplePay payslip data for detailed breakdown
    const spData = payslipImport.payslipData as Record<string, unknown> | null;

    return {
      id: payslipImport.id,
      payDate: payslipImport.payPeriodEnd,
      period: new Date(payslipImport.payPeriodStart).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
      periodStart: payslipImport.payPeriodStart,
      periodEnd: payslipImport.payPeriodEnd,
      grossPay: payslipImport.grossSalaryCents / 100,
      netPay: payslipImport.netSalaryCents / 100,
      totalDeductions:
        (payslipImport.grossSalaryCents - payslipImport.netSalaryCents) / 100,
      status: 'paid',
      earnings: [
        {
          name: 'Basic Salary',
          amount: payslipImport.grossSalaryCents / 100,
        },
      ],
      deductions: [
        ...(payslipImport.payeCents
          ? [
              {
                name: 'PAYE Tax',
                amount: payslipImport.payeCents / 100,
                type: 'tax',
              },
            ]
          : []),
        ...(payslipImport.uifEmployeeCents
          ? [
              {
                name: 'UIF (Employee)',
                amount: payslipImport.uifEmployeeCents / 100,
                type: 'uif',
              },
            ]
          : []),
      ],
      employerContributions: [
        ...(payslipImport.uifEmployerCents
          ? [
              {
                name: 'UIF (Employer)',
                amount: payslipImport.uifEmployerCents / 100,
              },
            ]
          : []),
      ],
      totalEarnings: payslipImport.grossSalaryCents / 100,
      totalTax: (payslipImport.payeCents || 0) / 100,
      totalEmployerContributions: (payslipImport.uifEmployerCents || 0) / 100,
      paymentMethod: 'Bank Transfer',
      simplePayPayslipId: payslipImport.simplePayPayslipId,
      rawData: spData,
    };
  }

  @Get('payslips/:id/pdf')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download payslip PDF' })
  @ApiParam({ name: 'id', description: 'Payslip ID' })
  @Header('Content-Type', 'application/pdf')
  @ApiResponse({
    status: 200,
    description: 'Payslip PDF downloaded successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payslip not found' })
  async downloadPayslipPdf(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Downloading payslip PDF for staff: ${session.staff.email}, id: ${id}`,
    );

    // Find the imported payslip to get SimplePay ID
    const payslipImport = await this.simplePayRepo.findPayslipImport(id);

    if (!payslipImport || payslipImport.staffId !== session.staffId) {
      throw new NotFoundException('Payslip not found');
    }

    try {
      const pdfBuffer = await this.payslipService.getPayslipPdf(
        session.tenantId,
        payslipImport.simplePayPayslipId,
      );

      res.set({
        'Content-Disposition': `attachment; filename="payslip-${payslipImport.simplePayPayslipId}.pdf"`,
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length.toString(),
      });

      res.send(pdfBuffer);
    } catch (error) {
      this.logger.error(
        `Failed to download payslip PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new NotFoundException('Payslip PDF not available');
    }
  }

  // ============================================================================
  // LEAVE MANAGEMENT ENDPOINTS (TASK-PORTAL-024)
  // ============================================================================

  @Get('leave/balances')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get leave balances' })
  @ApiResponse({
    status: 200,
    description: 'Leave balances retrieved successfully',
    type: LeaveBalancesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getLeaveBalances(
    @CurrentStaff() session: StaffSessionInfo,
  ): LeaveBalancesResponseDto {
    this.logger.log(
      `Fetching leave balances for staff: ${session.staff.email}`,
    );

    const year = new Date().getFullYear();

    // Calculate pending days from mock requests
    const userRequests = this.mockLeaveRequests.get(session.staffId) || [];
    const pendingByType = userRequests
      .filter((r) => r.status === LeaveStatus.PENDING)
      .reduce(
        (acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + r.days;
          return acc;
        },
        {} as Record<string, number>,
      );

    return {
      balances: [
        {
          type: LeaveType.ANNUAL,
          name: 'Annual Leave',
          entitled: 15,
          used: 5,
          pending: pendingByType[LeaveType.ANNUAL] || 0,
          available: 15 - 5 - (pendingByType[LeaveType.ANNUAL] || 0),
          cyclePeriod: `Jan - Dec ${year}`,
          bceoInfo: '15 working days per year as per BCEA Section 20',
        },
        {
          type: LeaveType.SICK,
          name: 'Sick Leave',
          entitled: 30,
          used: 3,
          pending: pendingByType[LeaveType.SICK] || 0,
          available: 30 - 3 - (pendingByType[LeaveType.SICK] || 0),
          cyclePeriod: `${year - 2} - ${year}`,
          bceoInfo: '30 days per 3-year cycle as per BCEA Section 22',
        },
        {
          type: LeaveType.FAMILY,
          name: 'Family Responsibility Leave',
          entitled: 3,
          used: 1,
          pending: pendingByType[LeaveType.FAMILY] || 0,
          available: 3 - 1 - (pendingByType[LeaveType.FAMILY] || 0),
          cyclePeriod: `Jan - Dec ${year}`,
          bceoInfo:
            '3 days per year for family emergencies as per BCEA Section 27',
        },
      ],
      cycleStartDate: new Date(year, 0, 1),
      cycleEndDate: new Date(year, 11, 31),
      employmentStartDate: new Date('2023-03-15'),
    };
  }

  @Get('leave/requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get leave request history' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Leave requests retrieved successfully',
    type: LeaveRequestsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getLeaveRequests(
    @CurrentStaff() session: StaffSessionInfo,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): LeaveRequestsResponseDto {
    this.logger.log(
      `Fetching leave requests for staff: ${session.staff.email}`,
    );

    // Get or initialize user's leave requests
    let requests = this.mockLeaveRequests.get(session.staffId);
    if (!requests) {
      requests = this.generateMockLeaveRequests();
      this.mockLeaveRequests.set(session.staffId, requests);
    }

    // Filter by status if provided
    let filteredRequests = requests;
    if (status && status !== 'all') {
      filteredRequests = requests.filter(
        (r) => r.status === (status as LeaveStatus),
      );
    }

    // Sort by createdAt descending
    filteredRequests.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      data: filteredRequests,
      total: filteredRequests.length,
      page: parseInt(page || '1'),
      limit: parseInt(limit || '20'),
    };
  }

  @Post('leave/requests')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit new leave request' })
  @ApiBody({ type: CreateLeaveRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Leave request created successfully',
    type: LeaveRequestSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createLeaveRequest(
    @CurrentStaff() session: StaffSessionInfo,
    @Body() createDto: CreateLeaveRequestDto,
  ): LeaveRequestSuccessDto {
    this.logger.log(`Creating leave request for staff: ${session.staff.email}`);

    const startDate = new Date(createDto.startDate);
    const endDate = new Date(createDto.endDate);

    // Validate dates
    if (startDate > endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    if (startDate < new Date()) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Calculate working days (simple calculation - doesn't account for holidays)
    const days = this.calculateWorkingDays(startDate, endDate);

    // Get leave type display name
    const typeNames: Record<LeaveType, string> = {
      [LeaveType.ANNUAL]: 'Annual Leave',
      [LeaveType.SICK]: 'Sick Leave',
      [LeaveType.FAMILY]: 'Family Responsibility Leave',
      [LeaveType.UNPAID]: 'Unpaid Leave',
      [LeaveType.STUDY]: 'Study Leave',
      [LeaveType.MATERNITY]: 'Maternity Leave',
      [LeaveType.PATERNITY]: 'Paternity Leave',
    };

    const newRequest: LeaveRequestDto = {
      id: `lr-${Date.now()}`,
      type: createDto.type,
      typeName: typeNames[createDto.type] || createDto.type,
      startDate,
      endDate,
      days,
      status: LeaveStatus.PENDING,
      reason: createDto.reason,
      createdAt: new Date(),
    };

    // Store the request
    const userRequests = this.mockLeaveRequests.get(session.staffId) || [];
    userRequests.unshift(newRequest);
    this.mockLeaveRequests.set(session.staffId, userRequests);

    return {
      message: 'Leave request submitted successfully',
      request: newRequest,
    };
  }

  @Delete('leave/requests/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel pending leave request' })
  @ApiParam({ name: 'id', description: 'Leave request ID' })
  @ApiResponse({
    status: 200,
    description: 'Leave request cancelled successfully',
    type: LeaveRequestSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Request cannot be cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Leave request not found' })
  cancelLeaveRequest(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('id') id: string,
  ): LeaveRequestSuccessDto {
    this.logger.log(
      `Cancelling leave request ${id} for staff: ${session.staff.email}`,
    );

    const userRequests = this.mockLeaveRequests.get(session.staffId) || [];
    const requestIndex = userRequests.findIndex((r) => r.id === id);

    if (requestIndex === -1) {
      throw new NotFoundException('Leave request not found');
    }

    const request = userRequests[requestIndex];

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel a leave request with status: ${request.status}`,
      );
    }

    // Update status to cancelled
    request.status = LeaveStatus.CANCELLED;
    request.updatedAt = new Date();

    this.mockLeaveRequests.set(session.staffId, userRequests);

    return {
      message: 'Leave request cancelled successfully',
      request,
    };
  }

  // ============================================================================
  // LEAVE HELPER METHODS
  // ============================================================================

  private calculateWorkingDays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private generateMockLeaveRequests(): LeaveRequestDto[] {
    const today = new Date();

    return [
      {
        id: 'lr-001',
        type: LeaveType.ANNUAL,
        typeName: 'Annual Leave',
        startDate: new Date(today.getFullYear(), today.getMonth() + 1, 10),
        endDate: new Date(today.getFullYear(), today.getMonth() + 1, 12),
        days: 3,
        status: LeaveStatus.PENDING,
        reason: 'Family vacation',
        createdAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'lr-002',
        type: LeaveType.ANNUAL,
        typeName: 'Annual Leave',
        startDate: new Date(today.getFullYear(), today.getMonth() - 1, 15),
        endDate: new Date(today.getFullYear(), today.getMonth() - 1, 19),
        days: 5,
        status: LeaveStatus.APPROVED,
        reason: 'Personal time off',
        createdAt: new Date(today.getFullYear(), today.getMonth() - 1, 5),
        reviewerName: 'Sarah Manager',
        reviewerComments: 'Approved. Enjoy your break!',
        reviewedAt: new Date(today.getFullYear(), today.getMonth() - 1, 6),
      },
      {
        id: 'lr-003',
        type: LeaveType.SICK,
        typeName: 'Sick Leave',
        startDate: new Date(today.getFullYear(), today.getMonth() - 2, 8),
        endDate: new Date(today.getFullYear(), today.getMonth() - 2, 10),
        days: 3,
        status: LeaveStatus.APPROVED,
        reason: 'Flu',
        createdAt: new Date(today.getFullYear(), today.getMonth() - 2, 8),
        reviewerName: 'Sarah Manager',
        reviewedAt: new Date(today.getFullYear(), today.getMonth() - 2, 8),
      },
      {
        id: 'lr-004',
        type: LeaveType.FAMILY,
        typeName: 'Family Responsibility Leave',
        startDate: new Date(today.getFullYear(), today.getMonth() - 3, 20),
        endDate: new Date(today.getFullYear(), today.getMonth() - 3, 20),
        days: 1,
        status: LeaveStatus.APPROVED,
        reason: "Child's school event",
        createdAt: new Date(today.getFullYear(), today.getMonth() - 3, 18),
        reviewerName: 'Sarah Manager',
        reviewedAt: new Date(today.getFullYear(), today.getMonth() - 3, 18),
      },
      {
        id: 'lr-005',
        type: LeaveType.ANNUAL,
        typeName: 'Annual Leave',
        startDate: new Date(today.getFullYear(), today.getMonth() - 4, 1),
        endDate: new Date(today.getFullYear(), today.getMonth() - 4, 3),
        days: 3,
        status: LeaveStatus.REJECTED,
        reason: 'Weekend trip',
        createdAt: new Date(today.getFullYear(), today.getMonth() - 4, -10),
        reviewerName: 'Sarah Manager',
        reviewerComments:
          'Unfortunately this period is during our busiest time. Please consider alternative dates.',
        reviewedAt: new Date(today.getFullYear(), today.getMonth() - 4, -9),
      },
    ];
  }

  // ============================================================================
  // TAX DOCUMENTS (IRP5) ENDPOINTS (TASK-PORTAL-025)
  // ============================================================================

  @Get('documents/irp5')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get IRP5 tax certificates' })
  @ApiQuery({
    name: 'taxYear',
    required: false,
    description: 'Filter by tax year',
  })
  @ApiResponse({
    status: 200,
    description: 'IRP5 certificates retrieved successfully',
    type: IRP5ListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getIRP5Documents(
    @CurrentStaff() session: StaffSessionInfo,
    @Query('taxYear') taxYear?: string,
  ): IRP5ListResponseDto {
    this.logger.log(
      `Fetching IRP5 documents for staff: ${session.staff.email}, taxYear: ${taxYear || 'all'}`,
    );

    // IRP5 documents are not yet available via SimplePay integration.
    // They will be populated once SARS tax year processing is implemented.
    const currentYear = new Date().getFullYear();

    return {
      data: [],
      total: 0,
      availableYears: [currentYear, currentYear - 1],
    };
  }

  @Get('documents/irp5/:id/pdf')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download IRP5 PDF' })
  @ApiParam({ name: 'id', description: 'IRP5 document ID' })
  @Header('Content-Type', 'application/pdf')
  @ApiResponse({
    status: 200,
    description: 'IRP5 PDF downloaded successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'IRP5 document not found' })
  downloadIRP5Pdf(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('id') id: string,
  ): void {
    this.logger.log(
      `Downloading IRP5 PDF for staff: ${session.staff.email}, id: ${id}`,
    );

    // IRP5 PDFs are not yet available via SimplePay integration
    throw new NotFoundException(
      'IRP5 documents are not yet available. They will be available after tax year processing.',
    );
  }

  // ============================================================================
  // STAFF PROFILE ENDPOINTS (TASK-PORTAL-025)
  // ============================================================================

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff profile' })
  @ApiResponse({
    status: 200,
    description: 'Staff profile retrieved successfully',
    type: StaffProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(
    @CurrentStaff() session: StaffSessionInfo,
  ): Promise<StaffProfileDto> {
    this.logger.log(`Fetching profile for staff: ${session.staff.email}`);

    const staff = await this.prisma.staff.findUnique({
      where: { id: session.staffId },
    });

    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }

    return {
      personal: {
        fullName: `${staff.firstName} ${staff.lastName}`,
        idNumber: staff.idNumber ? `******${staff.idNumber.slice(-4)}` : '',
        dateOfBirth: staff.dateOfBirth,
        phone: staff.phone || '',
        email: staff.email || '',
        address:
          [
            staff.address,
            staff.suburb,
            staff.city,
            staff.province,
            staff.postalCode,
          ]
            .filter(Boolean)
            .join(', ') || '',
      },
      employment: {
        position: staff.position || 'Staff Member',
        department: staff.department || '',
        startDate: staff.startDate,
        employmentType: staff.employmentType || 'PERMANENT',
        employeeNumber: staff.employeeNumber || '',
      },
      banking: {
        bankName: staff.bankName || '',
        accountNumber: staff.bankAccount
          ? `****${staff.bankAccount.slice(-4)}`
          : '',
        branchCode: staff.bankBranchCode || '',
        accountType: staff.bankAccountType || '',
        updateNote:
          'To update your banking details, please use the onboarding section or contact HR.',
      },
      emergency: {
        contactName: staff.emergencyContactName || '',
        relationship: staff.emergencyContactRelation || '',
        contactPhone: staff.emergencyContactPhone || '',
      },
      preferences: {
        emailPayslipNotifications: true,
        emailLeaveNotifications: true,
        emailTaxDocNotifications: true,
        preferredLanguage: 'en-ZA',
      },
      lastUpdated: staff.updatedAt,
    };
  }

  @Put('profile')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update staff profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: ProfileUpdateSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentStaff() session: StaffSessionInfo,
    @Body() updateDto: UpdateProfileDto,
  ): Promise<ProfileUpdateSuccessDto> {
    this.logger.log(`Updating profile for staff: ${session.staff.email}`);

    const updateData: Record<string, unknown> = {};

    if (updateDto.phone) {
      updateData.phone = updateDto.phone;
    }
    if (updateDto.email) {
      updateData.email = updateDto.email;
    }
    if (updateDto.address) {
      const addr = updateDto.address;
      if (addr.streetAddress) updateData.address = addr.streetAddress;
      if (addr.suburb) updateData.suburb = addr.suburb;
      if (addr.city) updateData.city = addr.city;
      if (addr.province) updateData.province = addr.province;
      if (addr.postalCode) updateData.postalCode = addr.postalCode;
    }
    if (updateDto.emergency) {
      if (updateDto.emergency.contactName)
        updateData.emergencyContactName = updateDto.emergency.contactName;
      if (updateDto.emergency.relationship)
        updateData.emergencyContactRelation = updateDto.emergency.relationship;
      if (updateDto.emergency.contactPhone)
        updateData.emergencyContactPhone = updateDto.emergency.contactPhone;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.staff.update({
        where: { id: session.staffId },
        data: updateData,
      });
    }

    // Return updated profile
    const profile = await this.getProfile(session);

    return {
      message: 'Profile updated successfully',
      profile,
    };
  }

  @Get('banking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get banking details (masked)' })
  @ApiResponse({
    status: 200,
    description: 'Banking details retrieved successfully',
    type: BankingDetailsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBankingDetails(
    @CurrentStaff() session: StaffSessionInfo,
  ): Promise<BankingDetailsDto> {
    this.logger.log(
      `Fetching banking details for staff: ${session.staff.email}`,
    );

    const staff = await this.prisma.staff.findUnique({
      where: { id: session.staffId },
      select: {
        bankName: true,
        bankAccount: true,
        bankBranchCode: true,
        bankAccountType: true,
      },
    });

    return {
      bankName: staff?.bankName || '',
      accountNumber: staff?.bankAccount
        ? `****${staff.bankAccount.slice(-4)}`
        : '',
      branchCode: staff?.bankBranchCode || '',
      accountType: staff?.bankAccountType || '',
      updateNote:
        'To update your banking details, please use the onboarding section or contact HR.',
    };
  }

  // ============================================================================
  // STAFF SELF-ONBOARDING ENDPOINTS
  // ============================================================================

  @Get('onboarding')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff onboarding status and progress' })
  @ApiResponse({
    status: 200,
    description: 'Onboarding status retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnboardingStatus(@CurrentStaff() session: StaffSessionInfo) {
    this.logger.log(`Fetching onboarding status for staff: ${session.staffId}`);

    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      session.staffId,
    );

    if (!onboarding) {
      // No onboarding initiated - return NOT_STARTED status
      return {
        status: 'NOT_STARTED',
        currentStep: 'PERSONAL_INFO',
        percentComplete: 0,
        completedSteps: [],
        pendingSteps: [
          'PERSONAL_INFO',
          'EMPLOYMENT',
          'TAX_INFO',
          'BANKING',
          'DOCUMENTS',
          'SIGNATURES',
        ],
        requiredActions: [],
      };
    }

    // Get generated documents for signatures step
    const generatedDocs = await this.onboardingService.getGeneratedDocuments(
      session.staffId,
    );

    // Map checklist items to required actions for UI
    const requiredActions = onboarding.checklistItems.map((item) => ({
      id: item.itemKey.toLowerCase(),
      title: item.title,
      description: item.description || '',
      category: item.category,
      isRequired: item.isRequired,
      isComplete: item.status === 'COMPLETED',
    }));

    // Add signature items from generated documents
    if (generatedDocs.documents.length > 0) {
      for (const doc of generatedDocs.documents) {
        const existingAction = requiredActions.find(
          (a) =>
            a.id ===
            (doc.documentType === 'EMPLOYMENT_CONTRACT'
              ? 'employment_contract'
              : 'popia_consent'),
        );
        if (!existingAction) {
          requiredActions.push({
            id:
              doc.documentType === 'EMPLOYMENT_CONTRACT'
                ? 'employment_contract'
                : 'popia_consent',
            title:
              doc.documentType === 'EMPLOYMENT_CONTRACT'
                ? 'Sign Employment Contract'
                : 'Sign POPIA Consent',
            description:
              doc.documentType === 'EMPLOYMENT_CONTRACT'
                ? 'Review and sign your employment contract'
                : 'Consent to processing of personal information',
            category: 'signatures',
            isRequired: true,
            isComplete: doc.acknowledged,
          });
        }
      }
    }

    // Calculate completed/pending steps based on categories
    const categoryStatus = onboarding.progress.byCategory;
    const stepMapping: Record<string, string> = {
      personal_info: 'PERSONAL_INFO',
      employment: 'EMPLOYMENT',
      tax_info: 'TAX_INFO',
      banking: 'BANKING',
      documents: 'DOCUMENTS',
      dsd_compliance: 'DOCUMENTS',
      signatures: 'SIGNATURES',
    };

    const completedSteps: string[] = [];
    const pendingSteps: string[] = [];

    for (const [category, status] of Object.entries(categoryStatus)) {
      const step = stepMapping[category];
      if (step && status.percentComplete === 100) {
        if (!completedSteps.includes(step)) {
          completedSteps.push(step);
        }
      } else if (step && !pendingSteps.includes(step)) {
        pendingSteps.push(step);
      }
    }

    // Calculate overall status
    let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS';
    if (onboarding.onboarding.status === 'COMPLETED') {
      status = 'COMPLETED';
    } else if (onboarding.progress.percentComplete === 0) {
      status = 'NOT_STARTED';
    }

    return {
      status,
      currentStep: onboarding.onboarding.currentStep || 'PERSONAL_INFO',
      percentComplete: onboarding.progress.percentComplete,
      completedSteps,
      pendingSteps,
      requiredActions,
      generatedDocuments: generatedDocs.documents,
    };
  }

  @Patch('onboarding/tax')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tax information' })
  @ApiResponse({
    status: 200,
    description: 'Tax information updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateTaxInfo(
    @CurrentStaff() session: StaffSessionInfo,
    @Body() body: { taxNumber?: string; taxStatus?: string },
  ) {
    this.logger.log(`Updating tax info for staff: ${session.staffId}`);

    // Update staff record directly
    await this.prisma.staff.update({
      where: { id: session.staffId },
      data: {
        taxNumber: body.taxNumber,
        taxStatus: body.taxStatus,
      },
    });

    // Update onboarding step if exists
    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      session.staffId,
    );
    if (onboarding) {
      await this.onboardingService.updateOnboardingStep(
        session.staffId,
        {
          step: 'TAX_INFO' as OnboardingStep,
          data: body,
        },
        session.staffId,
        session.tenantId || '',
      );
    }

    return {
      success: true,
      message: 'Tax information updated successfully',
    };
  }

  @Patch('onboarding/banking')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update banking details' })
  @ApiResponse({
    status: 200,
    description: 'Banking details updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateBankingDetails(
    @CurrentStaff() session: StaffSessionInfo,
    @Body()
    body: {
      bankName?: string;
      bankAccount?: string;
      bankBranchCode?: string;
      bankAccountType?: string;
    },
  ) {
    this.logger.log(`Updating banking details for staff: ${session.staffId}`);

    // Update staff record directly
    await this.prisma.staff.update({
      where: { id: session.staffId },
      data: {
        bankName: body.bankName,
        bankAccount: body.bankAccount,
        bankBranchCode: body.bankBranchCode,
        bankAccountType: body.bankAccountType,
      },
    });

    // Update onboarding step if exists
    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      session.staffId,
    );
    if (onboarding) {
      await this.onboardingService.updateOnboardingStep(
        session.staffId,
        {
          step: 'BANKING' as OnboardingStep,
          data: body,
        },
        session.staffId,
        session.tenantId || '',
      );
    }

    return {
      success: true,
      message: 'Banking details updated successfully',
    };
  }

  @Get('onboarding/documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get uploaded documents for onboarding' })
  @ApiResponse({
    status: 200,
    description: 'Documents retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnboardingDocuments(@CurrentStaff() session: StaffSessionInfo) {
    this.logger.log(
      `Fetching onboarding documents for staff: ${session.staffId}`,
    );

    const documents = await this.documentService.getDocumentsByStaff(
      session.staffId,
    );

    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        status: doc.status,
        uploadedAt: doc.uploadedAt,
        expiryDate: doc.expiryDate,
      })),
    };
  }

  @Post('onboarding/documents')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const session = (
            req as unknown as { staffSession?: StaffSessionInfo }
          ).staffSession;
          const staffId = session?.staffId;
          const tenantId = session?.tenantId;
          const uploadPath = path.join(
            process.cwd(),
            'uploads',
            'staff-documents',
            tenantId || 'default',
            staffId || 'unknown',
          );
          fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const timestamp = Date.now();
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          cb(null, `${baseName}_${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid file type'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a document for onboarding' })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid file or document type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadOnboardingDocument(
    @CurrentStaff() session: StaffSessionInfo,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!documentType) {
      throw new BadRequestException('Document type is required');
    }

    this.logger.log(
      `Uploading document ${file.originalname} (${documentType}) for staff ${session.staffId}`,
    );

    const document = await this.documentService.uploadDocument(
      session.tenantId || '',
      {
        staffId: session.staffId,
        documentType: documentType as DocumentType,
        fileName: file.originalname,
        fileUrl: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      session.staffId,
    );

    return {
      success: true,
      message: 'Document uploaded successfully',
      data: {
        id: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        status: document.status,
      },
    };
  }

  @Get('onboarding/generated-documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get generated documents requiring signature' })
  @ApiResponse({
    status: 200,
    description: 'Generated documents retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGeneratedDocuments(@CurrentStaff() session: StaffSessionInfo) {
    this.logger.log(
      `Fetching generated documents for staff: ${session.staffId}`,
    );

    const result = await this.onboardingService.getGeneratedDocuments(
      session.staffId,
    );

    return {
      documents: result.documents,
      allDocumentsSigned: result.allDocumentsSigned,
      pendingSignatures: result.pendingSignatures,
    };
  }

  @Post('onboarding/signatures/:documentId/sign')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a generated document' })
  @ApiParam({ name: 'documentId', description: 'Generated document ID' })
  @ApiResponse({
    status: 200,
    description: 'Document signed successfully',
  })
  @ApiResponse({ status: 400, description: 'Document already signed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async signDocument(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('documentId') documentId: string,
    @Body() body: { signedByName: string },
    @Req() req: Request,
  ) {
    this.logger.log(
      `Signing document ${documentId} by staff ${session.staffId}`,
    );

    // Get client IP
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown';

    const dto: SignDocumentDto = {
      documentId,
      signedByName: body.signedByName,
      signedByIp: clientIp,
    };

    const document = await this.onboardingService.signDocument(dto, clientIp);

    return {
      success: true,
      message: 'Document signed successfully',
      data: document,
    };
  }

  @Get('onboarding/generated-documents/:documentId/download')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download a generated document PDF' })
  @ApiParam({ name: 'documentId', description: 'Generated document ID' })
  @ApiResponse({
    status: 200,
    description: 'PDF file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async downloadGeneratedDocument(
    @CurrentStaff() session: StaffSessionInfo,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Downloading generated document ${documentId} for staff ${session.staffId}`,
    );

    const document =
      await this.onboardingService.getGeneratedDocumentById(documentId);

    if (!fs.existsSync(document.filePath)) {
      throw new NotFoundException('Document file not found');
    }

    const fileBuffer = fs.readFileSync(document.filePath);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName}"`,
    );
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);
  }
}
