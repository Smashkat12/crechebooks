export { WhatsAppService } from './whatsapp.service';
export { WhatsAppModule } from './whatsapp.module';
export { WhatsAppTemplateService } from './services/template.service';
export { WhatsAppMessageEntity } from './entities/whatsapp-message.entity';
export type {
  WhatsAppMessageResult,
  WhatsAppWebhookPayload,
  TemplateParams,
  WhatsAppTemplateName,
  WhatsAppConsent,
  WhatsAppDeliveryStatus,
  WhatsAppConfig,
} from './types/whatsapp.types';

// TASK-WA-002: Template Management Types
export type {
  TemplateDefinition,
  TemplateParameterDef,
  TemplateParameterValues,
  BuiltTemplate,
  TemplateValidationResult,
  TemplateUsageContext,
} from './types/template.types';
export {
  CRECHEBOOKS_TEMPLATES,
  getTemplateDefinition,
  templateRequiresOptIn,
} from './types/template.types';

// TASK-WA-001: Message History Types
export {
  WhatsAppMessageStatus as MessageHistoryStatus,
  WhatsAppContextType,
} from './types/message-history.types';
export type {
  CreateWhatsAppMessageDto,
  UpdateMessageStatusDto,
  MessageHistoryQueryOptions,
  MessageHistorySummary,
} from './types/message-history.types';

// TASK-INT-006: Input Validation
export {
  IsPhoneNumber,
  IsPhoneNumberConstraint,
  E164_REGEX,
  WHATSAPP_PHONE_REGEX,
  normalizePhoneNumber,
  sanitizePhoneNumber,
  isValidPhoneNumber,
  containsInjectionPattern,
} from './validators';

export {
  WhatsAppMessageType,
  WhatsAppMessageStatus,
  WhatsAppProfileDto,
  WhatsAppContactDto,
  WhatsAppTextMessageDto,
  WhatsAppImageDto,
  WhatsAppDocumentDto,
  WhatsAppLocationDto,
  WhatsAppReactionDto,
  WhatsAppInteractiveDto,
  WhatsAppButtonDto,
  WhatsAppMessageDto,
  WhatsAppStatusErrorDto,
  WhatsAppStatusDto,
  WhatsAppMetadataDto,
  WhatsAppValueDto,
  WhatsAppChangeDto,
  WhatsAppEntryDto,
  WhatsAppWebhookDto,
  WhatsAppWebhookVerifyDto,
} from './dto';
