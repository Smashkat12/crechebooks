/**
 * EMP201 DTOs
 * TASK-SARS-033: EMP201 Endpoint
 *
 * API DTOs for EMP201 generation endpoint.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ApiGenerateEmp201Dto {
  @ApiProperty({
    description: 'Period in YYYY-MM format',
    example: '2025-01',
  })
  @IsString()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])$/, {
    message: 'period_month must be in YYYY-MM format',
  })
  period_month!: string;
}

export class ApiEmp201EmployeeDto {
  @ApiProperty({ example: 'staff-uuid' })
  staff_id!: string;

  @ApiProperty({ example: 'John Smith' })
  full_name!: string;

  @ApiProperty({ example: 15000.0, description: 'Gross remuneration (Rands)' })
  gross_remuneration!: number;

  @ApiProperty({ example: 2250.0, description: 'PAYE deducted (Rands)' })
  paye!: number;

  @ApiProperty({
    example: 150.0,
    description: 'UIF employee contribution (Rands)',
  })
  uif_employee!: number;

  @ApiProperty({
    example: 150.0,
    description: 'UIF employer contribution (Rands)',
  })
  uif_employer!: number;
}

export class ApiEmp201SummaryDto {
  @ApiProperty({ example: 5, description: 'Number of employees' })
  employee_count!: number;

  @ApiProperty({
    example: 75000.0,
    description: 'Total gross remuneration (Rands)',
  })
  total_gross!: number;

  @ApiProperty({ example: 11250.0, description: 'Total PAYE (Rands)' })
  total_paye!: number;

  @ApiProperty({
    example: 1500.0,
    description: 'Total UIF (employee + employer, Rands)',
  })
  total_uif!: number;

  @ApiProperty({ example: 750.0, description: 'Total SDL (Rands)' })
  total_sdl!: number;

  @ApiProperty({
    example: 13500.0,
    description: 'Total amount due to SARS (Rands)',
  })
  total_due!: number;
}

export class ApiEmp201DataDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({ example: 'EMP201' })
  submission_type!: string;

  @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
  period!: string;

  @ApiProperty({
    example: 'DRAFT',
    enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'],
  })
  status!: string;

  @ApiProperty({ type: ApiEmp201SummaryDto })
  summary!: ApiEmp201SummaryDto;

  @ApiProperty({ type: [ApiEmp201EmployeeDto] })
  employees!: ApiEmp201EmployeeDto[];

  @ApiProperty({ type: [String], description: 'Validation issues found' })
  validation_issues!: string[];

  @ApiProperty({
    example: '2025-02-07T00:00:00.000Z',
    description: 'Submission deadline',
  })
  deadline!: string;

  @ApiProperty({ example: '/sars/emp201/uuid/document' })
  document_url!: string;
}

export class ApiEmp201ResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiEmp201DataDto })
  data!: ApiEmp201DataDto;
}
