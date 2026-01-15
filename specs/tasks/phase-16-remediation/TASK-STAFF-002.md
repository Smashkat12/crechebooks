<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-002</task_id>
    <title>Add Class-Validator to Staff DTOs</title>
    <priority>CRITICAL</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>validation</category>
    <estimated_effort>4 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-20</due_date>
    <tags>validation, dto, class-validator, security, critical-fix</tags>
  </metadata>

  <context>
    <problem_statement>
      Staff DTOs are missing class-validator decorators, allowing invalid or malicious data
      to pass through the API layer without validation. This creates security vulnerabilities
      and data integrity issues as unvalidated input reaches the business logic and database.
    </problem_statement>

    <business_impact>
      - Security vulnerability: unvalidated input can lead to injection attacks
      - Data integrity issues: invalid data stored in database
      - Runtime errors from unexpected data types/formats
      - Poor error messages to API consumers
      - Potential POPIA compliance issues with invalid personal data
    </business_impact>

    <technical_background>
      NestJS uses class-validator and class-transformer for automatic request validation
      when ValidationPipe is enabled. Without decorators on DTOs, validation is bypassed
      and raw request data passes through unchecked.
    </technical_background>

    <dependencies>
      - class-validator package installed
      - class-transformer package installed
      - Global ValidationPipe configured in main.ts
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Add validation decorators to all Staff DTOs</item>
      <item>Add proper type transformations with class-transformer</item>
      <item>Add custom validation messages for better error responses</item>
      <item>Ensure all nested DTOs are properly validated</item>
      <item>Add SA-specific validations (ID number, tax number formats)</item>
    </in_scope>

    <out_of_scope>
      <item>DTOs in other modules (separate tasks)</item>
      <item>Custom validation decorator creation</item>
      <item>API response transformation</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/staff/dto/create-staff.dto.ts</file>
      <file action="modify">apps/api/src/staff/dto/update-staff.dto.ts</file>
      <file action="modify">apps/api/src/staff/dto/staff-query.dto.ts</file>
      <file action="modify">apps/api/src/staff/dto/staff-leave.dto.ts</file>
      <file action="modify">apps/api/src/staff/dto/staff-payroll.dto.ts</file>
      <file action="create">apps/api/src/staff/dto/staff-bank-details.dto.ts</file>
      <file action="create">apps/api/src/common/validators/sa-id-number.validator.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Systematically add class-validator decorators to each Staff DTO, ensuring proper
      validation for all fields including SA-specific formats like ID numbers and tax numbers.
    </approach>

    <steps>
      <step order="1">
        <description>Audit all Staff DTOs and document required validations</description>
        <details>
          Review each DTO file and list all properties with their expected types and constraints.
        </details>
      </step>

      <step order="2">
        <description>Add validators to CreateStaffDto</description>
        <details>
          ```typescript
          import {
            IsString, IsEmail, IsOptional, IsNumber, IsEnum,
            IsDateString, Length, Matches, ValidateNested, IsNotEmpty
          } from 'class-validator';
          import { Type, Transform } from 'class-transformer';

          export class CreateStaffDto {
            @IsString({ message: 'First name must be a string' })
            @IsNotEmpty({ message: 'First name is required' })
            @Length(1, 100, { message: 'First name must be between 1 and 100 characters' })
            firstName: string;

            @IsString({ message: 'Last name must be a string' })
            @IsNotEmpty({ message: 'Last name is required' })
            @Length(1, 100, { message: 'Last name must be between 1 and 100 characters' })
            lastName: string;

            @IsEmail({}, { message: 'Invalid email format' })
            @IsNotEmpty({ message: 'Email is required' })
            email: string;

            @IsString()
            @IsOptional()
            @Matches(/^(\+27|0)[6-8][0-9]{8}$/, { message: 'Invalid SA phone number format' })
            phoneNumber?: string;

            @IsString()
            @IsNotEmpty({ message: 'ID number is required' })
            @Matches(/^[0-9]{13}$/, { message: 'SA ID number must be 13 digits' })
            idNumber: string;

            @IsString()
            @IsOptional()
            @Matches(/^[0-9]{10}$/, { message: 'Tax number must be 10 digits' })
            taxNumber?: string;

            @IsDateString({}, { message: 'Invalid date format for start date' })
            @IsNotEmpty({ message: 'Start date is required' })
            startDate: string;

            @IsNumber({}, { message: 'Salary must be a number' })
            @IsNotEmpty({ message: 'Salary is required' })
            @Type(() => Number)
            salary: number;

            @IsEnum(EmploymentType, { message: 'Invalid employment type' })
            @IsNotEmpty({ message: 'Employment type is required' })
            employmentType: EmploymentType;

            @ValidateNested()
            @Type(() => StaffBankDetailsDto)
            @IsOptional()
            bankDetails?: StaffBankDetailsDto;
          }
          ```
        </details>
      </step>

      <step order="3">
        <description>Add validators to UpdateStaffDto</description>
        <details>
          Use PartialType from @nestjs/mapped-types to inherit validations as optional:
          ```typescript
          import { PartialType } from '@nestjs/mapped-types';
          import { CreateStaffDto } from './create-staff.dto';

          export class UpdateStaffDto extends PartialType(CreateStaffDto) {
            // Additional update-specific fields if needed
          }
          ```
        </details>
      </step>

      <step order="4">
        <description>Add validators to StaffQueryDto</description>
        <details>
          ```typescript
          export class StaffQueryDto {
            @IsOptional()
            @IsString()
            search?: string;

            @IsOptional()
            @IsEnum(EmploymentType)
            employmentType?: EmploymentType;

            @IsOptional()
            @IsEnum(StaffStatus)
            status?: StaffStatus;

            @IsOptional()
            @IsNumber()
            @Type(() => Number)
            @Min(1)
            page?: number = 1;

            @IsOptional()
            @IsNumber()
            @Type(() => Number)
            @Min(1)
            @Max(100)
            limit?: number = 20;
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Add validators to StaffLeaveDto</description>
        <details>
          ```typescript
          export class StaffLeaveDto {
            @IsUUID()
            @IsNotEmpty()
            staffId: string;

            @IsEnum(LeaveType, { message: 'Invalid leave type' })
            @IsNotEmpty()
            leaveType: LeaveType;

            @IsDateString()
            @IsNotEmpty()
            startDate: string;

            @IsDateString()
            @IsNotEmpty()
            endDate: string;

            @IsString()
            @IsOptional()
            @MaxLength(500)
            reason?: string;
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Add validators to StaffPayrollDto</description>
        <details>
          ```typescript
          export class StaffPayrollDto {
            @IsUUID()
            @IsNotEmpty()
            staffId: string;

            @IsNumber()
            @IsNotEmpty()
            @Type(() => Number)
            @Min(0)
            basicSalary: number;

            @IsNumber()
            @IsOptional()
            @Type(() => Number)
            @Min(0)
            overtime?: number;

            @IsNumber()
            @IsOptional()
            @Type(() => Number)
            @Min(0)
            deductions?: number;

            @IsString()
            @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Pay period must be YYYY-MM format' })
            payPeriod: string;
          }
          ```
        </details>
      </step>

      <step order="7">
        <description>Create StaffBankDetailsDto with validators</description>
        <details>
          ```typescript
          export class StaffBankDetailsDto {
            @IsString()
            @IsNotEmpty()
            bankName: string;

            @IsString()
            @IsNotEmpty()
            @Matches(/^[0-9]{6}$/, { message: 'Branch code must be 6 digits' })
            branchCode: string;

            @IsString()
            @IsNotEmpty()
            @Matches(/^[0-9]{8,15}$/, { message: 'Account number must be 8-15 digits' })
            accountNumber: string;

            @IsEnum(BankAccountType)
            @IsNotEmpty()
            accountType: BankAccountType;
          }
          ```
        </details>
      </step>

      <step order="8">
        <description>Create custom SA ID number validator</description>
        <details>
          ```typescript
          import { registerDecorator, ValidationOptions } from 'class-validator';

          export function IsValidSAIDNumber(validationOptions?: ValidationOptions) {
            return function (object: Object, propertyName: string) {
              registerDecorator({
                name: 'isValidSAIDNumber',
                target: object.constructor,
                propertyName: propertyName,
                options: validationOptions,
                validator: {
                  validate(value: any) {
                    if (typeof value !== 'string' || value.length !== 13) return false;
                    // Luhn algorithm check for SA ID numbers
                    let sum = 0;
                    for (let i = 0; i < 13; i++) {
                      let digit = parseInt(value[i]);
                      if (i % 2 === 1) {
                        digit *= 2;
                        if (digit > 9) digit -= 9;
                      }
                      sum += digit;
                    }
                    return sum % 10 === 0;
                  },
                  defaultMessage() {
                    return 'Invalid South African ID number';
                  }
                }
              });
            };
          }
          ```
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Optional with Default">
        ```typescript
        @IsOptional()
        @IsNumber()
        @Type(() => Number)
        @Min(1)
        page?: number = 1;
        ```
      </pattern>

      <pattern name="Nested Object Validation">
        ```typescript
        @ValidateNested()
        @Type(() => NestedDto)
        @IsOptional()
        nestedObject?: NestedDto;
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test CreateStaffDto validation with valid data</description>
        <file>apps/api/src/staff/dto/__tests__/create-staff.dto.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test CreateStaffDto validation with invalid data</description>
        <file>apps/api/src/staff/dto/__tests__/create-staff.dto.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test SA ID number validator</description>
        <file>apps/api/src/common/validators/__tests__/sa-id-number.validator.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test staff controller with validation pipe</description>
        <file>apps/api/src/staff/__tests__/staff.controller.spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>All Staff DTO properties have appropriate validation decorators</criterion>
      <criterion>Invalid requests return 400 status with descriptive error messages</criterion>
      <criterion>SA-specific formats (ID, phone, tax number) are validated</criterion>
      <criterion>Nested DTOs are properly validated</criterion>
      <criterion>Type transformations work correctly for numeric fields</criterion>
      <criterion>Optional fields allow undefined/null when appropriate</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>All Staff DTOs have validation decorators on every property</item>
      <item>Custom SA ID validator created and tested</item>
      <item>Error messages are user-friendly and specific</item>
      <item>Unit tests cover all validation scenarios</item>
      <item>Integration tests verify ValidationPipe works correctly</item>
      <item>No TypeScript errors</item>
      <item>Code reviewed and approved</item>
      <item>API documentation updated with validation rules</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="documentation">https://docs.nestjs.com/techniques/validation</reference>
    <reference type="package">https://github.com/typestack/class-validator</reference>
    <reference type="specification">SA ID Number Format: YYMMDD SSSS C A Z</reference>
  </references>
</task_specification>
