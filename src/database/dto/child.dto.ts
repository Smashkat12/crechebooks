import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { Gender } from '../entities/child.entity';

export class CreateChildDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  parentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @Type(() => Date)
  @IsDate()
  dateOfBirth!: Date;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;
}

export class UpdateChildDto extends PartialType(CreateChildDto) {}

export class ChildFilterDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
