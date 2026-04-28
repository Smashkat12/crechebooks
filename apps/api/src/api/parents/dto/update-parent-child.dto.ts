/**
 * Update Parent Child DTO
 * Parent portal: whitelisted partial update of identity + non-identity child fields.
 *
 * Editable by parent (Option A — medicalNotes is the catch-all for allergies/conditions):
 *   - firstName:         identity field; sanitized + normalized; max 100 chars
 *   - lastName:          identity field; sanitized + normalized; max 100 chars
 *   - gender:            identity field; Gender enum (MALE | FEMALE | OTHER); max 30 chars
 *   - medicalNotes:      free text; HTML-stripped; max 2000 chars
 *   - emergencyContact:  free-text contact description; HTML-stripped; max 200 chars
 *   - emergencyPhone:    SA phone format; sanitized + pattern-validated; max 20 chars
 *
 * NOT editable by parent (admin-only):
 *   - dateOfBirth: drives graduation-cohort flag in enrollment.service.ts:1079-1081; admin only
 *
 * Schema reality: the Child model has `emergencyContact` (VarChar 200) and
 * `emergencyPhone` (VarChar 20) as its emergency fields. The separate
 * emergencyContactName / emergencyContactPhone / emergencyContactRelation columns
 * exist only on the Staff model, not Child.
 */

import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  SanitizeName,
  SanitizeText,
  SanitizePhone,
} from '../../../common/utils/sanitize.utils';
import { IsSAPhoneNumber } from '../../../shared/validators';
import { normalizeName } from '../../../common/utils/name-normalizer';
import { Gender } from '../../../database/entities/child.entity';

export class UpdateParentChildDto {
  /**
   * Child's first name.
   * HTML-stripped, control-char-collapsed, and case-normalized (all-caps/all-lower corrected).
   * Max 100 chars.
   */
  @ApiPropertyOptional({
    description: "Child's first name. Max 100 chars.",
    maxLength: 100,
    example: 'Amelia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeName(value))
  @SanitizeName()
  firstName?: string;

  /**
   * Child's middle name.
   * HTML-stripped, control-char-collapsed, and case-normalized (all-caps/all-lower corrected).
   * Max 100 chars. Optional — pass null to clear.
   */
  @ApiPropertyOptional({
    description: "Child's middle name. Max 100 chars.",
    maxLength: 100,
    example: 'Rose',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeName(value))
  @SanitizeName()
  middleName?: string | null;

  /**
   * Child's last name.
   * HTML-stripped, control-char-collapsed, and case-normalized (all-caps/all-lower corrected).
   * Max 100 chars.
   */
  @ApiPropertyOptional({
    description: "Child's last name. Max 100 chars.",
    maxLength: 100,
    example: 'Smith',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => normalizeName(value))
  @SanitizeName()
  lastName?: string;

  /**
   * Child's gender (MALE | FEMALE | OTHER).
   * Uses the Prisma-generated Gender enum. Max 30 chars.
   */
  @ApiPropertyOptional({
    description: "Child's gender.",
    enum: Gender,
    example: Gender.FEMALE,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsEnum(Gender)
  gender?: Gender;

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
 * Includes identity fields that the parent is now allowed to edit.
 */
export class ParentChildUpdateResponseDto {
  @ApiPropertyOptional({ description: 'Child ID' })
  id: string;

  @ApiPropertyOptional({ description: "Child's first name" })
  firstName: string | null;

  @ApiPropertyOptional({ description: "Child's middle name", nullable: true })
  middleName: string | null;

  @ApiPropertyOptional({ description: "Child's last name" })
  lastName: string | null;

  @ApiPropertyOptional({ description: "Child's gender", enum: Gender })
  gender: Gender | null;

  @ApiPropertyOptional({ description: 'Medical notes / allergies' })
  medicalNotes: string | null;

  @ApiPropertyOptional({ description: 'Emergency contact (name + relation)' })
  emergencyContact: string | null;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  emergencyPhone: string | null;

  @ApiPropertyOptional({ description: 'Last updated timestamp' })
  updatedAt: string;
}
