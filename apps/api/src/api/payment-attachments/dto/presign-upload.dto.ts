/**
 * PresignUploadDto — request body for POST /parent-portal/payment-attachments/presign
 *
 * Returns a short-lived presigned S3 PUT URL. The DB row is NOT created
 * here — the parent must follow up with POST / once the upload completes.
 */

import { IsString, IsNotEmpty, IsIn, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/** Maximum allowed file size: 10 MB */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10485760

export class PresignUploadDto {
  @ApiProperty({
    description: 'Original filename (1–200 chars). Will be sanitized.',
    example: 'proof-of-payment-april.pdf',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: 'MIME type',
    enum: ALLOWED_CONTENT_TYPES,
    example: 'application/pdf',
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
}

export interface PresignUploadResponseDto {
  /** Presigned S3 PUT URL — valid for 15 minutes */
  uploadUrl: string;
  /** Full S3 key to pass back in the register call */
  key: string;
  /** ISO timestamp when the presigned URL expires */
  expiresAt: string;
}
