'use client';

/**
 * Leave Policy Component
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Displays BCEA (Basic Conditions of Employment Act) leave entitlements
 * for South African employees including:
 * - Annual Leave: 15 working days per year
 * - Sick Leave: 30 days per 3-year cycle
 * - Family Responsibility: 3 days per year
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Thermometer,
  Users,
  GraduationCap,
  Baby,
  Info,
  Scale,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LeavePolicyProps {
  className?: string;
  compact?: boolean;
}

interface LeaveEntitlement {
  type: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  entitlement: string;
  description: string;
  details: string[];
  notes?: string;
  color: string;
}

// ============================================================================
// Leave Entitlements Data (BCEA)
// ============================================================================

const BCEA_ENTITLEMENTS: LeaveEntitlement[] = [
  {
    type: 'annual',
    name: 'Annual Leave',
    icon: Calendar,
    entitlement: '15 working days per year',
    description:
      'Paid time off for rest and recreation. Employees are entitled to 21 consecutive days (or 15 working days) of annual leave per year.',
    details: [
      '21 consecutive days OR 1 day for every 17 days worked',
      'Must be taken within 6 months of the end of the leave cycle',
      'Employer may not pay out annual leave except on termination',
      'Leave may be scheduled by agreement with employer',
    ],
    notes: 'Unused leave may be forfeited if not taken within the prescribed period.',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    type: 'sick',
    name: 'Sick Leave',
    icon: Thermometer,
    entitlement: '30 days per 3-year cycle',
    description:
      'Paid leave for illness or injury. Employees are entitled to the equivalent of 6 weeks of paid sick leave over a 3-year cycle.',
    details: [
      '30 working days per 36-month cycle',
      'First 6 months: Only 1 day for every 26 days worked',
      'Medical certificate required for absence longer than 2 consecutive days',
      'Medical certificate required for absence on a Monday or Friday (or before/after public holiday)',
    ],
    notes:
      'Employer may require a medical certificate before paying sick leave if there is reason to doubt the absence.',
    color: 'text-orange-600 dark:text-orange-400',
  },
  {
    type: 'family',
    name: 'Family Responsibility Leave',
    icon: Users,
    entitlement: '3 days per year',
    description:
      'Leave for family emergencies such as the birth of a child, illness of a child, or death of specified family members.',
    details: [
      '3 paid days per annual leave cycle',
      'Available when a child is born or sick, or spouse/partner/parent/grandparent/grandchild/sibling dies',
      'Employer may require reasonable proof',
      'Available only to employees who have worked for more than 4 months',
      'Must work at least 4 days a week to qualify',
    ],
    notes: 'This leave is in addition to annual leave and sick leave.',
    color: 'text-purple-600 dark:text-purple-400',
  },
  {
    type: 'maternity',
    name: 'Maternity Leave',
    icon: Baby,
    entitlement: '4 consecutive months',
    description:
      'Unpaid leave for pregnant employees. May start 4 weeks before expected date of birth or earlier if medically necessary.',
    details: [
      '4 consecutive months of maternity leave',
      'May start up to 4 weeks before expected birth',
      'Cannot work for 6 weeks after birth unless certified fit by doctor',
      'UIF maternity benefits may apply',
    ],
    notes:
      'While the BCEA provides for unpaid maternity leave, employers may have policies providing for paid maternity leave.',
    color: 'text-pink-600 dark:text-pink-400',
  },
  {
    type: 'paternity',
    name: 'Parental Leave',
    icon: Users,
    entitlement: '10 consecutive days',
    description:
      'Leave available to parents upon birth or adoption of a child (for employees who do not take maternity leave).',
    details: [
      '10 consecutive days unpaid leave',
      'Available from date of birth or adoption',
      'Applies to all parents who are not the primary caregiver',
      'UIF parental benefits may apply',
    ],
    notes: 'This is in addition to Family Responsibility Leave for birth of a child.',
    color: 'text-teal-600 dark:text-teal-400',
  },
  {
    type: 'study',
    name: 'Study Leave',
    icon: GraduationCap,
    entitlement: 'As per company policy',
    description:
      'Leave for educational purposes. Not mandated by BCEA but may be provided by company policy.',
    details: [
      'Not a statutory entitlement under BCEA',
      'Subject to company policy and employment contract',
      'May be paid or unpaid depending on policy',
      'Often linked to job-related studies or skills development',
    ],
    notes: 'Check your employment contract or company policy for specific entitlements.',
    color: 'text-indigo-600 dark:text-indigo-400',
  },
];

// ============================================================================
// Compact Card Component
// ============================================================================

function LeaveEntitlementCard({ entitlement }: { entitlement: LeaveEntitlement }) {
  const Icon = entitlement.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg bg-muted', entitlement.color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium">{entitlement.name}</h4>
            <Badge variant="secondary" className="mt-1">
              {entitlement.entitlement}
            </Badge>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {entitlement.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LeavePolicy({ className, compact = false }: LeavePolicyProps) {
  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          <h2 className="text-lg font-semibold">BCEA Leave Entitlements</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BCEA_ENTITLEMENTS.slice(0, 3).map((entitlement) => (
            <LeaveEntitlementCard key={entitlement.type} entitlement={entitlement} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Leave Policy (BCEA)
        </CardTitle>
        <CardDescription>
          Your leave entitlements as per the Basic Conditions of Employment Act 75 of 1997
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Important Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>South African Labour Law</AlertTitle>
          <AlertDescription>
            These entitlements are the minimum required by law. Your employment contract or company
            policy may provide for additional benefits.
          </AlertDescription>
        </Alert>

        {/* Accordion for Each Leave Type */}
        <Accordion type="multiple" className="w-full">
          {BCEA_ENTITLEMENTS.map((entitlement) => {
            const Icon = entitlement.icon;
            return (
              <AccordionItem key={entitlement.type} value={entitlement.type}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Icon className={cn('h-5 w-5 shrink-0', entitlement.color)} />
                    <div>
                      <span className="font-medium">{entitlement.name}</span>
                      <Badge variant="secondary" className="ml-2">
                        {entitlement.entitlement}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pl-8">
                    <p className="text-sm text-muted-foreground">{entitlement.description}</p>
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Key Points:</h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {entitlement.details.map((detail, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {entitlement.notes && (
                      <div className="rounded-md bg-muted p-3">
                        <p className="text-sm text-muted-foreground">
                          <strong>Note:</strong> {entitlement.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Legal Reference */}
        <div className="border-t pt-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Legal Reference</p>
              <p>
                Basic Conditions of Employment Act 75 of 1997, as amended. This information is
                provided for general guidance only and does not constitute legal advice.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default LeavePolicy;
