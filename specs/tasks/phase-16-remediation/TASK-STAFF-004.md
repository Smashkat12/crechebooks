<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-004</task_id>
    <title>Complete Leave Type Mapping</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>business-logic</category>
    <estimated_effort>4 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-24</due_date>
    <tags>leave, mapping, sa-compliance, simplepay, payroll</tags>
  </metadata>

  <context>
    <problem_statement>
      The leave type mapping between CrecheBooks internal system, SimplePay, and Xero is
      incomplete. Not all South African statutory leave types are properly mapped, causing
      leave data to be incorrectly synchronized or lost during integration. This affects
      payroll accuracy and compliance reporting.
    </problem_statement>

    <business_impact>
      - Leave balances may be incorrect in SimplePay/Xero
      - Compliance issues with BCEA leave requirements
      - Staff leave records not accurately reflected across systems
      - Manual reconciliation required for unmapped leave types
      - Potential payroll errors when processing leave payments
    </business_impact>

    <technical_background>
      South Africa's Basic Conditions of Employment Act (BCEA) mandates specific leave types.
      Each integrated system (SimplePay, Xero) has its own leave type codes. A comprehensive
      mapping layer is needed to translate between internal codes and external system codes.
    </technical_background>

    <dependencies>
      - SimplePay leave type codes documentation
      - Xero leave type codes documentation
      - BCEA compliance requirements
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Map all SA statutory leave types (annual, sick, family responsibility, maternity, parental, adoption)</item>
      <item>Add SimplePay leave type code mappings</item>
      <item>Add Xero leave type code mappings</item>
      <item>Handle custom/creche-specific leave types</item>
      <item>Create bidirectional mapping (internal &lt;-&gt; external)</item>
      <item>Add leave type validation</item>
    </in_scope>

    <out_of_scope>
      <item>Leave balance calculation logic (separate service)</item>
      <item>Leave approval workflow</item>
      <item>Leave accrual rules</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/staff/leave-type.mapper.ts</file>
      <file action="create">apps/api/src/staff/enums/leave-type.enum.ts</file>
      <file action="create">apps/api/src/staff/constants/leave-type-mappings.ts</file>
      <file action="modify">apps/api/src/integrations/simplepay/simplepay-leave.service.ts</file>
      <file action="modify">apps/api/src/integrations/xero/xero-leave.service.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Create a comprehensive leave type enum covering all SA statutory types plus common
      custom types. Build a centralized mapper service with lookup tables for each external
      system.
    </approach>

    <steps>
      <step order="1">
        <description>Create comprehensive leave type enum</description>
        <details>
          ```typescript
          // leave-type.enum.ts
          export enum LeaveType {
            // BCEA Statutory Leave Types
            ANNUAL = 'ANNUAL',                           // 21 consecutive days / 15 working days
            SICK = 'SICK',                               // 30 days over 3-year cycle
            FAMILY_RESPONSIBILITY = 'FAMILY_RESPONSIBILITY', // 3 days per year
            MATERNITY = 'MATERNITY',                     // 4 consecutive months
            PARENTAL = 'PARENTAL',                       // 10 consecutive days
            ADOPTION = 'ADOPTION',                       // 10 consecutive weeks
            COMMISSIONING_PARENTAL = 'COMMISSIONING_PARENTAL', // Surrogacy

            // Additional Common Types
            STUDY = 'STUDY',
            UNPAID = 'UNPAID',
            COMPASSIONATE = 'COMPASSIONATE',
            SPECIAL = 'SPECIAL',

            // COVID-Related (may still be applicable)
            COVID_QUARANTINE = 'COVID_QUARANTINE',

            // Creche-Specific
            SCHOOL_HOLIDAYS = 'SCHOOL_HOLIDAYS',
            TRAINING = 'TRAINING'
          }

          export interface LeaveTypeConfig {
            type: LeaveType;
            name: string;
            description: string;
            isPaid: boolean;
            isStatutory: boolean;
            defaultEntitlement: number | null; // days per year
            accrualBasis: 'ANNUAL' | 'MONTHLY' | 'CYCLE_3_YEAR' | 'EVENT' | null;
          }

          export const LEAVE_TYPE_CONFIG: Record<LeaveType, LeaveTypeConfig> = {
            [LeaveType.ANNUAL]: {
              type: LeaveType.ANNUAL,
              name: 'Annual Leave',
              description: 'Paid annual vacation leave',
              isPaid: true,
              isStatutory: true,
              defaultEntitlement: 21, // 21 consecutive days = ~15 working days
              accrualBasis: 'ANNUAL'
            },
            [LeaveType.SICK]: {
              type: LeaveType.SICK,
              name: 'Sick Leave',
              description: 'Paid sick leave per BCEA',
              isPaid: true,
              isStatutory: true,
              defaultEntitlement: 30, // 30 days over 3-year cycle
              accrualBasis: 'CYCLE_3_YEAR'
            },
            [LeaveType.FAMILY_RESPONSIBILITY]: {
              type: LeaveType.FAMILY_RESPONSIBILITY,
              name: 'Family Responsibility Leave',
              description: 'Leave for family emergencies',
              isPaid: true,
              isStatutory: true,
              defaultEntitlement: 3,
              accrualBasis: 'ANNUAL'
            },
            [LeaveType.MATERNITY]: {
              type: LeaveType.MATERNITY,
              name: 'Maternity Leave',
              description: 'Leave for childbirth',
              isPaid: false, // UIF covers, not employer
              isStatutory: true,
              defaultEntitlement: 120, // 4 months
              accrualBasis: 'EVENT'
            },
            [LeaveType.PARENTAL]: {
              type: LeaveType.PARENTAL,
              name: 'Parental Leave',
              description: 'Leave for non-birthing parent',
              isPaid: false, // UIF covers
              isStatutory: true,
              defaultEntitlement: 10,
              accrualBasis: 'EVENT'
            },
            [LeaveType.ADOPTION]: {
              type: LeaveType.ADOPTION,
              name: 'Adoption Leave',
              description: 'Leave for adopting a child',
              isPaid: false, // UIF covers
              isStatutory: true,
              defaultEntitlement: 70, // 10 weeks
              accrualBasis: 'EVENT'
            },
            // ... additional types
          };
          ```
        </details>
      </step>

      <step order="2">
        <description>Create SimplePay leave type mappings</description>
        <details>
          ```typescript
          // leave-type-mappings.ts
          export const SIMPLEPAY_LEAVE_TYPE_MAP: Record<LeaveType, string> = {
            [LeaveType.ANNUAL]: 'ANNUAL',
            [LeaveType.SICK]: 'SICK',
            [LeaveType.FAMILY_RESPONSIBILITY]: 'FAMILY',
            [LeaveType.MATERNITY]: 'MATERNITY',
            [LeaveType.PARENTAL]: 'PARENTAL',
            [LeaveType.ADOPTION]: 'ADOPTION',
            [LeaveType.STUDY]: 'STUDY',
            [LeaveType.UNPAID]: 'UNPAID',
            [LeaveType.COMPASSIONATE]: 'COMPASSIONATE',
            [LeaveType.SPECIAL]: 'SPECIAL',
            [LeaveType.COVID_QUARANTINE]: 'COVID',
            [LeaveType.SCHOOL_HOLIDAYS]: 'CUSTOM_1', // Custom mapping needed
            [LeaveType.TRAINING]: 'CUSTOM_2',
            [LeaveType.COMMISSIONING_PARENTAL]: 'PARENTAL' // Maps to parental in SimplePay
          };

          export const SIMPLEPAY_TO_INTERNAL_MAP: Record<string, LeaveType> =
            Object.entries(SIMPLEPAY_LEAVE_TYPE_MAP).reduce((acc, [internal, external]) => {
              acc[external] = internal as LeaveType;
              return acc;
            }, {} as Record<string, LeaveType>);
          ```
        </details>
      </step>

      <step order="3">
        <description>Create Xero leave type mappings</description>
        <details>
          ```typescript
          export const XERO_LEAVE_TYPE_MAP: Record<LeaveType, string> = {
            [LeaveType.ANNUAL]: 'annual-leave',
            [LeaveType.SICK]: 'sick-leave',
            [LeaveType.FAMILY_RESPONSIBILITY]: 'family-responsibility-leave',
            [LeaveType.MATERNITY]: 'maternity-leave',
            [LeaveType.PARENTAL]: 'parental-leave',
            [LeaveType.ADOPTION]: 'adoption-leave',
            [LeaveType.STUDY]: 'study-leave',
            [LeaveType.UNPAID]: 'unpaid-leave',
            [LeaveType.COMPASSIONATE]: 'compassionate-leave',
            [LeaveType.SPECIAL]: 'other-leave',
            [LeaveType.COVID_QUARANTINE]: 'quarantine-leave',
            [LeaveType.SCHOOL_HOLIDAYS]: 'other-leave',
            [LeaveType.TRAINING]: 'training-leave',
            [LeaveType.COMMISSIONING_PARENTAL]: 'parental-leave'
          };

          export const XERO_TO_INTERNAL_MAP: Record<string, LeaveType> =
            Object.entries(XERO_LEAVE_TYPE_MAP).reduce((acc, [internal, external]) => {
              // Handle many-to-one mappings
              if (!acc[external]) {
                acc[external] = internal as LeaveType;
              }
              return acc;
            }, {} as Record<string, LeaveType>);
          ```
        </details>
      </step>

      <step order="4">
        <description>Implement leave type mapper service</description>
        <details>
          ```typescript
          // leave-type.mapper.ts
          import { Injectable, Logger } from '@nestjs/common';

          @Injectable()
          export class LeaveTypeMapper {
            private readonly logger = new Logger(LeaveTypeMapper.name);

            toSimplePay(internalType: LeaveType): string {
              const mapped = SIMPLEPAY_LEAVE_TYPE_MAP[internalType];
              if (!mapped) {
                this.logger.warn(`No SimplePay mapping for leave type: ${internalType}`);
                return 'OTHER'; // Fallback
              }
              return mapped;
            }

            fromSimplePay(simplePayType: string): LeaveType {
              const mapped = SIMPLEPAY_TO_INTERNAL_MAP[simplePayType];
              if (!mapped) {
                this.logger.warn(`Unknown SimplePay leave type: ${simplePayType}`);
                return LeaveType.SPECIAL; // Fallback
              }
              return mapped;
            }

            toXero(internalType: LeaveType): string {
              const mapped = XERO_LEAVE_TYPE_MAP[internalType];
              if (!mapped) {
                this.logger.warn(`No Xero mapping for leave type: ${internalType}`);
                return 'other-leave'; // Fallback
              }
              return mapped;
            }

            fromXero(xeroType: string): LeaveType {
              const mapped = XERO_TO_INTERNAL_MAP[xeroType];
              if (!mapped) {
                this.logger.warn(`Unknown Xero leave type: ${xeroType}`);
                return LeaveType.SPECIAL; // Fallback
              }
              return mapped;
            }

            getConfig(type: LeaveType): LeaveTypeConfig {
              return LEAVE_TYPE_CONFIG[type];
            }

            isStatutory(type: LeaveType): boolean {
              return LEAVE_TYPE_CONFIG[type]?.isStatutory ?? false;
            }

            isPaid(type: LeaveType): boolean {
              return LEAVE_TYPE_CONFIG[type]?.isPaid ?? false;
            }

            getAllTypes(): LeaveType[] {
              return Object.values(LeaveType);
            }

            getStatutoryTypes(): LeaveType[] {
              return Object.values(LeaveType).filter(type => this.isStatutory(type));
            }
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Update SimplePay leave service to use mapper</description>
        <details>
          ```typescript
          // simplepay-leave.service.ts
          @Injectable()
          export class SimplePayLeaveService {
            constructor(
              private readonly leaveTypeMapper: LeaveTypeMapper,
              private readonly simplePayClient: SimplePayClientService
            ) {}

            async syncLeave(staffId: string, leave: StaffLeave): Promise<void> {
              const simplePayType = this.leaveTypeMapper.toSimplePay(leave.type);

              await this.simplePayClient.submitLeave({
                employeeId: staffId,
                leaveType: simplePayType,
                startDate: leave.startDate,
                endDate: leave.endDate,
                days: leave.days,
                isPaid: this.leaveTypeMapper.isPaid(leave.type)
              });
            }

            async importLeave(simplePayLeave: SimplePayLeaveRecord): Promise<StaffLeave> {
              const internalType = this.leaveTypeMapper.fromSimplePay(simplePayLeave.leaveType);

              return {
                type: internalType,
                startDate: simplePayLeave.startDate,
                endDate: simplePayLeave.endDate,
                days: simplePayLeave.days,
                status: simplePayLeave.approved ? 'APPROVED' : 'PENDING'
              };
            }
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Update Xero leave service to use mapper</description>
        <details>
          ```typescript
          // xero-leave.service.ts
          @Injectable()
          export class XeroLeaveService {
            constructor(
              private readonly leaveTypeMapper: LeaveTypeMapper,
              private readonly xeroClient: XeroClientService
            ) {}

            async syncLeave(staffId: string, leave: StaffLeave): Promise<void> {
              const xeroType = this.leaveTypeMapper.toXero(leave.type);
              const config = this.leaveTypeMapper.getConfig(leave.type);

              await this.xeroClient.submitLeaveApplication({
                employeeId: staffId,
                leaveTypeId: xeroType,
                startDate: leave.startDate,
                endDate: leave.endDate,
                units: leave.days,
                unitType: 'Days',
                title: config.name
              });
            }
          }
          ```
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Bidirectional Mapping">
        ```typescript
        const FORWARD_MAP: Record<Internal, External> = {...};
        const REVERSE_MAP: Record<External, Internal> =
          Object.entries(FORWARD_MAP).reduce((acc, [k, v]) => ({...acc, [v]: k}), {});
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test all leave type mappings to SimplePay</description>
        <file>apps/api/src/staff/__tests__/leave-type.mapper.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test all leave type mappings to Xero</description>
        <file>apps/api/src/staff/__tests__/leave-type.mapper.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test reverse mappings from external systems</description>
        <file>apps/api/src/staff/__tests__/leave-type.mapper.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test leave sync with mapped types</description>
        <file>apps/api/src/staff/__tests__/leave-sync.integration.spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>All SA statutory leave types are mapped to SimplePay codes</criterion>
      <criterion>All SA statutory leave types are mapped to Xero codes</criterion>
      <criterion>Reverse mappings work correctly from both systems</criterion>
      <criterion>Unknown leave types fall back gracefully</criterion>
      <criterion>Leave type configuration includes BCEA compliance info</criterion>
      <criterion>Mapper logs warnings for unmapped types</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>All SA statutory leave types defined in enum</item>
      <item>SimplePay mappings complete and tested</item>
      <item>Xero mappings complete and tested</item>
      <item>Bidirectional mapping works correctly</item>
      <item>Leave type configuration documented</item>
      <item>Integration services updated to use mapper</item>
      <item>Unit tests cover all mappings</item>
      <item>Code reviewed and approved</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="legislation">Basic Conditions of Employment Act (BCEA) - Chapter 3</reference>
    <reference type="documentation">SimplePay Leave Types API Documentation</reference>
    <reference type="documentation">Xero Payroll AU Leave Types</reference>
  </references>
</task_specification>
