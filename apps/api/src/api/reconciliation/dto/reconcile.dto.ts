/**
 * Reconcile DTO
 * TASK-RECON-031: Reconciliation Controller
 *
 * API DTO for reconciliation request.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsNumber,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ApiReconcileDto {
  @ApiProperty({
    description: 'Bank account identifier',
    example: 'FNB Business Current',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bank_account!: string;

  @ApiProperty({
    description: 'Start date of reconciliation period (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  period_start!: string;

  @ApiProperty({
    description: 'End date of reconciliation period (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsDateString()
  period_end!: string;

  @ApiProperty({
    description: 'Opening balance from bank statement (Rands)',
    example: 50000.0,
  })
  @IsNumber()
  opening_balance!: number;

  @ApiProperty({
    description: 'Closing balance from bank statement (Rands)',
    example: 62500.0,
  })
  @IsNumber()
  closing_balance!: number;
}
