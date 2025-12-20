import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { LineType } from '../entities/invoice-line.entity';

export class CreateInvoiceLineDto {
  @IsUUID()
  invoiceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsInt()
  unitPriceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsInt()
  subtotalCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vatCents?: number;

  @IsInt()
  totalCents!: number;

  @IsEnum(LineType)
  lineType!: LineType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateInvoiceLineDto extends PartialType(CreateInvoiceLineDto) {}

export class BatchCreateInvoiceLinesDto {
  @IsUUID()
  invoiceId!: string;

  lines!: Omit<CreateInvoiceLineDto, 'invoiceId'>[];
}
