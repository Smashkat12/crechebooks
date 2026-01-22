import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffDashboardResponseDto } from './dto/staff-dashboard.dto';

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
}
