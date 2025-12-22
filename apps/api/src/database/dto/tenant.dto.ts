import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TaxStatus, SubscriptionStatus } from '../entities/tenant.entity';

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
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
