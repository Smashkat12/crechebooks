<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-004</task_id>
    <title>Fix VAT Integer Division</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Bug Fix</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>2-4 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>vat</tag>
      <tag>financial-calculations</tag>
      <tag>precision</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      The VAT calculation service uses integer division approximation which can lead to
      rounding errors in tax calculations. Financial calculations require precise decimal
      arithmetic to ensure accurate tax reporting and compliance.
    </problem_statement>

    <current_behavior>
      - Uses native JavaScript number arithmetic
      - Integer division causes truncation errors
      - Accumulated rounding errors in batch calculations
      - Potential tax compliance issues
      - Example: 115 / 1.15 = 99.99999999999999 instead of 100
    </current_behavior>

    <expected_behavior>
      - Use Decimal.js for all VAT calculations
      - Proper rounding to 2 decimal places
      - Configurable VAT rates per tenant
      - Accurate inclusive/exclusive VAT conversions
      - Audit-ready calculation precision
    </expected_behavior>

    <impact>
      - Tax compliance: Inaccurate VAT calculations could lead to audit issues
      - Financial reporting: Rounding errors accumulate in reports
      - Reconciliation: Discrepancies between calculated and actual values
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/transactions/vat.service.ts</path>
        <changes>Replace native arithmetic with Decimal.js</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/transactions/__tests__/vat.service.spec.ts</path>
        <purpose>Comprehensive VAT calculation tests</purpose>
      </file>
    </files_to_create>

    <dependencies>
      <dependency>
        <name>decimal.js</name>
        <version>^10.4.0</version>
        <purpose>Arbitrary-precision decimal arithmetic</purpose>
      </dependency>
    </dependencies>

    <out_of_scope>
      <item>VAT rate configuration UI</item>
      <item>Historical recalculation of existing transactions</item>
      <item>Multi-country VAT rules</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Replace all native JavaScript arithmetic operations in the VAT service with
      Decimal.js methods. Ensure consistent rounding using ROUND_HALF_UP method
      (banker's rounding for financial calculations). Add comprehensive tests for
      edge cases.
    </approach>

    <pseudocode>
```typescript
import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

interface VatCalculationResult {
  grossAmount: string;      // VAT inclusive amount
  netAmount: string;        // VAT exclusive amount
  vatAmount: string;        // VAT portion
  vatRate: string;          // Applied VAT rate
  calculationMethod: 'inclusive' | 'exclusive';
}

@Injectable()
export class VatService {
  private readonly DEFAULT_VAT_RATE = new Decimal('0.15'); // 15% SA VAT

  /**
   * Calculate VAT from a VAT-inclusive amount
   * Formula: VAT = Gross - (Gross / (1 + rate))
   */
  calculateVatFromInclusive(
    grossAmount: number | string,
    vatRate?: number | string
  ): VatCalculationResult {
    const gross = new Decimal(grossAmount);
    const rate = new Decimal(vatRate ?? this.DEFAULT_VAT_RATE);

    // Validate inputs
    if (gross.isNegative()) {
      throw new BadRequestException('Gross amount cannot be negative');
    }
    if (rate.isNegative() || rate.greaterThan(1)) {
      throw new BadRequestException('VAT rate must be between 0 and 1');
    }

    // Calculate net amount: net = gross / (1 + rate)
    const divisor = new Decimal(1).plus(rate);
    const net = gross.dividedBy(divisor).toDecimalPlaces(2);

    // Calculate VAT amount: vat = gross - net
    const vat = gross.minus(net).toDecimalPlaces(2);

    return {
      grossAmount: gross.toFixed(2),
      netAmount: net.toFixed(2),
      vatAmount: vat.toFixed(2),
      vatRate: rate.toFixed(4),
      calculationMethod: 'inclusive',
    };
  }

  /**
   * Calculate VAT from a VAT-exclusive amount
   * Formula: VAT = Net * rate
   */
  calculateVatFromExclusive(
    netAmount: number | string,
    vatRate?: number | string
  ): VatCalculationResult {
    const net = new Decimal(netAmount);
    const rate = new Decimal(vatRate ?? this.DEFAULT_VAT_RATE);

    // Validate inputs
    if (net.isNegative()) {
      throw new BadRequestException('Net amount cannot be negative');
    }
    if (rate.isNegative() || rate.greaterThan(1)) {
      throw new BadRequestException('VAT rate must be between 0 and 1');
    }

    // Calculate VAT: vat = net * rate
    const vat = net.times(rate).toDecimalPlaces(2);

    // Calculate gross: gross = net + vat
    const gross = net.plus(vat).toDecimalPlaces(2);

    return {
      grossAmount: gross.toFixed(2),
      netAmount: net.toFixed(2),
      vatAmount: vat.toFixed(2),
      vatRate: rate.toFixed(4),
      calculationMethod: 'exclusive',
    };
  }

  /**
   * Verify VAT calculation consistency
   * Ensures: gross = net + vat (within tolerance)
   */
  verifyCalculation(result: VatCalculationResult): boolean {
    const gross = new Decimal(result.grossAmount);
    const net = new Decimal(result.netAmount);
    const vat = new Decimal(result.vatAmount);

    const calculatedGross = net.plus(vat);
    const difference = gross.minus(calculatedGross).abs();

    // Allow 1 cent tolerance for rounding
    return difference.lessThanOrEqualTo(new Decimal('0.01'));
  }

  /**
   * Batch calculate VAT for multiple transactions
   * Returns totals with verification
   */
  calculateBatchVat(
    amounts: Array<{ amount: number | string; isInclusive: boolean }>,
    vatRate?: number | string
  ): {
    results: VatCalculationResult[];
    totals: {
      totalGross: string;
      totalNet: string;
      totalVat: string;
    };
    verified: boolean;
  } {
    const results = amounts.map(({ amount, isInclusive }) =>
      isInclusive
        ? this.calculateVatFromInclusive(amount, vatRate)
        : this.calculateVatFromExclusive(amount, vatRate)
    );

    // Calculate totals using Decimal
    let totalGross = new Decimal(0);
    let totalNet = new Decimal(0);
    let totalVat = new Decimal(0);

    for (const result of results) {
      totalGross = totalGross.plus(result.grossAmount);
      totalNet = totalNet.plus(result.netAmount);
      totalVat = totalVat.plus(result.vatAmount);
    }

    // Verify totals consistency
    const verified = totalGross.equals(totalNet.plus(totalVat));

    return {
      results,
      totals: {
        totalGross: totalGross.toFixed(2),
        totalNet: totalNet.toFixed(2),
        totalVat: totalVat.toFixed(2),
      },
      verified,
    };
  }
}
```
    </pseudocode>

    <technical_notes>
      - Use Decimal.js ROUND_HALF_UP for financial compliance
      - Store results as strings to preserve precision in JSON
      - Always use toDecimalPlaces(2) for currency amounts
      - Validate inputs to prevent NaN propagation
      - Include verification method for audit purposes
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should calculate VAT from inclusive amount correctly</name>
        <input>grossAmount: 115.00, vatRate: 0.15</input>
        <expected_result>netAmount: 100.00, vatAmount: 15.00</expected_result>
      </test_case>
      <test_case>
        <name>Should calculate VAT from exclusive amount correctly</name>
        <input>netAmount: 100.00, vatRate: 0.15</input>
        <expected_result>grossAmount: 115.00, vatAmount: 15.00</expected_result>
      </test_case>
      <test_case>
        <name>Should handle problematic floating point values</name>
        <input>grossAmount: 0.1 + 0.2 (0.30000000000000004)</input>
        <expected_result>Correct calculation without precision errors</expected_result>
      </test_case>
      <test_case>
        <name>Should maintain consistency: gross = net + vat</name>
        <input>Various amounts with different VAT rates</input>
        <expected_result>verifyCalculation returns true</expected_result>
      </test_case>
      <test_case>
        <name>Should handle edge case: very small amounts</name>
        <input>grossAmount: 0.01</input>
        <expected_result>Valid result with proper rounding</expected_result>
      </test_case>
      <test_case>
        <name>Should handle edge case: very large amounts</name>
        <input>grossAmount: 999999999.99</input>
        <expected_result>Accurate calculation without overflow</expected_result>
      </test_case>
      <test_case>
        <name>Should calculate batch totals accurately</name>
        <input>Array of 100 transactions</input>
        <expected_result>Totals match sum of individual calculations</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Compare calculation results with calculator/spreadsheet</step>
      <step>Verify rounding matches SA VAT regulations</step>
      <step>Test with known problematic floating point values</step>
      <step>Batch calculate and verify totals balance</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All VAT calculations use Decimal.js</criterion>
      <criterion>Consistent 2 decimal place rounding</criterion>
      <criterion>Verification method confirms calculation accuracy</criterion>
      <criterion>Unit tests cover edge cases and precision scenarios</criterion>
      <criterion>No floating point errors in test results</criterion>
      <criterion>Batch calculations maintain running total accuracy</criterion>
      <criterion>Negative input validation implemented</criterion>
      <criterion>Documentation updated with precision guarantees</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>VAT Service</title>
      <path>apps/api/src/transactions/vat.service.ts</path>
    </reference>
    <reference>
      <title>Decimal.js Documentation</title>
      <url>https://mikemcl.github.io/decimal.js/</url>
    </reference>
    <reference>
      <title>SA VAT Regulations</title>
      <url>https://www.sars.gov.za/types-of-tax/value-added-tax/</url>
    </reference>
  </references>
</task_specification>
