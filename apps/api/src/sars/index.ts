/**
 * SARS Module Exports
 * TASK-SARS-017: SARS Deadline Reminder System
 */

export { SarsSchedulerModule } from './sars.module';
export { SarsDeadlineService } from './sars-deadline.service';
export type {
  SarsDeadlineType,
  UpcomingDeadline,
  DeadlineReminderPrefs,
  DeadlineReminder,
  SarsDeadlineCheckJobData,
} from './types/deadline.types';
export {
  DEFAULT_REMINDER_DAYS,
  SARS_DEADLINE_CALENDAR,
} from './types/deadline.types';
