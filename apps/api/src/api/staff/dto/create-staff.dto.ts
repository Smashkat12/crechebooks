import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  MinLength,
  MaxLength,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * API DTO for creating staff - accepts snake_case from frontend
 */
export class ApiCreateStaffDto {
  @ApiPropertyOptional({ example: 'EMP001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employee_number?: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name!: string;

  @ApiProperty({ example: 'Mokgadi' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name!: string;

  @ApiProperty({ example: '9202204720083' })
  @IsString()
  @Length(13, 13)
  id_number!: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_number?: string;

  @ApiProperty({ example: '1992-02-20' })
  @IsString()
  date_of_birth!: string;

  @ApiProperty({ example: '2026-01-05' })
  @IsString()
  start_date!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiProperty({ example: 1500000, description: 'Salary in cents' })
  @IsInt()
  @Min(0)
  salary!: number;

  @ApiProperty({ example: 'EFT', enum: ['EFT', 'CASH'] })
  @IsEnum(['EFT', 'CASH'])
  payment_method!: 'EFT' | 'CASH';

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bank_account_number?: string;

  @ApiPropertyOptional({ example: '250655' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bank_branch_code?: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'] })
  @IsEnum(['ACTIVE', 'INACTIVE', 'TERMINATED'])
  status!: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
}
