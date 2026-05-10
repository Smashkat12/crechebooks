// src/api/payment/dto/match-payments.dto.ts
import { IsOptional, IsArray, IsUUID, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * API DTO for triggering payment matching.
 * Uses snake_case for external API consumers.
 */
export class ApiMatchPaymentsDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Specific transaction IDs to match. If empty, matches all unallocated credits.',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transaction_ids?: string[]; // snake_case for API

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Preview only — return the matches the engine would auto-apply ' +
      'without creating Payment rows or updating invoices.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}
