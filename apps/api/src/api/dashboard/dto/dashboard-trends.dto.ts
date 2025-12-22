import { ApiProperty } from '@nestjs/swagger';

class TrendDataPointDto {
  @ApiProperty({ description: 'Date for the data point' })
  date: string;

  @ApiProperty({ description: 'Revenue in cents' })
  revenue: number;

  @ApiProperty({ description: 'Expenses in cents' })
  expenses: number;

  @ApiProperty({ description: 'Profit (revenue - expenses) in cents' })
  profit: number;

  @ApiProperty({ description: 'Arrears amount in cents' })
  arrears: number;
}

export class DashboardTrendsResponseDto {
  @ApiProperty({ description: 'Period for the trends' })
  period: string;

  @ApiProperty({
    description: 'Data interval',
    enum: ['daily', 'weekly', 'monthly'],
  })
  interval: 'daily' | 'weekly' | 'monthly';

  @ApiProperty({ type: [TrendDataPointDto] })
  data: TrendDataPointDto[];
}
