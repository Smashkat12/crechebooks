export { WhatsAppService } from './whatsapp.service';
export { WhatsAppModule } from './whatsapp.module';
export type {
  WhatsAppMessageResult,
  WhatsAppWebhookPayload,
  TemplateParams,
  WhatsAppTemplateName,
  WhatsAppConsent,
  WhatsAppDeliveryStatus,
  WhatsAppConfig,
} from './types/whatsapp.types';

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
