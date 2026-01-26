/**
 * Audit Trail Barrel Exports
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 */

export { AuditTrailModule } from './audit-trail.module';
export { AuditTrailService } from './audit-trail.service';
export { DecisionHooks } from './decision-hooks';
export {
  AgentType,
  EventType,
  DecisionSource,
} from './interfaces/audit.interface';
export type {
  LogDecisionParams,
  LogEscalationParams,
  LogWorkflowParams,
  AuditFilters,
  EscalationStats,
  AgentPerformanceStats,
} from './interfaces/audit.interface';
