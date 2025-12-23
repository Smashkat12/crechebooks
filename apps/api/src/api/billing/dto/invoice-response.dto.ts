import { ApiProperty } from '@nestjs/swagger';
import {
  InvoiceStatus,
  DeliveryStatus,
} from '../../../database/entities/invoice.entity';
import { PaginationMetaDto } from '../../../shared/dto';

export class ParentSummaryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'John Smith' })
  name: string;

  @ApiProperty({
    example: 'john.smith@example.com',
    required: false,
    nullable: true,
  })
  email?: string | null;
}

export class ChildSummaryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Emma Smith' })
  name: string;
}

export class InvoiceResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number: string;

  @ApiProperty({ type: ParentSummaryDto })
  parent: ParentSummaryDto;

  @ApiProperty({ type: ChildSummaryDto })
  child: ChildSummaryDto;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Billing period start date (YYYY-MM-DD)',
  })
  billing_period_start: string;

  @ApiProperty({
    example: '2025-01-31',
    description: 'Billing period end date (YYYY-MM-DD)',
  })
  billing_period_end: string;

  @ApiProperty({
    example: '2025-02-01',
    description: 'Invoice issue date (YYYY-MM-DD)',
  })
  issue_date: string;

  @ApiProperty({
    example: '2025-02-15',
    description: 'Payment due date (YYYY-MM-DD)',
  })
  due_date: string;

  @ApiProperty({
    example: 5000.0,
    description: 'Subtotal amount in decimal (ZAR)',
  })
  subtotal: number;

  @ApiProperty({
    example: 750.0,
    description: 'VAT amount in decimal (ZAR)',
  })
  vat: number;

  @ApiProperty({
    example: 5750.0,
    description: 'Total amount in decimal (ZAR)',
  })
  total: number;

  @ApiProperty({
    example: 2000.0,
    description: 'Amount paid in decimal (ZAR)',
  })
  amount_paid: number;

  @ApiProperty({
    example: 3750.0,
    description: 'Balance due in decimal (ZAR)',
  })
  balance_due: number;

  @ApiProperty({ enum: InvoiceStatus, example: 'SENT' })
  status: InvoiceStatus;

  @ApiProperty({
    enum: DeliveryStatus,
    example: 'DELIVERED',
    required: false,
    nullable: true,
  })
  delivery_status?: DeliveryStatus | null;

  @ApiProperty({ example: '2025-02-01T08:00:00Z' })
  created_at: Date;
}

export class InvoiceListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [InvoiceResponseDto] })
  data: InvoiceResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class InvoiceLineResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Monthly School Fee - January 2025' })
  description: string;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ example: 5000.0, description: 'Unit price in decimal (ZAR)' })
  unit_price: number;

  @ApiProperty({ example: 5000.0, description: 'Subtotal in decimal (ZAR)' })
  subtotal: number;

  @ApiProperty({ example: 750.0, description: 'VAT amount in decimal (ZAR)' })
  vat: number;

  @ApiProperty({ example: 5750.0, description: 'Total in decimal (ZAR)' })
  total: number;

  @ApiProperty({ example: 'MONTHLY_FEE', description: 'Line item type' })
  line_type: string;

  @ApiProperty({
    example: '4000',
    description: 'Account code for accounting',
    required: false,
    nullable: true,
  })
  account_code?: string | null;
}

export class InvoiceDetailDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number: string;

  @ApiProperty({ type: ParentSummaryDto })
  parent: ParentSummaryDto;

  @ApiProperty({ type: ChildSummaryDto })
  child: ChildSummaryDto;

  @ApiProperty({
    example: '2025-01-01',
    description: 'Billing period start date (YYYY-MM-DD)',
  })
  billing_period_start: string;

  @ApiProperty({
    example: '2025-01-31',
    description: 'Billing period end date (YYYY-MM-DD)',
  })
  billing_period_end: string;

  @ApiProperty({
    example: '2025-02-01',
    description: 'Invoice issue date (YYYY-MM-DD)',
  })
  issue_date: string;

  @ApiProperty({
    example: '2025-02-15',
    description: 'Payment due date (YYYY-MM-DD)',
  })
  due_date: string;

  @ApiProperty({
    example: 5000.0,
    description: 'Subtotal amount in decimal (ZAR)',
  })
  subtotal: number;

  @ApiProperty({
    example: 750.0,
    description: 'VAT amount in decimal (ZAR)',
  })
  vat: number;

  @ApiProperty({
    example: 5750.0,
    description: 'Total amount in decimal (ZAR)',
  })
  total: number;

  @ApiProperty({
    example: 2000.0,
    description: 'Amount paid in decimal (ZAR)',
  })
  amount_paid: number;

  @ApiProperty({
    example: 3750.0,
    description: 'Balance due in decimal (ZAR)',
  })
  balance_due: number;

  @ApiProperty({ enum: InvoiceStatus, example: 'SENT' })
  status: InvoiceStatus;

  @ApiProperty({
    enum: DeliveryStatus,
    example: 'DELIVERED',
    required: false,
    nullable: true,
  })
  delivery_status?: DeliveryStatus | null;

  @ApiProperty({ type: [InvoiceLineResponseDto] })
  lines: InvoiceLineResponseDto[];

  @ApiProperty({
    example: 'Payment due within 7 days',
    required: false,
    nullable: true,
  })
  notes?: string | null;

  @ApiProperty({ example: '2025-02-01T08:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2025-02-01T08:00:00Z' })
  updated_at: Date;
}

export class InvoiceDetailResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: InvoiceDetailDto })
  data: InvoiceDetailDto;
}
