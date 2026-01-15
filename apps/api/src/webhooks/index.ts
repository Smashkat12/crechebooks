/**
 * Webhook Module Exports
 * TASK-BILL-035: Delivery Status Webhook Handlers
 * TASK-SEC-006: Webhook Signature Verification Guard
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 */

// Services
export { WebhookService } from './webhook.service';

// Controller
export { WebhookController } from './webhook.controller';

// Guards
export {
  WebhookSignatureGuard,
  WEBHOOK_PROVIDER_KEY,
  type WebhookProvider,
} from './guards/webhook-signature.guard';

// Types
export * from './types/webhook.types';

// Module
export { WebhookModule } from './webhook.module';

// Re-export idempotency components for convenience
export {
  IdempotencyService,
  type IdempotencyResult,
  type IdempotencyEntry,
} from '../common/services/idempotency.service';
export { IdempotencyGuard } from '../common/guards/idempotency.guard';
export {
  Idempotent,
  IDEMPOTENCY_KEY,
  type IdempotencyOptions,
  type IdempotentRequest,
} from '../common/decorators/idempotent.decorator';
