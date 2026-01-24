import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Supplier legal name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Trading name if different' })
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Contact phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Business address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'VAT registration number' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ description: 'Company registration number' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Payment terms in days', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'Bank name for EFT payments' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Bank branch code' })
  @IsOptional()
  @IsString()
  branchCode?: string;

  @ApiPropertyOptional({ description: 'Bank account number' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank account type',
    enum: ['CHEQUE', 'SAVINGS', 'CURRENT'],
  })
  @IsOptional()
  @IsString()
  accountType?: string;

  @ApiPropertyOptional({ description: 'Default expense account ID' })
  @IsOptional()
  @IsString()
  defaultAccountId?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ description: 'Supplier legal name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Trading name if different' })
  @IsOptional()
  @IsString()
  tradingName?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Contact phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Business address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'VAT registration number' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ description: 'Company registration number' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Payment terms in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'Bank name for EFT payments' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Bank branch code' })
  @IsOptional()
  @IsString()
  branchCode?: string;

  @ApiPropertyOptional({ description: 'Bank account number' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank account type',
    enum: ['CHEQUE', 'SAVINGS', 'CURRENT'],
  })
  @IsOptional()
  @IsString()
  accountType?: string;

  @ApiPropertyOptional({ description: 'Default expense account ID' })
  @IsOptional()
  @IsString()
  defaultAccountId?: string;

  @ApiPropertyOptional({ description: 'Whether supplier is active' })
  @IsOptional()
  isActive?: boolean;
}

export class CreateSupplierBillLineDto {
  @ApiProperty({ description: 'Line item description' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Quantity', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiProperty({ description: 'Unit price in cents' })
  @IsInt()
  @Min(0)
  unitPriceCents: number;

  @ApiPropertyOptional({
    description: 'VAT type',
    enum: ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT'],
    default: 'STANDARD',
  })
  @IsOptional()
  @IsString()
  vatType?: string;

  @ApiPropertyOptional({ description: 'Expense account ID' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class CreateSupplierBillDto {
  @ApiProperty({ description: 'Supplier ID' })
  @IsString()
  supplierId: string;

  @ApiProperty({ description: "Supplier's invoice number" })
  @IsString()
  billNumber: string;

  @ApiProperty({ description: 'Bill date (ISO format)' })
  @IsDateString()
  billDate: string;

  @ApiPropertyOptional({ description: 'Due date (ISO format), defaults to payment terms' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Purchase order reference' })
  @IsOptional()
  @IsString()
  purchaseOrderRef?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Attachment URL (PDF/image)' })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiProperty({ description: 'Bill line items', type: [CreateSupplierBillLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierBillLineDto)
  lines: CreateSupplierBillLineDto[];
}

export class RecordBillPaymentDto {
  @ApiProperty({ description: 'Payment amount in cents' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ description: 'Payment date (ISO format)' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ description: 'Payment method', enum: ['EFT', 'CASH', 'CARD', 'CHEQUE'] })
  @IsString()
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Payment reference' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Linked bank transaction ID' })
  @IsOptional()
  @IsString()
  transactionId?: string;
}

export interface SupplierResponse {
  id: string;
  name: string;
  tradingName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierBillResponse {
  id: string;
  supplierId: string;
  supplierName: string;
  billNumber: string;
  billDate: Date;
  dueDate: Date;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  status: string;
  paidDate: Date | null;
  createdAt: Date;
}

export interface PayablesSummaryResponse {
  totalDueCents: number;
  overdueCents: number;
  dueThisWeekCents: number;
  supplierCount: number;
}
