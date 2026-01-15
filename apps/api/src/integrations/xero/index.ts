/**
 * Xero Integration Module Exports
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 * TASK-STAFF-001: Implement Xero Journal Posting
 */

// Services
export { BankFeedService } from './bank-feed.service';
export { XeroJournalService } from './xero-journal.service';
export { XeroAuthService } from './xero-auth.service';

// Controller
export { XeroController } from './xero.controller';

// Gateway
export { XeroSyncGateway } from './xero.gateway';

// Types
export * from './types/bank-feed.types';
export * from './dto/xero.dto';
export * from './dto/xero-journal.dto';

// Errors
export * from './xero-journal.errors';

// Module
export { XeroModule } from './xero.module';
