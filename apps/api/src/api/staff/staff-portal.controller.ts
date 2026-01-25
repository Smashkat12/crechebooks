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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffDashboardResponseDto } from './dto/staff-dashboard.dto';
import {
  PayslipsResponseDto,
  PayslipDetailDto,
  PayslipSummaryDto,
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
  IRP5DocumentDto,
  IRP5ListResponseDto,
  IRP5Status,
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

interface UserPayload {
  sub: string;
  email: string;
  name?: string;
  tenantId?: string;
}

@ApiTags('Staff Portal')
@Controller('staff-portal')
export class StaffPortalController {
  private readonly logger = new Logger(StaffPortalController.name);

  // In-memory store for mock leave requests (will be replaced with DB)
  private mockLeaveRequests: Map<string, LeaveRequestDto[]> = new Map();

  constructor(
    private readonly onboardingService: StaffOnboardingService,
    private readonly documentService: StaffDocumentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Staff dashboard data retrieved successfully',
    type: StaffDashboardResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getDashboard(@CurrentUser() user: UserPayload): StaffDashboardResponseDto {
    this.logger.log(`Fetching dashboard for staff: ${user.email}`);

    // Mock data for now - will integrate with SimplePay later
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 25);

    return {
      employmentStatus: {
        position: 'Early Childhood Development Practitioner',
        department: 'Education',
        startDate: new Date('2023-03-15'),
        status: 'active',
        employeeNumber: 'EMP-001',
      },
      recentPayslips: [
        {
          id: 'ps-001',
          payDate: new Date(today.getFullYear(), today.getMonth(), 25),
          period: `${today.toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
          grossPay: 18500,
          netPay: 15234.56,
        },
        {
          id: 'ps-002',
          payDate: new Date(today.getFullYear(), today.getMonth() - 1, 25),
          period: `${new Date(today.getFullYear(), today.getMonth() - 1).toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
          grossPay: 18500,
          netPay: 15234.56,
        },
        {
          id: 'ps-003',
          payDate: new Date(today.getFullYear(), today.getMonth() - 2, 25),
          period: `${new Date(today.getFullYear(), today.getMonth() - 2).toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
          grossPay: 18500,
          netPay: 15234.56,
        },
      ],
      leaveBalance: {
        annual: 15,
        annualUsed: 5,
        sick: 10,
        sickUsed: 2,
        family: 3,
        familyUsed: 0,
      },
      nextPayDate: nextMonth,
      ytdEarnings: {
        grossEarnings: 111000,
        netEarnings: 91407.36,
        totalTax: 14850,
        totalDeductions: 4742.64,
      },
      announcements: [
        {
          id: 'ann-001',
          title: 'School Closure - Public Holiday',
          content:
            'The school will be closed on Monday for the public holiday. Normal operations resume on Tuesday.',
          createdAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
          priority: 'high',
        },
        {
          id: 'ann-002',
          title: 'Staff Meeting Reminder',
          content: 'Monthly staff meeting this Friday at 2pm in the main hall.',
          createdAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
          priority: 'medium',
        },
      ],
    };
  }

  @Get('payslips')
  @UseGuards(JwtAuthGuard)
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
  getPayslips(
    @CurrentUser() user: UserPayload,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): PayslipsResponseDto {
    this.logger.log(
      `Fetching payslips for staff: ${user.email}, year: ${year || 'current'}`,
    );

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const mockPayslips = this.generateMockPayslips(currentYear);
    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '12');

    return {
      data: mockPayslips,
      meta: {
        total: mockPayslips.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(mockPayslips.length / limitNum),
      },
    };
  }

  @Get('payslips/:id')
  @UseGuards(JwtAuthGuard)
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
  getPayslipDetail(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ): PayslipDetailDto {
    this.logger.log(
      `Fetching payslip detail for staff: ${user.email}, id: ${id}`,
    );

    return this.generateMockPayslipDetail(id);
  }

  @Get('payslips/:id/pdf')
  @UseGuards(JwtAuthGuard)
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
  downloadPayslipPdf(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): void {
    this.logger.log(
      `Downloading payslip PDF for staff: ${user.email}, id: ${id}`,
    );

    // Return mock PDF for now - will integrate with SimplePay later
    res.set({
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
      'Content-Type': 'application/pdf',
    });

    // Create a simple mock PDF (in production, this would come from SimplePay)
    const mockPdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000101 00000 n trailer<</Size 4/Root 1 0 R>>startxref 178 %%EOF',
      'utf-8',
    );

    res.send(mockPdfContent);
  }

  private generateMockPayslips(year: number): PayslipSummaryDto[] {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const months = year === currentYear ? currentMonth + 1 : 12;

    return Array.from({ length: months }, (_, i) => ({
      id: `ps-${year}-${String(i + 1).padStart(2, '0')}`,
      payDate: new Date(year, i, 25),
      period: new Date(year, i).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
      periodStart: new Date(year, i, 1),
      periodEnd: new Date(year, i + 1, 0),
      grossPay: 18500,
      netPay: 15234.56,
      totalDeductions: 3265.44,
      status: 'paid' as const,
    })).reverse();
  }

  private generateMockPayslipDetail(id: string): PayslipDetailDto {
    const parts = id.split('-');
    const year = parseInt(parts[1]) || new Date().getFullYear();
    const month = parseInt(parts[2]) - 1 || new Date().getMonth();

    return {
      id,
      payDate: new Date(year, month, 25),
      period: new Date(year, month).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
      periodStart: new Date(year, month, 1),
      periodEnd: new Date(year, month + 1, 0),
      grossPay: 18500,
      netPay: 15234.56,
      totalDeductions: 3265.44,
      status: 'paid',
      earnings: [
        { name: 'Basic Salary', amount: 17000 },
        { name: 'Housing Allowance', amount: 1000 },
        { name: 'Transport Allowance', amount: 500 },
      ],
      deductions: [
        { name: 'PAYE Tax', amount: 2475, type: 'tax' },
        { name: 'UIF (Employee)', amount: 148.5, type: 'uif' },
        { name: 'Pension Fund', amount: 555, type: 'pension' },
        { name: 'Medical Aid', amount: 86.94, type: 'medical' },
      ],
      employerContributions: [
        { name: 'UIF (Employer)', amount: 148.5 },
        { name: 'SDL', amount: 185 },
        { name: 'Pension (Employer)', amount: 555 },
      ],
      totalEarnings: 18500,
      totalTax: 2475,
      totalEmployerContributions: 888.5,
      paymentMethod: 'Bank Transfer',
      bankAccount: '****4521',
    };
  }

  // ============================================================================
  // LEAVE MANAGEMENT ENDPOINTS (TASK-PORTAL-024)
  // ============================================================================

  @Get('leave/balances')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get leave balances' })
  @ApiResponse({
    status: 200,
    description: 'Leave balances retrieved successfully',
    type: LeaveBalancesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getLeaveBalances(@CurrentUser() user: UserPayload): LeaveBalancesResponseDto {
    this.logger.log(`Fetching leave balances for staff: ${user.email}`);

    const year = new Date().getFullYear();

    // Calculate pending days from mock requests
    const userRequests = this.mockLeaveRequests.get(user.sub) || [];
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
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): LeaveRequestsResponseDto {
    this.logger.log(`Fetching leave requests for staff: ${user.email}`);

    // Get or initialize user's leave requests
    let requests = this.mockLeaveRequests.get(user.sub);
    if (!requests) {
      requests = this.generateMockLeaveRequests();
      this.mockLeaveRequests.set(user.sub, requests);
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
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Body() createDto: CreateLeaveRequestDto,
  ): LeaveRequestSuccessDto {
    this.logger.log(`Creating leave request for staff: ${user.email}`);

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
    const userRequests = this.mockLeaveRequests.get(user.sub) || [];
    userRequests.unshift(newRequest);
    this.mockLeaveRequests.set(user.sub, userRequests);

    return {
      message: 'Leave request submitted successfully',
      request: newRequest,
    };
  }

  @Delete('leave/requests/:id')
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ): LeaveRequestSuccessDto {
    this.logger.log(`Cancelling leave request ${id} for staff: ${user.email}`);

    const userRequests = this.mockLeaveRequests.get(user.sub) || [];
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

    this.mockLeaveRequests.set(user.sub, userRequests);

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
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Query('taxYear') taxYear?: string,
  ): IRP5ListResponseDto {
    this.logger.log(
      `Fetching IRP5 documents for staff: ${user.email}, taxYear: ${taxYear || 'all'}`,
    );

    const currentYear = new Date().getFullYear();
    const availableYears = [
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear - 3,
      currentYear - 4,
    ];

    // Generate mock IRP5 documents
    let documents = this.generateMockIRP5Documents(availableYears);

    // Filter by tax year if provided
    if (taxYear) {
      const year = parseInt(taxYear);
      documents = documents.filter((doc) => doc.taxYear === year);
    }

    return {
      data: documents,
      total: documents.length,
      availableYears,
    };
  }

  @Get('documents/irp5/:id/pdf')
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): void {
    this.logger.log(`Downloading IRP5 PDF for staff: ${user.email}, id: ${id}`);

    // Extract tax year from ID (e.g., irp5-2024-001 -> 2024)
    const parts = id.split('-');
    const taxYear =
      parts.length >= 2 ? parts[1] : new Date().getFullYear().toString();

    res.set({
      'Content-Disposition': `attachment; filename="IRP5-${taxYear}.pdf"`,
      'Content-Type': 'application/pdf',
    });

    // Create a mock PDF (in production, this would come from SimplePay)
    const mockPdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000101 00000 n trailer<</Size 4/Root 1 0 R>>startxref 178 %%EOF',
      'utf-8',
    );

    res.send(mockPdfContent);
  }

  private generateMockIRP5Documents(years: number[]): IRP5DocumentDto[] {
    const currentYear = new Date().getFullYear();

    return years.map((year, index) => ({
      id: `irp5-${year}-001`,
      taxYear: year,
      taxYearPeriod: `${year - 1}/${year}`,
      status: year === currentYear ? IRP5Status.PENDING : IRP5Status.AVAILABLE,
      availableDate: new Date(year, 2, 1), // March 1st of tax year
      referenceNumber:
        year !== currentYear
          ? `IRP5/${year}/${100000 + index * 12345}`
          : undefined,
      lastDownloadDate:
        index > 0 && index < 3 ? new Date(year, 3 + index, 15) : undefined,
    }));
  }

  // ============================================================================
  // STAFF PROFILE ENDPOINTS (TASK-PORTAL-025)
  // ============================================================================

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff profile' })
  @ApiResponse({
    status: 200,
    description: 'Staff profile retrieved successfully',
    type: StaffProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@CurrentUser() user: UserPayload): StaffProfileDto {
    this.logger.log(`Fetching profile for staff: ${user.email}`);

    return this.generateMockProfile(user);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
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
  updateProfile(
    @CurrentUser() user: UserPayload,
    @Body() updateDto: UpdateProfileDto,
  ): ProfileUpdateSuccessDto {
    this.logger.log(`Updating profile for staff: ${user.email}`);

    // In production, this would update the database
    const profile = this.generateMockProfile(user);

    // Apply updates
    if (updateDto.phone) {
      profile.personal.phone = updateDto.phone;
    }
    if (updateDto.email) {
      profile.personal.email = updateDto.email;
    }
    if (updateDto.address) {
      const addr = updateDto.address;
      profile.personal.address = [
        addr.streetAddress,
        addr.streetAddress2,
        addr.suburb,
        addr.city,
        addr.province,
        addr.postalCode,
      ]
        .filter(Boolean)
        .join(', ');
    }
    if (updateDto.emergency) {
      profile.emergency = {
        contactName: updateDto.emergency.contactName,
        relationship: updateDto.emergency.relationship,
        contactPhone: updateDto.emergency.contactPhone,
        alternatePhone: updateDto.emergency.alternatePhone,
      };
    }

    profile.lastUpdated = new Date();

    return {
      message: 'Profile updated successfully',
      profile,
    };
  }

  @Get('banking')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get banking details (masked)' })
  @ApiResponse({
    status: 200,
    description: 'Banking details retrieved successfully',
    type: BankingDetailsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getBankingDetails(@CurrentUser() user: UserPayload): BankingDetailsDto {
    this.logger.log(`Fetching banking details for staff: ${user.email}`);

    return {
      bankName: 'First National Bank',
      accountNumber: '****4521',
      branchCode: '250655',
      accountType: 'Cheque Account',
      updateNote:
        'To update your banking details, please contact HR directly. Changes require verification for your protection.',
    };
  }

  // ============================================================================
  // STAFF SELF-ONBOARDING ENDPOINTS
  // ============================================================================

  @Get('onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get staff onboarding status and progress' })
  @ApiResponse({
    status: 200,
    description: 'Onboarding status retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnboardingStatus(@CurrentUser() user: UserPayload) {
    this.logger.log(`Fetching onboarding status for staff: ${user.sub}`);

    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      user.sub,
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
      user.sub,
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tax information' })
  @ApiResponse({
    status: 200,
    description: 'Tax information updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateTaxInfo(
    @CurrentUser() user: UserPayload,
    @Body() body: { taxNumber?: string; taxStatus?: string },
  ) {
    this.logger.log(`Updating tax info for staff: ${user.sub}`);

    // Update staff record directly
    await this.prisma.staff.update({
      where: { id: user.sub },
      data: {
        taxNumber: body.taxNumber,
        taxStatus: body.taxStatus,
      },
    });

    // Update onboarding step if exists
    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      user.sub,
    );
    if (onboarding) {
      await this.onboardingService.updateOnboardingStep(
        user.sub,
        {
          step: 'TAX_INFO' as OnboardingStep,
          data: body,
        },
        user.sub,
        user.tenantId || '',
      );
    }

    return {
      success: true,
      message: 'Tax information updated successfully',
    };
  }

  @Patch('onboarding/banking')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update banking details' })
  @ApiResponse({
    status: 200,
    description: 'Banking details updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateBankingDetails(
    @CurrentUser() user: UserPayload,
    @Body()
    body: {
      bankName?: string;
      bankAccount?: string;
      bankBranchCode?: string;
      bankAccountType?: string;
    },
  ) {
    this.logger.log(`Updating banking details for staff: ${user.sub}`);

    // Update staff record directly
    await this.prisma.staff.update({
      where: { id: user.sub },
      data: {
        bankName: body.bankName,
        bankAccount: body.bankAccount,
        bankBranchCode: body.bankBranchCode,
        bankAccountType: body.bankAccountType,
      },
    });

    // Update onboarding step if exists
    const onboarding = await this.onboardingService.getOnboardingByStaffId(
      user.sub,
    );
    if (onboarding) {
      await this.onboardingService.updateOnboardingStep(
        user.sub,
        {
          step: 'BANKING' as OnboardingStep,
          data: body,
        },
        user.sub,
        user.tenantId || '',
      );
    }

    return {
      success: true,
      message: 'Banking details updated successfully',
    };
  }

  @Get('onboarding/documents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get uploaded documents for onboarding' })
  @ApiResponse({
    status: 200,
    description: 'Documents retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnboardingDocuments(@CurrentUser() user: UserPayload) {
    this.logger.log(`Fetching onboarding documents for staff: ${user.sub}`);

    const documents = await this.documentService.getDocumentsByStaff(user.sub);

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const staffId = (req as unknown as { user?: UserPayload }).user?.sub;
          const tenantId = (req as unknown as { user?: UserPayload }).user
            ?.tenantId;
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
    @CurrentUser() user: UserPayload,
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
      `Uploading document ${file.originalname} (${documentType}) for staff ${user.sub}`,
    );

    const document = await this.documentService.uploadDocument(
      user.tenantId || '',
      {
        staffId: user.sub,
        documentType: documentType as DocumentType,
        fileName: file.originalname,
        fileUrl: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      user.sub,
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get generated documents requiring signature' })
  @ApiResponse({
    status: 200,
    description: 'Generated documents retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGeneratedDocuments(@CurrentUser() user: UserPayload) {
    this.logger.log(`Fetching generated documents for staff: ${user.sub}`);

    const result = await this.onboardingService.getGeneratedDocuments(user.sub);

    return {
      documents: result.documents,
      allDocumentsSigned: result.allDocumentsSigned,
      pendingSignatures: result.pendingSignatures,
    };
  }

  @Post('onboarding/signatures/:documentId/sign')
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Param('documentId') documentId: string,
    @Body() body: { signedByName: string },
    @Req() req: Request,
  ) {
    this.logger.log(`Signing document ${documentId} by staff ${user.sub}`);

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
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: UserPayload,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Downloading generated document ${documentId} for staff ${user.sub}`,
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

  private generateMockProfile(user: UserPayload): StaffProfileDto {
    return {
      personal: {
        fullName: user.name || 'Thandi Nkosi',
        idNumber: '******1234085',
        dateOfBirth: new Date(1990, 4, 15),
        phone: '+27 82 123 4567',
        email: user.email,
        address: '123 Main Street, Sandton, Johannesburg, Gauteng, 2196',
      },
      employment: {
        position: 'Early Childhood Development Practitioner',
        department: 'Education',
        startDate: new Date(2023, 2, 15),
        employmentType: 'Full-time',
        employeeNumber: 'EMP-001',
        managerName: 'Sarah Manager',
      },
      banking: {
        bankName: 'First National Bank',
        accountNumber: '****4521',
        branchCode: '250655',
        accountType: 'Cheque Account',
        updateNote:
          'To update your banking details, please contact HR directly. Changes require verification for your protection.',
      },
      emergency: {
        contactName: 'Sipho Nkosi',
        relationship: 'Spouse',
        contactPhone: '+27 83 987 6543',
        alternatePhone: '+27 11 123 4567',
      },
      preferences: {
        emailPayslipNotifications: true,
        emailLeaveNotifications: true,
        emailTaxDocNotifications: true,
        preferredLanguage: 'en-ZA',
      },
      lastUpdated: new Date(),
    };
  }
}
