/**
 * XeroAccount DTOs
 * TASK-XERO-006: Chart of Accounts Database Sync
 *
 * Data Transfer Objects for Xero Chart of Accounts operations.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { XeroAccountStatus } from '../entities/xero-account.entity';

/**
 * DTO for creating a Xero account record
 */
export class CreateXeroAccountDto {
  @ApiProperty({ description: 'Tenant ID', example: 'uuid-here' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Account code from Xero', example: '200' })
  @IsString()
  accountCode!: string;

  @ApiProperty({ description: 'Account name', example: 'Sales Revenue' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Account type', example: 'REVENUE' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Tax type', example: 'OUTPUT' })
  @IsOptional()
  @IsString()
  taxType?: string;

  @ApiPropertyOptional({
    description: 'Account status',
    enum: XeroAccountStatus,
  })
  @IsOptional()
  @IsEnum(XeroAccountStatus)
  status?: XeroAccountStatus;

  @ApiPropertyOptional({
    description: 'Xero account ID',
    example: 'uuid-from-xero',
  })
  @IsOptional()
  @IsString()
  xeroAccountId?: string;
}

/**
 * DTO for updating a Xero account record
 */
export class UpdateXeroAccountDto {
  @ApiPropertyOptional({
    description: 'Account name',
    example: 'Sales Revenue',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Account type', example: 'REVENUE' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Tax type', example: 'OUTPUT' })
  @IsOptional()
  @IsString()
  taxType?: string | null;

  @ApiPropertyOptional({
    description: 'Account status',
    enum: XeroAccountStatus,
  })
  @IsOptional()
  @IsEnum(XeroAccountStatus)
  status?: XeroAccountStatus;

  @ApiPropertyOptional({
    description: 'Xero account ID',
    example: 'uuid-from-xero',
  })
  @IsOptional()
  @IsString()
  xeroAccountId?: string;
}

/**
 * DTO for filtering Xero accounts
 */
export class XeroAccountFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: XeroAccountStatus,
  })
  @IsOptional()
  @IsEnum(XeroAccountStatus)
  status?: XeroAccountStatus;

  @ApiPropertyOptional({
    description: 'Filter by account type',
    example: 'REVENUE',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by account code prefix',
    example: '200',
  })
  @IsOptional()
  @IsString()
  codePrefix?: string;

  @ApiPropertyOptional({
    description: 'Search by name (partial match)',
    example: 'Sales',
  })
  @IsOptional()
  @IsString()
  nameSearch?: string;

  @ApiPropertyOptional({ description: 'Limit results', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * DTO for Xero account response
 */
export class XeroAccountResponseDto {
  @ApiProperty({ description: 'Account ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Account code', example: '200' })
  accountCode!: string;

  @ApiProperty({ description: 'Account name', example: 'Sales Revenue' })
  name!: string;

  @ApiProperty({ description: 'Account type', example: 'REVENUE' })
  type!: string;

  @ApiPropertyOptional({ description: 'Tax type', example: 'OUTPUT' })
  taxType?: string | null;

  @ApiProperty({ description: 'Account status', enum: XeroAccountStatus })
  status!: XeroAccountStatus;

  @ApiPropertyOptional({ description: 'Xero account ID' })
  xeroAccountId?: string | null;

  @ApiProperty({ description: 'Last synced timestamp' })
  lastSyncedAt!: Date;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: Date;
}

/**
 * DTO for sync accounts response
 */
export class SyncAccountsResponseDto {
  @ApiProperty({ description: 'Number of accounts fetched from Xero' })
  accountsFetched!: number;

  @ApiProperty({ description: 'Number of new accounts created' })
  accountsCreated!: number;

  @ApiProperty({ description: 'Number of existing accounts updated' })
  accountsUpdated!: number;

  @ApiProperty({ description: 'Number of accounts archived' })
  accountsArchived!: number;

  @ApiProperty({
    description: 'List of errors encountered',
    type: [String],
  })
  errors!: string[];

  @ApiProperty({ description: 'Sync timestamp' })
  syncedAt!: Date;
}

/**
 * DTO for validate account code response
 */
export class ValidateAccountCodeResponseDto {
  @ApiProperty({ description: 'Whether the account code is valid' })
  isValid!: boolean;

  @ApiPropertyOptional({
    description: 'Account details if found',
    type: XeroAccountResponseDto,
  })
  account?: XeroAccountResponseDto;

  @ApiPropertyOptional({ description: 'Error message if invalid' })
  error?: string;

  @ApiPropertyOptional({
    description: 'Suggestions for alternative account codes',
    type: [String],
  })
  suggestions?: string[];
}

/**
 * DTO for list accounts response
 */
export class ListAccountsResponseDto {
  @ApiProperty({
    description: 'List of Xero accounts',
    type: [XeroAccountResponseDto],
  })
  accounts!: XeroAccountResponseDto[];

  @ApiProperty({ description: 'Total count of accounts' })
  total!: number;

  @ApiPropertyOptional({ description: 'Last sync timestamp' })
  lastSyncedAt?: Date;
}

/**
 * DTO for sync request
 */
export class SyncAccountsRequestDto {
  @ApiPropertyOptional({
    description: 'Force full sync even if recently synced',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceSync?: boolean;
}
