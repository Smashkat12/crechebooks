/**
 * Update Parent Child DTO
 * Parent portal: whitelisted partial update of non-identity child fields.
 *
 * Editable fields (Option A — medicalNotes is the catch-all for allergies/conditions):
 *   - medicalNotes:      free text; HTML-stripped; max 2000 chars
 *   - emergencyContact:  free-text contact description; HTML-stripped; max 200 chars
 *   - emergencyPhone:    SA phone format; sanitized + pattern-validated; max 20 chars
 *
 * Schema reality: the Child model has `emergencyContact` (VarChar 200) and
 * `emergencyPhone` (VarChar 20) as its emergency fields. The separate
 * emergencyContactName / emergencyContactPhone / emergencyContactRelation columns
 * exist only on the Staff model, not Child.
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  SanitizeName,
  SanitizeText,
  SanitizePhone,
} from '../../../common/utils/sanitize.utils';
import { IsSAPhoneNumber } from '../../../shared/validators';
import { normalizeName } from '../../../common/utils/name-normalizer';

export class UpdateParentChildDto {
  /**
   * Medical notes / allergy notes for the child.
   * Use this field for allergies, conditions, medications, dietary requirements.
   * HTML is stripped; max 2000 characters.
   */
  @ApiPropertyOptional({
    description:
      'Medical notes, allergies, conditions, or dietary requirements. ' +
      'This is the catch-all for all medical/allergy information (Option A).',
    maxLength: 2000,
    example:
      'Allergic to peanuts. Requires EpiPen on site. Asthmatic — has inhaler.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  medicalNotes?: string;

  /**
   * Emergency contact — free-text description (name + relation).
   * e.g. "Grandmother Mary Smith". HTML-stripped; max 200 chars.
   * Note: this maps to the single `emergencyContact` field on the Child model.
   */
  @ApiPropertyOptional({
    description:
      'Emergency contact name and relationship (e.g. "Grandmother Mary Smith"). Max 200 chars.',
    maxLength: 200,
    example: 'Grandmother Mary Smith',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => normalizeName(value))
  @SanitizeName()
  emergencyContact?: string;

  /**
   * Emergency contact phone number — SA format (+27XXXXXXXXX or 0XXXXXXXXX).
   * Sanitized and normalized to +27 format before storage.
   */
  @ApiPropertyOptional({
    description:
      'Emergency contact phone number (SA format: +27XXXXXXXXX or 0XXXXXXXXX). Max 20 chars.',
    maxLength: 20,
    example: '+27821234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @SanitizePhone()
  @IsSAPhoneNumber({
    message:
      'Emergency phone must be a valid South African mobile number (format: +27XXXXXXXXX or 0XXXXXXXXX)',
  })
  emergencyPhone?: string;
}

/**
 * Whitelisted shape returned to the parent after a successful update.
 * Only non-identity, non-sensitive fields are exposed.
 */
export class ParentChildUpdateResponseDto {
  @ApiPropertyOptional({ description: 'Child ID' })
  id: string;

  @ApiPropertyOptional({ description: 'Medical notes / allergies' })
  medicalNotes: string | null;

  @ApiPropertyOptional({ description: 'Emergency contact (name + relation)' })
  emergencyContact: string | null;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  emergencyPhone: string | null;

  @ApiPropertyOptional({ description: 'Last updated timestamp' })
  updatedAt: string;
}
