<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-006</task_id>
    <title>Add Input Validation Before DB Query</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <category>Security</category>
    <phase>16-remediation</phase>
    <estimated_effort>3 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>input-validation</tag>
      <tag>whatsapp</tag>
      <tag>injection-prevention</tag>
      <tag>class-validator</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The WhatsApp service processes incoming phone numbers from webhook payloads
      without proper validation before using them in database queries. This creates
      potential security vulnerabilities including SQL injection (if using raw queries),
      NoSQL injection, or unexpected behavior from malformed input.
    </background>
    <issue_description>
      HIGH - Phone number not validated before database query. User-supplied phone
      numbers from WhatsApp webhooks are used directly in database queries without
      sanitization or format validation, creating injection risks and data integrity
      issues.
    </issue_description>
    <business_impact>
      - Potential database injection attacks
      - Data corruption from malformed phone numbers
      - Service disruption from unexpected query behavior
      - Difficulty tracking and auditing message sources
      - Compliance issues with data validation requirements
    </business_impact>
    <technical_debt>
      Input validation is a fundamental security practice that should be applied
      consistently to all external input, especially data used in database operations.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Add phone number format validation</item>
      <item>Create validation DTOs for WhatsApp payloads</item>
      <item>Implement sanitization for phone numbers</item>
      <item>Add validation decorators using class-validator</item>
      <item>Handle validation errors gracefully</item>
    </in_scope>
    <out_of_scope>
      <item>Message content validation (separate concern)</item>
      <item>Database schema changes</item>
      <item>Phone number normalization for display</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/integrations/whatsapp/whatsapp.service.ts</file>
      <file>apps/api/src/integrations/whatsapp/dto/whatsapp-webhook.dto.ts (new)</file>
      <file>apps/api/src/integrations/whatsapp/validators/phone-number.validator.ts (new)</file>
      <file>apps/api/src/integrations/whatsapp/whatsapp.service.spec.ts</file>
    </affected_files>
    <dependencies>
      <dependency>TASK-INT-005 - WhatsApp webhook security (related)</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement comprehensive input validation using class-validator and custom
      validators for phone numbers. Validate all incoming data from WhatsApp webhooks
      before any database operations. Use DTOs with validation decorators to enforce
      data integrity.
    </approach>
    <steps>
      <step order="1">
        <description>Create phone number validator</description>
        <details>
          Create a custom validator for E.164 phone number format validation,
          which is the standard used by WhatsApp.
        </details>
        <code_example>
```typescript
// apps/api/src/integrations/whatsapp/validators/phone-number.validator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * E.164 phone number format regex
 * Matches: +[country code][subscriber number]
 * Length: 8 to 15 digits total (excluding +)
 */
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * WhatsApp phone number format (without + prefix)
 * WhatsApp API sends numbers without the + prefix
 */
const WHATSAPP_PHONE_REGEX = /^[1-9]\d{7,14}$/;

@ValidatorConstraint({ name: 'isPhoneNumber', async: false })
export class IsPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Check for E.164 format (with +) or WhatsApp format (without +)
    return E164_REGEX.test(value) || WHATSAPP_PHONE_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Phone number must be in E.164 format (e.g., +14155551234 or 14155551234)';
  }
}

export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPhoneNumberConstraint,
    });
  };
}

/**
 * Utility to normalize phone numbers to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) {
    throw new Error('Phone number is required');
  }

  // Remove any whitespace
  let normalized = phone.replace(/\s/g, '');

  // Remove common separators
  normalized = normalized.replace(/[-().]/g, '');

  // Add + prefix if missing
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  // Validate final format
  if (!E164_REGEX.test(normalized)) {
    throw new Error(`Invalid phone number format: ${phone}`);
  }

  return normalized;
}

/**
 * Sanitizes phone number input to prevent injection
 * Only allows digits and + sign
 */
export function sanitizePhoneNumber(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Phone number must be a string');
  }

  // Only allow digits and optional leading +
  return input.replace(/[^\d+]/g, '');
}
```
        </code_example>
      </step>
      <step order="2">
        <description>Create WhatsApp webhook DTOs</description>
        <details>
          Create Data Transfer Objects with validation decorators for all
          WhatsApp webhook payload structures.
        </details>
        <code_example>
