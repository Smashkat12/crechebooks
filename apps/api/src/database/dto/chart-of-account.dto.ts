import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType, AccountSubType } from '@prisma/client';

/**
 * Chart of Accounts DTOs
 * TASK-ACCT-001: Native Chart of Accounts Foundation
 */

export class CreateChartOfAccountDto {
  @ApiProperty({ description: 'Account code (e.g., "1000" for Bank)' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Account name' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Account type',
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
  })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiPropertyOptional({
    description: 'Account sub-type',
    enum: ['BANK', 'CURRENT_ASSET', 'FIXED_ASSET', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'EQUITY', 'OPERATING_REVENUE', 'OTHER_REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'OTHER_EXPENSE'],
  })
  @IsOptional()
  @IsEnum(AccountSubType)
  subType?: AccountSubType;

  @ApiPropertyOptional({ description: 'Account description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent account ID for sub-accounts' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Is this account education VAT exempt under Section 12(h)', default: false })
  @IsOptional()
  @IsBoolean()
  isEducationExempt?: boolean;

  @ApiPropertyOptional({ description: 'Xero account ID for sync' })
  @IsOptional()
  @IsString()
  xeroAccountId?: string;
}

export class UpdateChartOfAccountDto {
  @ApiPropertyOptional({ description: 'Account name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Account description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Account sub-type',
    enum: ['BANK', 'CURRENT_ASSET', 'FIXED_ASSET', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'EQUITY', 'OPERATING_REVENUE', 'OTHER_REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'OTHER_EXPENSE'],
  })
  @IsOptional()
  @IsEnum(AccountSubType)
  subType?: AccountSubType;

  @ApiPropertyOptional({ description: 'Parent account ID' })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Is this account education VAT exempt under Section 12(h)' })
  @IsOptional()
  @IsBoolean()
  isEducationExempt?: boolean;

  @ApiPropertyOptional({ description: 'Whether account is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Xero account ID for sync' })
  @IsOptional()
  @IsString()
  xeroAccountId?: string;
}

export interface AccountResponse {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: AccountSubType | null;
  description: string | null;
  parentId: string | null;
  isEducationExempt: boolean;
  isSystem: boolean;
  isActive: boolean;
  xeroAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountTreeNode extends AccountResponse {
  children: AccountTreeNode[];
  level: number;
}

export interface AccountSummary {
  type: AccountType;
  count: number;
  activeCount: number;
}
