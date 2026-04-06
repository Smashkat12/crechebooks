/**
 * Enrollment domain events
 */

export type EnrollmentSource = 'admin_api' | 'whatsapp_onboarding';

export interface EnrollmentCompletedEvent {
  tenantId: string;
  enrollmentId: string;
  childId: string;
  childName: string;
  parentName: string;
  parentEmail: string | null;
  feeStructureName: string;
  monthlyFeeCents: number;
  startDate: Date;
  invoiceNumber: string | null;
  source: EnrollmentSource;
}
