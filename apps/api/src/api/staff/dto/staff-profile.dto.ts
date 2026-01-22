import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  MaxLength,
  MinLength,
  IsPhoneNumber,
} from 'class-validator';

/**
 * Staff Profile and Tax Documents DTOs
 * TASK-PORTAL-025: Staff Portal Tax Documents and Profile
 *
 * DTOs for:
 * - IRP5 tax certificates (South African employee tax certificates)
 * - Staff profile information with editable and read-only fields
 * - Banking details (masked for security)
 * - Emergency contact information
 */

// ============================================================================
// IRP5 Tax Document DTOs
// ============================================================================

export enum IRP5Status {
  AVAILABLE = 'available',
  PENDING = 'pending',
  PROCESSING = 'processing',
}

export class IRP5DocumentDto {
  @ApiProperty({
    description: 'Unique identifier for the IRP5 certificate',
    example: 'irp5-2024-001',
  })
  id: string;

  @ApiProperty({
    description: 'Tax year for the certificate (e.g., 2024 for 2023/2024 tax year)',
    example: 2024,
  })
  taxYear: number;

  @ApiProperty({
    description: 'Display name for the tax year period',
    example: '2023/2024',
  })
  taxYearPeriod: string;

  @ApiProperty({
    description: 'Status of the IRP5 certificate',
    enum: IRP5Status,
    example: IRP5Status.AVAILABLE,
  })
  status: IRP5Status;

  @ApiProperty({
    description: 'Date when the certificate became available',
    example: '2024-03-01',
  })
  availableDate: Date;

  @ApiPropertyOptional({
    description: 'Reference number from SARS',
    example: 'IRP5/2024/123456',
  })
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Last download date if previously downloaded',
  })
  lastDownloadDate?: Date;
}

export class IRP5ListResponseDto {
  @ApiProperty({
    type: [IRP5DocumentDto],
    description: 'List of available IRP5 certificates',
  })
  data: IRP5DocumentDto[];

  @ApiProperty({
    description: 'Total number of certificates',
    example: 5,
  })
  total: number;

  @ApiProperty({
    description: 'Available tax years for filtering',
    example: [2024, 2023, 2022, 2021, 2020],
    isArray: true,
    type: Number,
  })
  availableYears: number[];
}

// ============================================================================
// Staff Profile DTOs
// ============================================================================

export class PersonalInfoDto {
  @ApiProperty({
    description: 'Full legal name (read-only)',
    example: 'Thandi Nkosi',
  })
  fullName: string;

  @ApiProperty({
    description: 'South African ID number (partially masked)',
    example: '******1234085',
  })
  idNumber: string;

  @ApiProperty({
    description: 'Date of birth',
    example: '1990-05-15',
  })
  dateOfBirth: Date;

  @ApiProperty({
    description: 'Phone number (editable)',
    example: '+27 82 123 4567',
  })
  phone: string;

  @ApiProperty({
    description: 'Email address (editable)',
    example: 'thandi.nkosi@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Residential address (editable)',
    example: '123 Main Street, Sandton, Johannesburg, 2196',
  })
  address: string;
}

export class EmploymentInfoDto {
  @ApiProperty({
    description: 'Job position/title (read-only)',
    example: 'Early Childhood Development Practitioner',
  })
  position: string;

  @ApiProperty({
    description: 'Department (read-only)',
    example: 'Education',
  })
  department: string;

  @ApiProperty({
    description: 'Employment start date (read-only)',
    example: '2023-03-15',
  })
  startDate: Date;

  @ApiProperty({
    description: 'Employment type (read-only)',
    example: 'Full-time',
  })
  employmentType: string;

  @ApiProperty({
    description: 'Employee number (read-only)',
    example: 'EMP-001',
  })
  employeeNumber: string;

  @ApiPropertyOptional({
    description: 'Manager name (read-only)',
    example: 'Sarah Manager',
  })
  managerName?: string;
}

export class BankingDetailsDto {
  @ApiProperty({
    description: 'Bank name (read-only)',
    example: 'First National Bank',
  })
  bankName: string;

  @ApiProperty({
    description: 'Account number (masked, showing only last 4 digits)',
    example: '****4521',
  })
  accountNumber: string;

  @ApiProperty({
    description: 'Branch code (read-only)',
    example: '250655',
  })
  branchCode: string;

  @ApiProperty({
    description: 'Account type (read-only)',
    example: 'Cheque Account',
  })
  accountType: string;

