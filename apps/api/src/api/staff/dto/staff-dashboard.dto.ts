import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmploymentStatusDto {
  @ApiProperty({ description: 'Job title/position' })
  position: string;

  @ApiPropertyOptional({ description: 'Department name' })
  department?: string;

  @ApiProperty({ description: 'Employment start date' })
  startDate: Date;

  @ApiProperty({
    description: 'Employment status',
    enum: ['active', 'probation', 'terminated'],
  })
  status: 'active' | 'probation' | 'terminated';

  @ApiPropertyOptional({ description: 'Employee number/ID' })
  employeeNumber?: string;
}

export class PayslipPreviewDto {
  @ApiProperty({ description: 'Payslip unique identifier' })
  id: string;

  @ApiProperty({ description: 'Date payment was made' })
  payDate: Date;

  @ApiProperty({ description: 'Pay period description (e.g., "January 2024")' })
  period: string;

  @ApiProperty({ description: 'Gross pay amount in ZAR' })
  grossPay: number;

  @ApiProperty({ description: 'Net pay amount in ZAR' })
  netPay: number;
}

export class LeaveBalanceDto {
  @ApiProperty({ description: 'Total annual leave days' })
  annual: number;

  @ApiProperty({ description: 'Annual leave days used' })
  annualUsed: number;

  @ApiProperty({ description: 'Total sick leave days' })
  sick: number;

  @ApiProperty({ description: 'Sick leave days used' })
  sickUsed: number;

  @ApiProperty({ description: 'Total family responsibility leave days' })
  family: number;

  @ApiProperty({ description: 'Family responsibility leave days used' })
  familyUsed: number;
}

export class YtdEarningsDto {
  @ApiProperty({ description: 'Year-to-date gross earnings in ZAR' })
  grossEarnings: number;

  @ApiProperty({ description: 'Year-to-date net earnings in ZAR' })
  netEarnings: number;

  @ApiProperty({ description: 'Year-to-date total tax (PAYE) in ZAR' })
  totalTax: number;

  @ApiProperty({ description: 'Year-to-date total deductions in ZAR' })
  totalDeductions: number;
}

export class AnnouncementDto {
  @ApiProperty({ description: 'Announcement unique identifier' })
  id: string;

  @ApiProperty({ description: 'Announcement title' })
  title: string;

  @ApiProperty({ description: 'Announcement content/body' })
  content: string;

  @ApiProperty({ description: 'When the announcement was created' })
  createdAt: Date;

  @ApiProperty({
    description: 'Announcement priority level',
    enum: ['low', 'medium', 'high'],
  })
  priority: 'low' | 'medium' | 'high';
}

export class StaffDashboardResponseDto {
  @ApiProperty({
    type: EmploymentStatusDto,
    description: 'Current employment status information',
  })
  employmentStatus: EmploymentStatusDto;

  @ApiProperty({
    type: [PayslipPreviewDto],
    description: 'Recent payslip previews (last 3)',
  })
  recentPayslips: PayslipPreviewDto[];

  @ApiProperty({
    type: LeaveBalanceDto,
    description: 'Current leave balance information',
  })
  leaveBalance: LeaveBalanceDto;

  @ApiProperty({ description: 'Next scheduled pay date' })
  nextPayDate: Date;

  @ApiProperty({
    type: YtdEarningsDto,
    description: 'Year-to-date earnings summary',
  })
  ytdEarnings: YtdEarningsDto;

  @ApiProperty({
    type: [AnnouncementDto],
    description: 'Recent company announcements',
  })
  announcements: AnnouncementDto[];
}