```typescript
// apps/api/src/integrations/whatsapp/dto/whatsapp-webhook.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPhoneNumber } from '../validators/phone-number.validator';

export enum WhatsAppMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  VIDEO = 'video',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACTS = 'contacts',
  INTERACTIVE = 'interactive',
  BUTTON = 'button',
  REACTION = 'reaction',
}

export class WhatsAppContactDto {
  @IsPhoneNumber()
  @IsNotEmpty()
  wa_id: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  profile?: { name: string };
}

export class WhatsAppTextMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096) // WhatsApp text message limit
  body: string;
}

export class WhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @IsPhoneNumber()
  @IsNotEmpty()
  from: string;

  @IsNumber()
  timestamp: number;

  @IsEnum(WhatsAppMessageType)
  type: WhatsAppMessageType;

  @ValidateNested()
  @Type(() => WhatsAppTextMessageDto)
  @IsOptional()
  text?: WhatsAppTextMessageDto;
}

export class WhatsAppMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  display_phone_number: string;

  @IsPhoneNumber()
  @IsNotEmpty()
  phone_number_id: string;
}

export class WhatsAppValueDto {
  @IsString()
  @IsNotEmpty()
  messaging_product: string;

  @ValidateNested()
  @Type(() => WhatsAppMetadataDto)
  metadata: WhatsAppMetadataDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppContactDto)
  @IsOptional()
  contacts?: WhatsAppContactDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppMessageDto)
  @IsOptional()
  messages?: WhatsAppMessageDto[];
}

export class WhatsAppChangeDto {
  @IsString()
  @IsNotEmpty()
  field: string;

  @ValidateNested()
  @Type(() => WhatsAppValueDto)
  value: WhatsAppValueDto;
}

export class WhatsAppEntryDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppChangeDto)
  changes: WhatsAppChangeDto[];
}

export class WhatsAppWebhookDto {
  @IsString()
  @IsNotEmpty()
  object: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppEntryDto)
  entry: WhatsAppEntryDto[];
}
```
        </code_example>
      </step>
      <step order="3">
        <description>Update WhatsApp service with validation</description>
        <details>
          Modify the WhatsApp service to validate and sanitize phone numbers
          before any database operations.
        </details>
        <code_example>
