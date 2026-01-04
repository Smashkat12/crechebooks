<task_spec id="TASK-BILL-018" version="1.0">

<metadata>
  <title>VAT Calculation for VAT-Registered Creches</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>130</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-BILL-012</requirement_ref>
    <edge_case_ref>EC-BILL-009</edge_case_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-012</task_ref>
    <task_ref status="COMPLETE">TASK-SARS-011</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use South African tax compliance and financial calculation thinking.
This task involves:
1. Determining if creche is VAT-registered (threshold R1M turnover)
2. Calculating VAT on school fee invoices (15% standard rate)
3. Displaying VAT breakdown on invoices
4. Tracking VAT registration status per tenant
5. Handling VAT registration transition
</reasoning_mode>

<context>
GAP: REQ-BILL-012 specifies "VAT calculated correctly on fee invoices based on creche VAT registration status."

Current state: Invoices are generated WITHOUT VAT calculation. VAT-registered creches must:
- Add 15% VAT to invoices
- Display VAT amount separately
- Track output VAT for VAT201 submissions

Edge Case EC-BILL-009: "Creche crosses VAT registration threshold mid-year" - system must alert when approaching R1M and handle registration date correctly.

SA VAT Rate: 15% (effective 1 April 2018)
</context>

<current_state>
## Codebase State
- Tenant entity exists but has no vatRegistered field
- InvoiceGenerationService creates invoices without VAT
- VatCalculationService exists for input VAT (TASK-SARS-011)
- Invoice entity has total but no vatAmount field

## What Needs to Be Added
```typescript
// Tenant entity needs:
vatRegistered: boolean;
vatNumber?: string;
vatRegistrationDate?: Date;

// Invoice entity needs:
subtotal: Decimal;
vatAmount: Decimal;
total: Decimal;  // Already exists
vatRate: number;
```
</current_state>

<input_context_files>
  <file purpose="tenant_entity">apps/api/src/database/entities/tenant.entity.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="invoice_service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="vat_service">apps/api/src/database/services/vat-calculation.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Tenant VAT registration fields
    - Invoice VAT calculation during generation
    - VAT breakdown on invoice (subtotal, VAT, total)
    - VAT registration status check
    - Turnover threshold tracking
    - Alert when approaching R1M threshold
    - VAT registration date handling
  </in_scope>
  <out_of_scope>
    - VAT201 generation changes (uses VatCalculationService)
    - VAT-exempt items (school fees are standard-rated)
    - Invoice template changes (surface layer)
    - Xero VAT sync
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/entities/tenant.entity.ts">
      // Add to existing entity
      @Column({ default: false })
      vatRegistered: boolean;

      @Column({ nullable: true })
      vatNumber?: string;

      @Column({ type: 'date', nullable: true })
      vatRegistrationDate?: Date;

      @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
      cumulativeTurnover: Decimal;
    </signature>
    <signature file="apps/api/src/database/services/invoice-vat.service.ts">
      export interface VatCalculationResult {
        subtotal: Decimal;
        vatRate: number;
        vatAmount: Decimal;
        total: Decimal;
        isVatRegistered: boolean;
      }

      @Injectable()
      export class InvoiceVatService {
        async calculateInvoiceVat(
          tenantId: string,
          subtotal: Decimal,
          invoiceDate: Date
        ): Promise<VatCalculationResult>;

        async checkVatThreshold(tenantId: string): Promise<{
          currentTurnover: Decimal;
          threshold: Decimal;
          percentToThreshold: number;
          alertLevel: 'none' | 'approaching' | 'imminent' | 'exceeded';
        }>;

        async registerForVat(
          tenantId: string,
          vatNumber: string,
          registrationDate: Date
        ): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - VAT rate: 15% (hardcoded, SA standard rate)
    - VAT threshold: R1,000,000 annual turnover
    - Alert levels: R800K (approaching), R950K (imminent), R1M (exceeded)
    - Only apply VAT to invoices after registration date
    - Use Decimal.js for all calculations
    - Subtotal + VAT = Total (exactly, banker's rounding)
    - Store VAT rate per invoice (for historical accuracy)
  </constraints>

  <verification>
    - Non-VAT tenant: invoices have no VAT
    - VAT tenant: invoices show subtotal, VAT, total
    - VAT calculated at 15%
    - Threshold alerts generated
    - Registration date respected
    - Decimal precision maintained
    - Migration runs successfully
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/invoice-vat.service.ts">VAT calculation for invoices</file>
  <file path="apps/api/src/database/services/__tests__/invoice-vat.service.spec.ts">Tests</file>
  <file path="apps/api/prisma/migrations/xxx_add_vat_fields/migration.sql">Migration</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/entities/tenant.entity.ts">Add VAT fields</file>
  <file path="apps/api/src/database/entities/invoice.entity.ts">Add VAT fields</file>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">Integrate VAT calculation</file>
  <file path="apps/api/prisma/schema.prisma">Schema updates</file>
</files_to_modify>

<validation_criteria>
  <criterion>VAT fields added to Tenant and Invoice</criterion>
  <criterion>InvoiceVatService created</criterion>
  <criterion>VAT calculated correctly (15%)</criterion>
  <criterion>Non-VAT invoices unchanged</criterion>
  <criterion>Threshold alerts work</criterion>
  <criterion>Registration date respected</criterion>
  <criterion>Migration successful</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_vat_fields</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="invoice-vat" --verbose</command>
</test_commands>

</task_spec>
