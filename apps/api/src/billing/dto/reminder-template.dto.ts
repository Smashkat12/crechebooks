/**
 * Reminder Template DTOs
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 *
 * @module billing/dto/reminder-template
 * @description DTOs for managing tenant-customizable reminder templates
 * with stage-based escalation and multi-channel support.
 */

import {
  IsString,
  IsInt,
  IsArray,
  IsBoolean,
  IsOptional,
  IsEnum,
  Min,
  Max,
  ArrayNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Reminder stage based on days overdue
 */
export enum ReminderStage {
  FIRST = 'FIRST',
  SECOND = 'SECOND',
  FINAL = 'FINAL',
  ESCALATED = 'ESCALATED',
}

/**
 * Delivery channel for reminders
 */
export enum ReminderChannel {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
}

/**
 * DTO for creating or updating a reminder template
 */
export class CreateReminderTemplateDto {
  @IsEnum(ReminderStage)
  stage!: ReminderStage;

  @IsInt()
  @Min(1)
  @Max(365)
  daysOverdue!: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ReminderChannel, { each: true })
  channels!: ReminderChannel[];

  @ValidateIf((o) => o.channels?.includes(ReminderChannel.EMAIL))
  @IsString()
  @IsOptional()
  emailSubject?: string;

  @ValidateIf((o) => o.channels?.includes(ReminderChannel.EMAIL))
  @IsString()
  @IsOptional()
  emailBody?: string;

  @ValidateIf((o) => o.channels?.includes(ReminderChannel.WHATSAPP))
  @IsString()
  @IsOptional()
  whatsappBody?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * DTO for updating a reminder template
 */
export class UpdateReminderTemplateDto {
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  daysOverdue?: number;

  @IsArray()
  @IsEnum(ReminderChannel, { each: true })
  @IsOptional()
  channels?: ReminderChannel[];

  @IsString()
  @IsOptional()
  emailSubject?: string;

  @IsString()
  @IsOptional()
  emailBody?: string;

  @IsString()
  @IsOptional()
  whatsappBody?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * Response DTO for reminder template
 */
export interface ReminderTemplateResponse {
  id: string;
  tenantId: string;
  stage: ReminderStage;
  daysOverdue: number;
  channels: ReminderChannel[];
  emailSubject: string | null;
  emailBody: string | null;
  whatsappBody: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Template variables for rendering
 */
export interface TemplateVariables {
  /** Parent's first name */
  parentName: string;
  /** Child's first name */
  childName: string;
  /** Invoice number for reference */
  invoiceNumber: string;
  /** Outstanding amount formatted (e.g., "R1,500.00") */
  amount: string;
  /** Due date formatted (e.g., "15 January 2025") */
  dueDate: string;
  /** Number of days overdue */
  daysOverdue: string;
  /** Creche/tenant name */
  crecheName: string;
  /** Creche phone number */
  crechePhone: string;
  /** Creche email address */
  crecheEmail: string;
  /** Bank name for payment */
  bankName?: string;
  /** Account number for payment */
  accountNumber?: string;
  /** Branch code for payment */
  branchCode?: string;
}

/**
 * Default template content for each stage
 */
export interface DefaultTemplateContent {
  stage: ReminderStage;
  daysOverdue: number;
  channels: ReminderChannel[];
  emailSubject: string;
  emailBody: string;
  whatsappBody: string;
}

/**
 * Default reminder templates based on escalation stages
 */
export const DEFAULT_TEMPLATES: DefaultTemplateContent[] = [
  {
    stage: ReminderStage.FIRST,
    daysOverdue: 7,
    channels: [ReminderChannel.EMAIL],
    emailSubject: 'Friendly Reminder: Invoice {{invoiceNumber}} Payment Due',
    emailBody: `Dear {{parentName}},

We hope this message finds you well. This is a friendly reminder that payment for {{childName}}'s invoice {{invoiceNumber}} is now {{daysOverdue}} days overdue.

Outstanding Amount: {{amount}}
Original Due Date: {{dueDate}}

We understand that things can sometimes slip through the cracks. Please arrange payment at your earliest convenience.

If you have already made the payment, please disregard this message and accept our apologies for any confusion.

If you have any questions or need to discuss payment arrangements, please don't hesitate to contact us.

Kind regards,
{{crecheName}}
{{crechePhone}}
{{crecheEmail}}`,
    whatsappBody: `Hi {{parentName}}, this is a friendly reminder that invoice {{invoiceNumber}} for {{childName}} ({{amount}}) is {{daysOverdue}} days overdue. Please arrange payment at your convenience. - {{crecheName}}`,
  },
  {
    stage: ReminderStage.SECOND,
    daysOverdue: 14,
    channels: [ReminderChannel.EMAIL, ReminderChannel.WHATSAPP],
    emailSubject: 'Second Notice: Invoice {{invoiceNumber}} - Payment Required',
    emailBody: `Dear {{parentName}},

This is our second notice regarding the outstanding payment for {{childName}}'s invoice {{invoiceNumber}}.

Outstanding Amount: {{amount}}
Original Due Date: {{dueDate}}
Days Overdue: {{daysOverdue}}

We kindly request that you settle this amount as soon as possible to avoid any disruption to {{childName}}'s enrollment.

If you are experiencing financial difficulties, please contact us to discuss possible payment arrangements.

Thank you for your prompt attention to this matter.

Regards,
{{crecheName}}
{{crechePhone}}
{{crecheEmail}}`,
    whatsappBody: `Dear {{parentName}}, this is a second notice that invoice {{invoiceNumber}} ({{amount}}) for {{childName}} is now {{daysOverdue}} days overdue. Please settle this amount urgently. Contact us if you need to discuss payment arrangements. - {{crecheName}}`,
  },
  {
    stage: ReminderStage.FINAL,
    daysOverdue: 30,
    channels: [ReminderChannel.EMAIL, ReminderChannel.WHATSAPP],
    emailSubject:
      'FINAL NOTICE: Invoice {{invoiceNumber}} - Immediate Payment Required',
    emailBody: `Dear {{parentName}},

FINAL NOTICE

Despite our previous reminders, payment for {{childName}}'s invoice {{invoiceNumber}} remains outstanding.

Outstanding Amount: {{amount}}
Original Due Date: {{dueDate}}
Days Overdue: {{daysOverdue}}

This is our final notice before we are forced to take further action, which may include:
- Suspension of {{childName}}'s enrollment
- Referral to debt collection services
- Additional fees and interest charges

Please settle this account immediately or contact us within 48 hours to discuss alternative arrangements.

We value your relationship with our facility and hope to resolve this matter promptly.

Regards,
{{crecheName}}
{{crechePhone}}
{{crecheEmail}}`,
    whatsappBody: `FINAL NOTICE: {{parentName}}, invoice {{invoiceNumber}} ({{amount}}) for {{childName}} is {{daysOverdue}} days overdue. Immediate payment required to avoid enrollment suspension. Contact us urgently. - {{crecheName}}`,
  },
  {
    stage: ReminderStage.ESCALATED,
    daysOverdue: 45,
    channels: [ReminderChannel.EMAIL],
    emailSubject: 'URGENT: Account Escalated - Invoice {{invoiceNumber}}',
    emailBody: `Dear {{parentName}},

ACCOUNT ESCALATED

Your account has been escalated for management review due to the severely overdue payment for invoice {{invoiceNumber}}.

Outstanding Amount: {{amount}}
Original Due Date: {{dueDate}}
Days Overdue: {{daysOverdue}}

This matter requires your immediate attention. Please contact our management team directly to discuss the status of your account and prevent further action.

Further delays may result in:
- Immediate suspension of {{childName}}'s enrollment
- Referral to external debt collection agencies
- Legal action to recover the outstanding amount
- Reporting to credit bureaus

We urge you to contact us immediately to resolve this matter.

Regards,
{{crecheName}} Management
{{crechePhone}}
{{crecheEmail}}`,
    whatsappBody: `URGENT: {{parentName}}, your account for {{childName}} has been escalated. Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Contact management immediately to prevent further action. - {{crecheName}}`,
  },
];

/**
 * Get default template for a specific stage
 */
export function getDefaultTemplate(
  stage: ReminderStage,
): DefaultTemplateContent | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.stage === stage);
}

/**
 * Get all available placeholder keys for templates
 */
export const TEMPLATE_PLACEHOLDERS = [
  '{{parentName}}',
  '{{childName}}',
  '{{invoiceNumber}}',
  '{{amount}}',
  '{{dueDate}}',
  '{{daysOverdue}}',
  '{{crecheName}}',
  '{{crechePhone}}',
  '{{crecheEmail}}',
  '{{bankName}}',
  '{{accountNumber}}',
  '{{branchCode}}',
] as const;