```typescript
// apps/api/src/integrations/whatsapp/whatsapp.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  WhatsAppWebhookDto,
  WhatsAppMessageDto
} from './dto/whatsapp-webhook.dto';
import {
  sanitizePhoneNumber,
  normalizePhoneNumber
} from './validators/phone-number.validator';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  /**
   * Process incoming WhatsApp webhook with full validation
   */
  async processWebhook(payload: any): Promise<void> {
    // Transform and validate the entire payload
    const webhookDto = plainToInstance(WhatsAppWebhookDto, payload);
    const errors = await validate(webhookDto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      this.logger.warn('Invalid webhook payload', {
        errors: errors.map(e => ({
          property: e.property,
          constraints: e.constraints,
        })),
      });
      throw new BadRequestException('Invalid webhook payload format');
    }

    // Process validated messages
    for (const entry of webhookDto.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            await this.processMessage(message);
          }
        }
      }
    }
  }

  /**
   * Process a validated WhatsApp message
   */
  private async processMessage(message: WhatsAppMessageDto): Promise<void> {
    // Additional sanitization for phone number before DB query
    const sanitizedPhone = sanitizePhoneNumber(message.from);
    const normalizedPhone = normalizePhoneNumber(sanitizedPhone);

    this.logger.debug('Processing message', {
      messageId: message.id,
      from: normalizedPhone, // Log normalized, not raw
      type: message.type,
    });

    // Find or create contact using validated phone number
    let contact = await this.findContactByPhone(normalizedPhone);

    if (!contact) {
      contact = await this.createContact(normalizedPhone);
    }

    // Store message with validated data
    await this.storeMessage(message, contact);
  }

  /**
   * Find contact by phone number using parameterized query
   */
  private async findContactByPhone(phone: string): Promise<Contact | null> {
    // Validate phone format one more time before query
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Use parameterized query - never interpolate phone into query string
    return this.contactRepository.findOne({
      where: { phoneNumber: phone },
    });
  }

  /**
   * Create new contact with validated phone number
   */
  private async createContact(phone: string): Promise<Contact> {
    // Final validation before insert
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new BadRequestException('Invalid phone number format');
    }

    const contact = this.contactRepository.create({
      phoneNumber: phone,
      source: 'whatsapp',
      createdAt: new Date(),
    });

    return this.contactRepository.save(contact);
  }

  /**
   * Store message with validated data
   */
  private async storeMessage(
    message: WhatsAppMessageDto,
    contact: Contact,
  ): Promise<void> {
    const messageEntity = this.messageRepository.create({
      externalId: message.id,
      contactId: contact.id,
      type: message.type,
      content: message.text?.body ?? null,
      timestamp: new Date(message.timestamp * 1000),
      direction: 'inbound',
    });

    await this.messageRepository.save(messageEntity);
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Add validation pipe to controller</description>
        <details>
          Configure the webhook controller to use NestJS validation pipe for
          automatic DTO validation.
        </details>
        <code_example>
```typescript
// In controller
@Post()
@UsePipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}))
async handleWebhook(
  @Body() body: WhatsAppWebhookDto,
): Promise<{ status: string }> {
  // Body is now validated
  await this.whatsappService.processWebhook(body);
  return { status: 'ok' };
}
```
        </code_example>
      </step>
      <step order="5">
        <description>Write comprehensive tests</description>
        <details>
          Test validation for valid phones, invalid formats, injection attempts,
          edge cases, and error handling.
        </details>
      </step>
    </steps>
    <technical_notes>
      - E.164 is the international phone number format used by WhatsApp
      - WhatsApp may send numbers without + prefix
      - Always use parameterized queries, never interpolate user input
      - Validate at multiple layers: controller (DTO), service (before query)
      - Consider rate limiting to prevent enumeration attacks
      - Log validation failures for security monitoring
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>Valid E.164 phone number passes validation</description>
        <expected_result>Phone number accepted and processed</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>Phone number without + prefix passes validation</description>
        <expected_result>Phone number normalized and processed</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Invalid phone format is rejected</description>
        <expected_result>BadRequestException thrown</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>SQL injection attempt is rejected</description>
        <expected_result>Malicious input sanitized or rejected</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>NoSQL injection attempt is rejected</description>
        <expected_result>Malicious input sanitized or rejected</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Extremely long phone number is rejected</description>
        <expected_result>Validation error for length violation</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>Non-string phone number is rejected</description>
        <expected_result>Type validation error</expected_result>
      </test_case>
      <test_case>
        <id>TC-008</id>
        <description>Empty phone number is rejected</description>
        <expected_result>Required field validation error</expected_result>
      </test_case>
      <test_case>
        <id>TC-009</id>
        <description>Phone with special characters is sanitized</description>
        <expected_result>Characters removed, valid number processed</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>All phone numbers validated before database queries</criterion>
      <criterion>E.164 format validation implemented</criterion>
      <criterion>Injection attempts are blocked</criterion>
      <criterion>DTOs created for all webhook payload types</criterion>
      <criterion>Validation errors return appropriate error responses</criterion>
      <criterion>Parameterized queries used exclusively</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Phone number validator created</item>
      <item>WhatsApp webhook DTOs with validation created</item>
      <item>Service validates input before all DB operations</item>
      <item>Sanitization removes dangerous characters</item>
      <item>Parameterized queries used throughout</item>
      <item>Validation pipe configured on controller</item>
      <item>Unit tests for validator</item>
      <item>Unit tests for DTOs</item>
      <item>Integration tests for webhook processing</item>
      <item>Security tests for injection attempts</item>
      <item>Code reviewed</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
