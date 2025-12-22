import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDate,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  InvoiceStatus,
  DeliveryMethod,
  DeliveryStatus,
} from '../entities/invoice.entity';

export class CreateInvoiceDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  invoiceNumber!: string;

  @IsUUID()
  parentId!: string;

  @IsUUID()
  childId!: string;

  @Type(() => Date)
  @IsDate()
  billingPeriodStart!: Date;

  @Type(() => Date)
  @IsDate()
  billingPeriodEnd!: Date;

  @Type(() => Date)
  @IsDate()
  issueDate!: Date;

  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @IsInt()
  @Min(0)
  subtotalCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vatCents?: number;

  @IsInt()
  @Min(0)
  totalCents!: number;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {
  @IsOptional()
  @IsString()
  xeroInvoiceId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountPaidCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryRetryCount?: number;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  deliveryStatus?: DeliveryStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deliveredAt?: Date;
}

export class InvoiceFilterDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
