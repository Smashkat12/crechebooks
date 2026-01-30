/**
 * Export Report DTOs
 * TASK-REPORTS-002: Reports API Module
 *
 * @module modules/reports/dto/export-report.dto
 * @description DTOs for report export request with Swagger documentation.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsDate, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Supported export formats.
 */
export enum ExportFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
  CSV = 'CSV',
}

/**
 * Query parameters for exporting reports.
 */
export class ExportQueryDto {
  @ApiProperty({
    description: 'Start date of the report period (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @Transform(({ value }: { value: string }) => new Date(value))
  @IsDate()
  start!: Date;

  @ApiProperty({
    description: 'End date of the report period (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @Transform(({ value }: { value: string }) => new Date(value))
  @IsDate()
  end!: Date;

  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
    default: ExportFormat.PDF,
    example: 'PDF',
  })
  @IsEnum(ExportFormat)
  @Transform(({ value }: { value: string }) => value?.toUpperCase())
  format: ExportFormat = ExportFormat.PDF;

  @ApiPropertyOptional({
    description: 'Include AI-generated insights in the export',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | boolean | undefined }) =>
    value === undefined ? true : value === 'true' || value === true,
  )
  includeInsights?: boolean = true;
}

/**
 * Export metadata response (when returning file info instead of streaming).
 */
export class ExportMetadataDto {
  @ApiProperty({
    description: 'Generated filename',
    example: 'income-statement-2025-01-01-to-2025-12-31.pdf',
  })
  filename!: string;

  @ApiProperty({
    description: 'MIME type of the export',
    example: 'application/pdf',
  })
  contentType!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 125000,
  })
  size!: number;

  @ApiProperty({
    description: 'When the export was generated (ISO 8601)',
    example: '2025-01-29T12:00:00.000Z',
  })
  generatedAt!: string;
}

/**
 * Content type mapping for export formats.
 */
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  [ExportFormat.PDF]: 'application/pdf',
  [ExportFormat.EXCEL]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ExportFormat.CSV]: 'text/csv',
};

/**
 * File extension mapping for export formats.
 */
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  [ExportFormat.PDF]: '.pdf',
  [ExportFormat.EXCEL]: '.xlsx',
  [ExportFormat.CSV]: '.csv',
};
