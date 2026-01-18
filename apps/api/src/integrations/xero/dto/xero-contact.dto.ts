/**
 * Xero Contact DTOs
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Data transfer objects for Xero contact sync operations.
 * Used to map CrecheBooks Parent records to Xero Contacts.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEmail,
  IsOptional,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating/updating a Xero contact
 */
export class XeroContactDto {
  @ApiProperty({
    description: 'Xero Contact ID (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  contactId: string;

  @ApiProperty({
    description: 'Contact name as it appears in Xero',
    example: 'John Smith',
  })
  @IsString()
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({
    description: 'Contact first name',
    example: 'John',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Contact last name',
    example: 'Smith',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'john.smith@example.com',
  })
  @IsEmail()
  @IsOptional()
  emailAddress?: string;

  @ApiPropertyOptional({
    description: 'Contact status in Xero',
    example: 'ACTIVE',
  })
  @IsString()
  @IsOptional()
  contactStatus?: string;
}

/**
 * Request DTO for syncing a parent to Xero
 */
export class SyncParentToXeroRequestDto {
  @ApiProperty({
    description: 'CrecheBooks Parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  parentId: string;
}

/**
 * Response DTO for contact sync operation
 */
export class ContactSyncResponseDto {
  @ApiProperty({
    description: 'CrecheBooks Parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  parentId: string;

  @ApiProperty({
    description: 'Xero Contact ID',
    example: 'x1y2z3a4-b5c6-7890-defg-hi1234567890',
  })
  xeroContactId: string;

  @ApiProperty({
    description: 'Contact name in Xero',
    example: 'John Smith',
  })
  xeroContactName: string;

  @ApiProperty({
    description: 'Whether this was a new contact created or existing matched',
  })
  wasCreated: boolean;

  @ApiProperty({
    description: 'Timestamp of sync',
  })
  syncedAt: Date;
}

/**
 * Response DTO for bulk contact sync
 */
export class BulkContactSyncResponseDto {
  @ApiProperty({
    description: 'Number of contacts successfully synced',
    example: 10,
  })
  synced: number;

  @ApiProperty({
    description: 'Number of contacts that failed to sync',
    example: 0,
  })
  failed: number;

  @ApiProperty({
    description: 'Number of contacts skipped (already synced)',
    example: 5,
  })
  skipped: number;

  @ApiProperty({
    description: 'Details of synced contacts',
    type: [ContactSyncResponseDto],
  })
  results: ContactSyncResponseDto[];

  @ApiProperty({
    description: 'Error details for failed syncs',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        error: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  errors: Array<{
    parentId: string;
    error: string;
    code: string;
  }>;
}

/**
 * DTO for contact mapping record
 */
export class ContactMappingDto {
  @ApiProperty({
    description: 'Mapping ID',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant ID',
  })
  tenantId: string;

  @ApiProperty({
    description: 'CrecheBooks Parent ID',
  })
  parentId: string;

  @ApiProperty({
    description: 'Xero Contact ID',
  })
  xeroContactId: string;

  @ApiPropertyOptional({
    description: 'Contact name in Xero',
  })
  xeroContactName?: string;

  @ApiProperty({
    description: 'Last sync timestamp',
  })
  lastSyncedAt: Date;

  @ApiProperty({
    description: 'Created timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated timestamp',
  })
  updatedAt: Date;
}

/**
 * Xero Contact search result
 */
export interface XeroContactSearchResult {
  contactId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  contactStatus: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}
