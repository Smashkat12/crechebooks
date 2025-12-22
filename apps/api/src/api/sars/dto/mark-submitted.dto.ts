/**
 * Mark Submitted DTO
 * TASK-SARS-031: SARS Controller and DTOs
 *
 * API DTO for marking a SARS submission as submitted.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';

export class ApiMarkSubmittedDto {
  @ApiPropertyOptional({
    description: 'eFiling reference number from SARS (optional)',
    example: 'SARS-REF-2025-001234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sars_reference?: string;

  @ApiProperty({
    description: 'Date submission was filed with SARS (YYYY-MM-DD)',
    example: '2025-01-25',
  })
  @IsDateString()
  submitted_date!: string;
}
