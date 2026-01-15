<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-SARS-002</task_id>
    <title>Implement VAT201 Adjustment Fields</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>feature-implementation</category>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>
      <tag>sars</tag>
      <tag>vat201</tag>
      <tag>tax-calculation</tag>
      <tag>adjustments</tag>
    </tags>
  </metadata>

  <context>
    <issue_description>
      VAT201 form fields 7-13 (adjustment fields) are currently hardcoded to 0 in the
      vat201.service.ts file. These fields represent various VAT adjustments that businesses
      may need to report, and hardcoding them prevents accurate VAT201 submissions.
    </issue_description>

    <current_behavior>
      The VAT201 service returns 0 for all adjustment fields (fields 7-13) regardless of
      actual business transactions that may require adjustments.
    </current_behavior>

    <expected_behavior>
      The service should calculate adjustment values based on actual business transactions,
      correction entries, and applicable business rules per SARS VAT201 requirements.
    </expected_behavior>

    <affected_files>
      <file>apps/api/src/sars/vat201.service.ts</file>
      <file>apps/api/src/sars/vat201.dto.ts</file>
      <file>apps/api/src/sars/vat201.controller.ts</file>
    </affected_files>

    <vat201_field_reference>
      <field number="7">Change in use adjustments (Output)</field>
      <field number="8">Change in use adjustments (Input)</field>
      <field number="9">Other adjustments to output tax</field>
      <field number="10">Other adjustments to input tax</field>
      <field number="11">Bad debts written off</field>
      <field number="12">Bad debts recovered</field>
      <field number="13">Capital goods scheme adjustments</field>
    </vat201_field_reference>
  </context>

  <scope>
    <in_scope>
      <item>Implement calculation logic for fields 7-13</item>
      <item>Define data models for adjustment transactions</item>
      <item>Create service methods to aggregate adjustments by type</item>
      <item>Add validation for adjustment entries</item>
      <item>Update DTOs to include adjustment data</item>
    </in_scope>

    <out_of_scope>
      <item>UI for entering adjustment transactions (separate task)</item>
      <item>Historical adjustment migration</item>
      <item>SARS e-filing integration changes</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Create a structured approach to handle VAT adjustments by defining adjustment types,
      creating a data model to store adjustment transactions, and implementing calculation
      logic that aggregates adjustments by field for the VAT201 period.
    </approach>

    <steps>
      <step order="1">
        <description>Define adjustment types enum and interfaces</description>
        <details>
          Create TypeScript types for VAT adjustment categories matching SARS fields 7-13
        </details>
        <code_example>
// packages/types/src/sars/vat-adjustments.ts
export enum VatAdjustmentType {
  CHANGE_IN_USE_OUTPUT = 'CHANGE_IN_USE_OUTPUT',     // Field 7
  CHANGE_IN_USE_INPUT = 'CHANGE_IN_USE_INPUT',       // Field 8
  OTHER_OUTPUT_ADJUSTMENT = 'OTHER_OUTPUT_ADJUSTMENT', // Field 9
  OTHER_INPUT_ADJUSTMENT = 'OTHER_INPUT_ADJUSTMENT',   // Field 10
  BAD_DEBTS_WRITTEN_OFF = 'BAD_DEBTS_WRITTEN_OFF',   // Field 11
  BAD_DEBTS_RECOVERED = 'BAD_DEBTS_RECOVERED',       // Field 12
  CAPITAL_GOODS_SCHEME = 'CAPITAL_GOODS_SCHEME',     // Field 13
}

export interface VatAdjustment {
  id: string;
  organizationId: string;
  type: VatAdjustmentType;
  amount: number;
  taxPeriod: string;
  description: string;
  referenceNumber?: string;
  transactionDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
        </code_example>
      </step>

      <step order="2">
        <description>Create database entity for VAT adjustments</description>
        <details>
          Add Prisma model or TypeORM entity for storing adjustment transactions
        </details>
        <code_example>
// prisma/schema.prisma addition
model VatAdjustment {
  id              String   @id @default(cuid())
  organizationId  String
  type            String   // VatAdjustmentType enum value
  amount          Decimal  @db.Decimal(15, 2)
  taxPeriod       String   // Format: YYYYMM
  description     String
  referenceNumber String?
  transactionDate DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization    Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId, taxPeriod])
  @@index([type, taxPeriod])
}
        </code_example>
      </step>

      <step order="3">
        <description>Implement adjustment aggregation service</description>
        <details>
          Create service methods to aggregate adjustments by type for a given tax period
        </details>
        <code_example>
// apps/api/src/sars/vat-adjustment.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VatAdjustmentType } from '@crechebooks/types';

@Injectable()
export class VatAdjustmentService {
  constructor(private prisma: PrismaService) {}

