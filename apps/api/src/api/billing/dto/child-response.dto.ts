/**
 * Child Response DTOs
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module api/billing/dto/child-response
 * @description Response DTOs for child listing and detail endpoints.
 * Uses snake_case for API responses.
 *
 * CRITICAL: NO MOCK DATA - fail fast with detailed error logging.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../database/entities/child.entity';
import { EnrollmentStatus } from '../../../database/entities/enrollment.entity';
import { PaginationMetaDto } from '../../../shared/dto/pagination-meta.dto';

/**
 * Parent summary in child response
 */
export class ParentSummaryChildDto {
  @ApiProperty({ description: 'Parent UUID' })
  id!: string;

  @ApiProperty({ description: 'Parent full name' })
  name!: string;

  @ApiProperty({ description: 'Parent email' })
  email!: string;
}

/**
 * Current enrollment in child detail response
 */
export class CurrentEnrollmentDto {
  @ApiProperty({ description: 'Enrollment UUID' })
  id!: string;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      amount: { type: 'number' },
    },
    description: 'Fee structure details',
  })
  fee_structure!: {
    id: string;
    name: string;
    amount: number;
  };

  @ApiProperty({ description: 'Enrollment start date (YYYY-MM-DD)' })
  start_date!: string;

  @ApiProperty({
    required: false,
    description: 'Enrollment end date (YYYY-MM-DD)',
  })
  end_date?: string;

  @ApiProperty({ enum: EnrollmentStatus, description: 'Enrollment status' })
  status!: EnrollmentStatus;
}

/**
 * Child detail data structure
 */
export class ChildDetailDataDto {
  @ApiProperty({ description: 'Child UUID' })
  id!: string;

  @ApiProperty({ description: 'Child first name' })
  first_name!: string;

  @ApiProperty({ description: 'Child last name' })
  last_name!: string;

  @ApiProperty({ description: 'Date of birth (YYYY-MM-DD)' })
  date_of_birth!: string;

  @ApiProperty({ enum: Gender, nullable: true, description: 'Child gender' })
  gender!: Gender | null;

  @ApiProperty({ type: ParentSummaryChildDto, description: 'Parent details' })
  parent!: ParentSummaryChildDto;

  @ApiProperty({
    type: CurrentEnrollmentDto,
    nullable: true,
    description: 'Current enrollment (if active)',
  })
  current_enrollment!: CurrentEnrollmentDto | null;

  @ApiProperty({ nullable: true, description: 'Medical notes' })
  medical_notes!: string | null;

  @ApiProperty({ nullable: true, description: 'Emergency contact name' })
  emergency_contact!: string | null;

  @ApiProperty({ nullable: true, description: 'Emergency contact phone' })
  emergency_phone!: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at!: Date;
}

/**
 * Child detail response
 */
export class ChildDetailResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success!: boolean;

  @ApiProperty({ type: ChildDetailDataDto, description: 'Child details' })
  data!: ChildDetailDataDto;
}

/**
 * Child item in list response
 */
export class ChildListItemDto {
  @ApiProperty({ description: 'Child UUID' })
  id!: string;

  @ApiProperty({ description: 'Child first name' })
  first_name!: string;

  @ApiProperty({ description: 'Child last name' })
  last_name!: string;

  @ApiProperty({ description: 'Date of birth (YYYY-MM-DD)' })
  date_of_birth!: string;

  @ApiProperty({ type: ParentSummaryChildDto, description: 'Parent details' })
  parent!: ParentSummaryChildDto;

  @ApiProperty({
    enum: EnrollmentStatus,
    required: false,
    description: 'Current enrollment status',
  })
  enrollment_status!: EnrollmentStatus | null;
}

/**
 * Child list response with pagination
 */
export class ChildListResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success!: boolean;

  @ApiProperty({ type: [ChildListItemDto], description: 'List of children' })
  data!: ChildListItemDto[];

  @ApiProperty({ type: PaginationMetaDto, description: 'Pagination metadata' })
  meta!: PaginationMetaDto;
}
