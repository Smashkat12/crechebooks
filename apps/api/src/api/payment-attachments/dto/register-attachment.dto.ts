/**
 * RegisterAttachmentDto — request body for POST /parent-portal/payment-attachments/
 *
 * Registers the S3 object that was uploaded via the presigned URL.
 * Service verifies the object actually exists in S3 before creating the row.
 */

import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_FILE_SIZE_BYTES } from './presign-upload.dto';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

export class RegisterAttachmentDto {
  @ApiProperty({
    description: 'Full S3 key returned by the presign endpoint',
    example: 'tenants/abc.../proof-of-payments/uuid-proof.pdf',
  })
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @ApiProperty({
    description: 'Original filename (1–200 chars)',
    example: 'proof-of-payment.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename: string;

  @ApiProperty({
    description: 'MIME type',
    enum: ALLOWED_CONTENT_TYPES,
  })
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
  })
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes (positive integer, ≤ 10 MB)',
    example: 204800,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES, {
    message: `fileSize must not exceed ${MAX_FILE_SIZE_BYTES} bytes (10 MB)`,
  })
  fileSize: number;

  @ApiPropertyOptional({
    description: 'Optional note (max 500 chars)',
    example: 'EFT payment for April 2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
