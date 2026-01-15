/**
 * SA VAT Compliance Tests - TASK-BILL-038
 *
 * Tests for South African VAT compliance per VAT Act No. 89 of 1991, Section 12(h).
 *
 * VAT EXEMPT (0%):
 * - Section 12(h)(iii) - Childcare services (MONTHLY_FEE)
 * - Section 12(h)(ii) - School fees (REGISTRATION, RE_REGISTRATION)
 * - Section 12(h)(ii) - Subordinate to education (EXTRA_MURAL)
 *
 * VAT APPLICABLE (15%):
 * - Goods: BOOKS, STATIONERY, UNIFORM, DAMAGED_EQUIPMENT
 * - Services: SCHOOL_TRIP, MEALS, TRANSPORT, LATE_PICKUP
 * - Configurable: AD_HOC (default applicable, override with isVatExempt)
 *
 * NO VAT:
 * - Adjustments: DISCOUNT, CREDIT
 */

import { LineType, isVatApplicable } from '../../entities/invoice-line.entity';

describe('SA VAT Compliance - isVatApplicable (TASK-BILL-038)', () => {
  describe('VAT EXEMPT items - Section 12(h) Educational Services', () => {
    it.each([
      [
        'MONTHLY_FEE',
        LineType.MONTHLY_FEE,
        'Section 12(h)(iii) - Childcare services',
      ],
      [
        'REGISTRATION',
        LineType.REGISTRATION,
        'Section 12(h)(ii) - School fees',
      ],
      [
        'RE_REGISTRATION',
        LineType.RE_REGISTRATION,
        'Section 12(h)(ii) - School fees',
      ],
      [
        'EXTRA_MURAL',
        LineType.EXTRA_MURAL,
        'Section 12(h)(ii) - Subordinate to education',
      ],
    ])('%s should be VAT EXEMPT per %s', (name, lineType, _legalBasis) => {
      const result = isVatApplicable(lineType);
      expect(result).toBe(false);
    });
  });

  describe('VAT APPLICABLE items - 15% Standard Rate (Goods & Non-Educational Services)', () => {
    it.each([
      ['BOOKS', LineType.BOOKS, 'Goods - not exempt'],
      ['STATIONERY', LineType.STATIONERY, 'Goods - not exempt'],
      ['UNIFORM', LineType.UNIFORM, 'Goods - not exempt'],
      ['SCHOOL_TRIP', LineType.SCHOOL_TRIP, 'Service - not educational'],
      ['MEALS', LineType.MEALS, 'Prepared food - not zero-rated'],
      ['TRANSPORT', LineType.TRANSPORT, 'Service - not educational'],
      ['LATE_PICKUP', LineType.LATE_PICKUP, 'Penalty - not educational'],
      ['DAMAGED_EQUIPMENT', LineType.DAMAGED_EQUIPMENT, 'Replacement - goods'],
      ['EXTRA', LineType.EXTRA, 'Deprecated - default applicable'],
    ])('%s should be VAT APPLICABLE per %s', (name, lineType, _reason) => {
      const result = isVatApplicable(lineType);
      expect(result).toBe(true);
    });
  });

  describe('NO VAT items - Adjustments', () => {
    it.each([
      ['DISCOUNT', LineType.DISCOUNT],
      ['CREDIT', LineType.CREDIT],
    ])('%s should NOT have VAT (adjustment)', (name, lineType) => {
      const result = isVatApplicable(lineType);
      expect(result).toBe(false);
    });
  });

  describe('AD_HOC with configurable VAT via isVatExempt override', () => {
    it('AD_HOC should be VAT APPLICABLE by default (no override)', () => {
      const result = isVatApplicable(LineType.AD_HOC);
      expect(result).toBe(true);
    });

    it('AD_HOC should be VAT APPLICABLE when isVatExempt=false', () => {
      const result = isVatApplicable(LineType.AD_HOC, false);
      expect(result).toBe(true);
    });

    it('AD_HOC should be VAT EXEMPT when isVatExempt=true', () => {
      const result = isVatApplicable(LineType.AD_HOC, true);
      expect(result).toBe(false);
    });

    it('AD_HOC with undefined override should be VAT APPLICABLE (default behavior)', () => {
      const result = isVatApplicable(LineType.AD_HOC, undefined);
      expect(result).toBe(true);
    });
  });

  describe('LineType enum completeness', () => {
    it('should have all required line types defined', () => {
      // VAT EXEMPT types
      expect(LineType.MONTHLY_FEE).toBe('MONTHLY_FEE');
      expect(LineType.REGISTRATION).toBe('REGISTRATION');
      expect(LineType.RE_REGISTRATION).toBe('RE_REGISTRATION');
      expect(LineType.EXTRA_MURAL).toBe('EXTRA_MURAL');

      // VAT APPLICABLE types
      expect(LineType.BOOKS).toBe('BOOKS');
      expect(LineType.STATIONERY).toBe('STATIONERY');
      expect(LineType.UNIFORM).toBe('UNIFORM');
      expect(LineType.SCHOOL_TRIP).toBe('SCHOOL_TRIP');
      expect(LineType.MEALS).toBe('MEALS');
      expect(LineType.TRANSPORT).toBe('TRANSPORT');
      expect(LineType.LATE_PICKUP).toBe('LATE_PICKUP');
      expect(LineType.DAMAGED_EQUIPMENT).toBe('DAMAGED_EQUIPMENT');
      expect(LineType.AD_HOC).toBe('AD_HOC');
      expect(LineType.EXTRA).toBe('EXTRA');

      // NO VAT types
      expect(LineType.DISCOUNT).toBe('DISCOUNT');
      expect(LineType.CREDIT).toBe('CREDIT');
    });

    it('should have exactly 16 line types', () => {
      const lineTypeValues = Object.values(LineType);
      expect(lineTypeValues).toHaveLength(16);
    });
  });

  describe('Exhaustive coverage - all LineTypes handled', () => {
    it('should handle all LineType enum values without throwing', () => {
      const allLineTypes = Object.values(LineType);

      for (const lineType of allLineTypes) {
        // Should not throw for any valid LineType
        expect(() => isVatApplicable(lineType)).not.toThrow();
      }
    });

    it('should throw for unknown LineType', () => {
      // This tests the exhaustive check at the end of isVatApplicable
      // TypeScript prevents invalid values at compile time, but we test runtime behavior
      const unknownType = 'UNKNOWN_TYPE' as LineType;

      expect(() => isVatApplicable(unknownType)).toThrow(
        /Unknown LineType.*UNKNOWN_TYPE/,
      );
    });
  });
});

