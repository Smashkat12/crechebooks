import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsUUID, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListArrearsQueryDto {
  // tenantId is passed by frontend but ignored - we use JWT token instead
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number (1-based)',
  })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page',
  })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Minimum days past due to include',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minDays?: number;

  @ApiPropertyOptional({
    description: 'Minimum amount outstanding (in Rands)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Filter by parent UUID',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export interface ArrearsItemDto {
  id: string;
  parent_id: string;
  parent_name: string;
  child_id: string;
  child_name: string;
  total_outstanding: number;
  oldest_invoice_date: string;
  days_past_due: number;
  invoice_count: number;
  last_payment_date?: string;
  contact_email?: string;
  contact_phone?: string;
}

export class ArrearsListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [Object] })
  arrears: ArrearsItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
