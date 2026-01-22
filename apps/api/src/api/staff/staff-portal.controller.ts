import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
  Res,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
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
    this.logger.log(`Fetching payslips for staff: ${user.email}, year: ${year || 'current'}`);

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
    this.logger.log(`Fetching payslip detail for staff: ${user.email}, id: ${id}`);

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
    this.logger.log(`Downloading payslip PDF for staff: ${user.email}, id: ${id}`);

    // Return mock PDF for now - will integrate with SimplePay later
    res.set({
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
      'Content-Type': 'application/pdf',
    });

    // Create a simple mock PDF (in production, this would come from SimplePay)
    const mockPdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000101 00000 n trailer<</Size 4/Root 1 0 R>>startxref 178 %%EOF',
      'utf-8'
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
}