describe('SA VAT Compliance - Business Scenarios', () => {
  describe('Creche Monthly Invoice Scenario', () => {
    it('should correctly identify VAT treatment for typical monthly invoice', () => {
      // Scenario: Monthly invoice for a child
      const invoiceItems = [
        { type: LineType.MONTHLY_FEE, description: 'Monthly Creche Fee' },
        { type: LineType.MEALS, description: 'Lunch (20 days)' },
        { type: LineType.UNIFORM, description: 'Winter Jacket' },
        { type: LineType.DISCOUNT, description: 'Sibling Discount (10%)' },
      ];

      const expectedVatTreatment = {
        [LineType.MONTHLY_FEE]: false, // VAT Exempt
        [LineType.MEALS]: true, // VAT Applicable
        [LineType.UNIFORM]: true, // VAT Applicable
        [LineType.DISCOUNT]: false, // No VAT
      };

      for (const item of invoiceItems) {
        expect(isVatApplicable(item.type)).toBe(
          expectedVatTreatment[item.type],
        );
      }
    });
  });

  describe('Ad-Hoc Charge VAT Override Scenario', () => {
    it('should allow VAT exempt override for educational extra-mural activity', () => {
      // Scenario: Swimming lessons - educational activity, should be exempt
      const swimLessons = {
        type: LineType.AD_HOC,
        description: 'Swimming Lessons (Educational)',
        isVatExempt: true, // Override: mark as exempt
      };

      expect(isVatApplicable(swimLessons.type, swimLessons.isVatExempt)).toBe(
        false,
      );
    });

    it('should apply VAT for non-educational ad-hoc charges', () => {
      // Scenario: Birthday party supplies - goods, should be applicable
      const partySupplies = {
        type: LineType.AD_HOC,
        description: 'Birthday Party Supplies',
        isVatExempt: false, // Not exempt
      };

      expect(
        isVatApplicable(partySupplies.type, partySupplies.isVatExempt),
      ).toBe(true);
    });
  });

  describe('New Student vs Returning Student Scenario', () => {
    it('should have VAT exempt registration for new student', () => {
      expect(isVatApplicable(LineType.REGISTRATION)).toBe(false);
    });

    it('should have VAT exempt re-registration for returning student', () => {
      expect(isVatApplicable(LineType.RE_REGISTRATION)).toBe(false);
    });
  });

  describe('Late Pickup Penalty Scenario', () => {
    it('should apply VAT to late pickup fees (penalty, not educational)', () => {
      expect(isVatApplicable(LineType.LATE_PICKUP)).toBe(true);
    });
  });

  describe('Transport Services Scenario', () => {
    it('should apply VAT to transport fees (service, not educational)', () => {
      expect(isVatApplicable(LineType.TRANSPORT)).toBe(true);
    });
  });

  describe('Damaged Equipment Scenario', () => {
    it('should apply VAT to damaged equipment charges (replacement goods)', () => {
      expect(isVatApplicable(LineType.DAMAGED_EQUIPMENT)).toBe(true);
    });
  });
});
