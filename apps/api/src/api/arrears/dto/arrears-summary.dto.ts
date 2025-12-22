import { ApiProperty } from '@nestjs/swagger';

export interface AgeBucketDto {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
}

export interface TrendDto {
  previousMonth: number;
  change: number;
  changePercent: number;
}

export class ArrearsSummaryResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  totalOutstanding: number;

  @ApiProperty()
  totalAccounts: number;

  @ApiProperty()
  byAgeBucket: AgeBucketDto;

  @ApiProperty()
  trend: TrendDto;
}
