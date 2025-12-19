/**
 * User DTOs
 * TASK-CORE-003: User Entity and Authentication Types
 *
 * @module database/dto/user
 * @description Data Transfer Objects for User entity with validation
 */
import {
  IsUUID,
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsDate,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

/**
 * DTO for creating a new user
 * All fields required except isActive (defaults to true)
 *
 * @class CreateUserDto
 */
export class CreateUserDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  auth0Id!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for updating an existing user
 * All fields optional - only provided fields will be updated
 *
 * @class UpdateUserDto
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastLoginAt?: Date;
}
