/**
 * CSP Violation Report DTOs
 * TASK-SEC-103: CSP Headers - XSS protection
 *
 * DTOs for handling Content Security Policy violation reports
 * sent by browsers when CSP rules are violated.
 */

import {
  IsString,
  IsOptional,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CSP violation report body as sent by browsers
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP#violation_report_syntax
 */
export class CspViolationDetails {
  @ApiProperty({
    description: 'The URI of the resource that was blocked from loading',
    example: 'https://evil.example.com/malicious.js',
  })
  @IsString()
  @IsOptional()
  'blocked-uri'?: string;

  @ApiProperty({
    description: 'The column number in the script where the violation occurred',
    example: 42,
  })
  @IsNumber()
  @IsOptional()
  'column-number'?: number;

  @ApiPropertyOptional({
    description: 'Disposition (report or enforce)',
    example: 'enforce',
  })
  @IsString()
  @IsOptional()
  disposition?: string;

  @ApiProperty({
    description: 'The URI of the document in which the violation occurred',
    example: 'https://example.com/page',
  })
  @IsString()
  @IsOptional()
  'document-uri'?: string;

  @ApiProperty({
    description: 'The CSP directive that was violated',
    example: 'script-src',
  })
  @IsString()
  @IsOptional()
  'effective-directive'?: string;

  @ApiProperty({
    description: 'The line number in the script where the violation occurred',
    example: 123,
  })
  @IsNumber()
  @IsOptional()
  'line-number'?: number;

  @ApiProperty({
    description: 'The original CSP policy that was violated',
    example: "default-src 'self'; script-src 'self'",
  })
  @IsString()
  @IsOptional()
  'original-policy'?: string;

  @ApiPropertyOptional({
    description: 'The referrer of the document',
    example: 'https://example.com/previous-page',
  })
  @IsString()
  @IsOptional()
  referrer?: string;

  @ApiPropertyOptional({
    description: 'Sample of the code that violated the policy',
    example: 'alert("xss")',
  })
  @IsString()
  @IsOptional()
  'script-sample'?: string;

  @ApiProperty({
    description: 'The URI of the resource where the violation originated',
    example: 'https://example.com/script.js',
  })
  @IsString()
  @IsOptional()
  'source-file'?: string;

  @ApiPropertyOptional({
    description: 'HTTP status code returned for the blocked resource',
    example: 200,
  })
  @IsNumber()
  @IsOptional()
  'status-code'?: number;

  @ApiProperty({
    description: 'The directive that was violated',
    example: "script-src 'self'",
  })
  @IsString()
  @IsOptional()
  'violated-directive'?: string;
}

/**
 * CSP violation report wrapper
 * Browsers send reports wrapped in a 'csp-report' object
 */
export class CspViolationReportDto {
  @ApiProperty({
    description: 'CSP violation details',
    type: CspViolationDetails,
  })
  @ValidateNested()
  @Type(() => CspViolationDetails)
  @IsOptional()
  'csp-report'?: CspViolationDetails;
}

/**
 * Structured CSP violation log entry
 * Used for logging violations in a consistent format
 */
export interface CspViolationLogEntry {
  timestamp: string;
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  originalPolicy: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  scriptSample?: string;
  disposition: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
}
