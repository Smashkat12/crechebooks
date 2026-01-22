import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Logger,
  Res,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
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
  async getDashboard(
    @CurrentUser() user: UserPayload,
  ): Promise<StaffDashboardResponseDto> {
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
  async getPayslips(
    @CurrentUser() user: UserPayload,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PayslipsResponseDto> {
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
  async getPayslipDetail(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ): Promise<PayslipDetailDto> {
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
  async downloadPayslipPdf(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
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
  async getLeaveBalances(
    @CurrentUser() user: UserPayload,
  ): Promise<LeaveBalancesResponseDto> {
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
  async getLeaveRequests(
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<LeaveRequestsResponseDto> {
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
      filteredRequests = requests.filter((r) => r.status === status);
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
  async createLeaveRequest(
    @CurrentUser() user: UserPayload,
    @Body() createDto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestSuccessDto> {
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
  async cancelLeaveRequest(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ): Promise<LeaveRequestSuccessDto> {
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
}
