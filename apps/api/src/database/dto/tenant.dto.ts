import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsDateString,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { TaxStatus, SubscriptionStatus } from '../entities/tenant.entity';

/**
 * DTO for closure date entries
 */
export class ClosureDateDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MaxLength(200)
  description!: string;
}

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vatNumber?: string;

  @IsOptional()
  @IsEnum(TaxStatus)
  taxStatus?: TaxStatus;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  province!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  postalCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  xeroTenantId?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  invoiceDayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  invoiceDueDays?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClosureDateDto)
  closureDates?: ClosureDateDto[];

  // TASK-RECON-002: Amount tolerance for transaction matching (in cents)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000) // Maximum R100 tolerance
  matchingToleranceCents?: number;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