  @ApiProperty({
    description: 'Information note about updating banking details',
    example: 'To update banking details, please contact HR directly.',
  })
  updateNote: string;
}

export class EmergencyContactDto {
  @ApiProperty({
    description: 'Emergency contact name (editable)',
    example: 'Sipho Nkosi',
  })
  contactName: string;

  @ApiProperty({
    description: 'Relationship to employee (editable)',
    example: 'Spouse',
  })
  relationship: string;

  @ApiProperty({
    description: 'Emergency contact phone number (editable)',
    example: '+27 83 987 6543',
  })
  contactPhone: string;

  @ApiPropertyOptional({
    description: 'Alternative contact number',
    example: '+27 11 123 4567',
  })
  alternatePhone?: string;
}

export class CommunicationPreferencesDto {
  @ApiProperty({
    description: 'Receive payslip notifications via email',
    example: true,
  })
  emailPayslipNotifications: boolean;

  @ApiProperty({
    description: 'Receive leave approval notifications',
    example: true,
  })
  emailLeaveNotifications: boolean;

  @ApiProperty({
    description: 'Receive tax document availability notifications',
    example: true,
  })
  emailTaxDocNotifications: boolean;

  @ApiProperty({
    description: 'Preferred language for communications',
    example: 'en-ZA',
  })
  preferredLanguage: string;
}

export class StaffProfileDto {
  @ApiProperty({
    type: PersonalInfoDto,
    description: 'Personal information section',
  })
  personal: PersonalInfoDto;

  @ApiProperty({
    type: EmploymentInfoDto,
    description: 'Employment information section (read-only)',
  })
  employment: EmploymentInfoDto;

  @ApiProperty({
    type: BankingDetailsDto,
    description: 'Banking details section (read-only, masked)',
  })
  banking: BankingDetailsDto;

  @ApiProperty({
    type: EmergencyContactDto,
    description: 'Emergency contact section (editable)',
  })
  emergency: EmergencyContactDto;

  @ApiProperty({
    type: CommunicationPreferencesDto,
    description: 'Communication preferences section (editable)',
  })
  preferences: CommunicationPreferencesDto;

  @ApiProperty({
    description: 'Last profile update timestamp',
  })
  lastUpdated: Date;
}

// ============================================================================
// Update Profile DTOs
// ============================================================================

export class UpdateAddressDto {
  @ApiProperty({
    description: 'Street address line 1',
    example: '123 Main Street',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  streetAddress: string;

  @ApiPropertyOptional({
    description: 'Street address line 2 (apartment, suite, etc.)',
    example: 'Unit 5',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  streetAddress2?: string;

  @ApiProperty({
    description: 'Suburb/area',
    example: 'Sandton',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  suburb: string;

  @ApiProperty({
    description: 'City',
    example: 'Johannesburg',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  city: string;

  @ApiProperty({
    description: 'Province',
    example: 'Gauteng',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  province: string;

  @ApiProperty({
    description: 'Postal code',
    example: '2196',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  postalCode: string;
}

export class UpdateEmergencyContactDto {
  @ApiProperty({
    description: 'Emergency contact name',
    example: 'Sipho Nkosi',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  contactName: string;

  @ApiProperty({
    description: 'Relationship to employee',
    example: 'Spouse',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  relationship: string;

  @ApiProperty({
    description: 'Emergency contact phone number',
    example: '+27 83 987 6543',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  contactPhone: string;

  @ApiPropertyOptional({
    description: 'Alternative contact number',
    example: '+27 11 123 4567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  alternatePhone?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+27 82 123 4567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'thandi.nkosi@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    type: UpdateAddressDto,
    description: 'Residential address',
  })
  @IsOptional()
  address?: UpdateAddressDto;

  @ApiPropertyOptional({
    type: UpdateEmergencyContactDto,
    description: 'Emergency contact information',
  })
  @IsOptional()
  emergency?: UpdateEmergencyContactDto;

  @ApiPropertyOptional({
    type: CommunicationPreferencesDto,
    description: 'Communication preferences',
  })
  @IsOptional()
  preferences?: Partial<CommunicationPreferencesDto>;
}

export class ProfileUpdateSuccessDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Profile updated successfully',
  })
  message: string;

  @ApiProperty({
    type: StaffProfileDto,
    description: 'Updated profile data',
  })
  profile: StaffProfileDto;
}
