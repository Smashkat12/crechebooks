import {
  IsUUID,
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PreferredContact } from '../entities/parent.entity';

export class CreateParentDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;

  @IsOptional()
  @IsEnum(PreferredContact)
  preferredContact?: PreferredContact;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  idNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateParentDto extends PartialType(CreateParentDto) {}

export class ParentFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