  async getAdjustmentsByPeriod(
    organizationId: string,
    taxPeriod: string,
  ): Promise<Map<VatAdjustmentType, number>> {
    const adjustments = await this.prisma.vatAdjustment.groupBy({
      by: ['type'],
      where: {
        organizationId,
        taxPeriod,
      },
      _sum: {
        amount: true,
      },
    });

    const result = new Map<VatAdjustmentType, number>();

    // Initialize all types to 0
    Object.values(VatAdjustmentType).forEach(type => {
      result.set(type, 0);
    });

    // Populate with actual values
    adjustments.forEach(adj => {
      result.set(
        adj.type as VatAdjustmentType,
        Number(adj._sum.amount) || 0,
      );
    });

    return result;
  }
}
        </code_example>
      </step>

      <step order="4">
        <description>Update VAT201 service to use adjustment data</description>
        <details>
          Integrate adjustment service into VAT201 calculation
        </details>
        <code_example>
// apps/api/src/sars/vat201.service.ts (updated)
async generateVat201(
  organizationId: string,
  taxPeriod: string,
): Promise<Vat201Response> {
  // ... existing code for fields 1-6 ...

  // Get adjustments for fields 7-13
  const adjustments = await this.vatAdjustmentService.getAdjustmentsByPeriod(
    organizationId,
    taxPeriod,
  );

  return {
    // ... fields 1-6 ...
    field7_changeInUseOutput: adjustments.get(VatAdjustmentType.CHANGE_IN_USE_OUTPUT),
    field8_changeInUseInput: adjustments.get(VatAdjustmentType.CHANGE_IN_USE_INPUT),
    field9_otherOutputAdjustments: adjustments.get(VatAdjustmentType.OTHER_OUTPUT_ADJUSTMENT),
    field10_otherInputAdjustments: adjustments.get(VatAdjustmentType.OTHER_INPUT_ADJUSTMENT),
    field11_badDebtsWrittenOff: adjustments.get(VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF),
    field12_badDebtsRecovered: adjustments.get(VatAdjustmentType.BAD_DEBTS_RECOVERED),
    field13_capitalGoodsScheme: adjustments.get(VatAdjustmentType.CAPITAL_GOODS_SCHEME),
    // ... remaining fields ...
  };
}
        </code_example>
      </step>

      <step order="5">
        <description>Add CRUD endpoints for adjustment management</description>
        <details>
          Create controller and service methods for managing adjustment entries
        </details>
      </step>

      <step order="6">
        <description>Add validation rules for adjustments</description>
        <details>
          Implement business rules validation (e.g., bad debts must have original invoice reference)
        </details>
      </step>
    </steps>

    <business_rules>
      <rule field="7-8">
        Change in use adjustments require original asset reference and change percentage
      </rule>
      <rule field="9-10">
        Other adjustments require SARS-approved reason code and supporting documentation reference
      </rule>
      <rule field="11">
        Bad debts written off require original invoice number, debtor details, and proof of write-off
      </rule>
      <rule field="12">
        Bad debts recovered must reference original write-off entry
      </rule>
      <rule field="13">
        Capital goods scheme adjustments require asset register reference and calculation basis
      </rule>
    </business_rules>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should aggregate change in use output adjustments correctly</name>
        <type>unit</type>
        <expected_result>Sum of all CHANGE_IN_USE_OUTPUT adjustments for period</expected_result>
      </test_case>
      <test_case>
        <name>Should return 0 for adjustment types with no entries</name>
        <type>unit</type>
        <expected_result>0 value for empty adjustment type</expected_result>
      </test_case>
      <test_case>
        <name>Should validate bad debt requires invoice reference</name>
        <type>unit</type>
        <expected_result>Validation error if reference missing</expected_result>
      </test_case>
      <test_case>
        <name>Should include adjustments in VAT201 output</name>
        <type>integration</type>
        <expected_result>VAT201 response contains correct field 7-13 values</expected_result>
      </test_case>
      <test_case>
        <name>Should filter adjustments by organization and period</name>
        <type>unit</type>
        <expected_result>Only matching adjustments included in calculation</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Create test adjustment entries for each type</step>
      <step>Generate VAT201 and verify fields 7-13 reflect adjustment totals</step>
      <step>Verify business rule validation prevents invalid entries</step>
      <step>Confirm adjustment CRUD operations work correctly</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criterion>VatAdjustment entity created with proper schema</criterion>
    <criterion>Adjustment types enum matches SARS field 7-13 requirements</criterion>
    <criterion>Aggregation service correctly sums adjustments by type and period</criterion>
    <criterion>VAT201 service integrates adjustment data into response</criterion>
    <criterion>CRUD endpoints implemented for adjustment management</criterion>
    <criterion>Business rule validation implemented for each adjustment type</criterion>
    <criterion>Unit and integration tests pass with >80% coverage</criterion>
    <criterion>Documentation updated with adjustment field specifications</criterion>
    <criterion>Code review approved</criterion>
  </definition_of_done>
</task_specification>
