/**
 * LeaveTypeMapper Service Tests
 * TASK-STAFF-004
 *
 * Comprehensive tests for leave type mapping between internal
 * CrecheBooks types and external systems (SimplePay, Xero).
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaveTypeMapper } from '../../../src/database/services/leave-type.mapper';
import {
  LeaveType,
  LEAVE_TYPE_CONFIG,
  SIMPLEPAY_LEAVE_TYPE_MAP,
  XERO_LEAVE_TYPE_MAP,
  STATUTORY_LEAVE_TYPES,
  PAID_LEAVE_TYPES,
  UIF_COVERED_LEAVE_TYPES,
} from '../../../src/database/constants/leave-types.constants';

describe('LeaveTypeMapper', () => {
  let service: LeaveTypeMapper;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveTypeMapper],
    }).compile();

    service = module.get<LeaveTypeMapper>(LeaveTypeMapper);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('SimplePay Mappings', () => {
    describe('toSimplePay', () => {
      it('should map ANNUAL to SimplePay ANNUAL', () => {
        expect(service.toSimplePay(LeaveType.ANNUAL)).toBe('ANNUAL');
      });

      it('should map SICK to SimplePay SICK', () => {
        expect(service.toSimplePay(LeaveType.SICK)).toBe('SICK');
      });

      it('should map FAMILY_RESPONSIBILITY to SimplePay FAMILY', () => {
        expect(service.toSimplePay(LeaveType.FAMILY_RESPONSIBILITY)).toBe(
          'FAMILY',
        );
      });

      it('should map MATERNITY to SimplePay MATERNITY', () => {
        expect(service.toSimplePay(LeaveType.MATERNITY)).toBe('MATERNITY');
      });

      it('should map PARENTAL to SimplePay PARENTAL', () => {
        expect(service.toSimplePay(LeaveType.PARENTAL)).toBe('PARENTAL');
      });

      it('should map ADOPTION to SimplePay ADOPTION', () => {
        expect(service.toSimplePay(LeaveType.ADOPTION)).toBe('ADOPTION');
      });

      it('should map COMMISSIONING_PARENTAL to SimplePay PARENTAL', () => {
        // Commissioning parental maps to PARENTAL in SimplePay
        expect(service.toSimplePay(LeaveType.COMMISSIONING_PARENTAL)).toBe(
          'PARENTAL',
        );
      });

      it('should map STUDY to SimplePay STUDY', () => {
        expect(service.toSimplePay(LeaveType.STUDY)).toBe('STUDY');
      });

      it('should map UNPAID to SimplePay UNPAID', () => {
        expect(service.toSimplePay(LeaveType.UNPAID)).toBe('UNPAID');
      });

      it('should map COMPASSIONATE to SimplePay COMPASSIONATE', () => {
        expect(service.toSimplePay(LeaveType.COMPASSIONATE)).toBe(
          'COMPASSIONATE',
        );
      });

      it('should map SPECIAL to SimplePay SPECIAL', () => {
        expect(service.toSimplePay(LeaveType.SPECIAL)).toBe('SPECIAL');
      });

      it('should map COVID_QUARANTINE to SimplePay COVID', () => {
        expect(service.toSimplePay(LeaveType.COVID_QUARANTINE)).toBe('COVID');
      });

      it('should map SCHOOL_HOLIDAYS to SimplePay CUSTOM_1', () => {
        expect(service.toSimplePay(LeaveType.SCHOOL_HOLIDAYS)).toBe('CUSTOM_1');
      });

      it('should map TRAINING to SimplePay CUSTOM_2', () => {
        expect(service.toSimplePay(LeaveType.TRAINING)).toBe('CUSTOM_2');
      });

      it('should map all leave types to SimplePay', () => {
        // Verify every LeaveType has a mapping
        const allTypes = Object.values(LeaveType);
        allTypes.forEach((type) => {
          const mapped = service.toSimplePay(type);
          expect(mapped).toBeDefined();
          expect(typeof mapped).toBe('string');
          expect(mapped.length).toBeGreaterThan(0);
        });
      });
    });

    describe('toSimplePayWithMeta', () => {
      it('should return exact match metadata for known types', () => {
        const result = service.toSimplePayWithMeta(LeaveType.ANNUAL);
        expect(result.value).toBe('ANNUAL');
        expect(result.isExactMatch).toBe(true);
        expect(result.originalValue).toBe(LeaveType.ANNUAL);
      });
    });

    describe('fromSimplePay', () => {
      it('should map SimplePay ANNUAL to internal ANNUAL', () => {
        expect(service.fromSimplePay('ANNUAL')).toBe(LeaveType.ANNUAL);
      });

      it('should map SimplePay SICK to internal SICK', () => {
        expect(service.fromSimplePay('SICK')).toBe(LeaveType.SICK);
      });

      it('should map SimplePay FAMILY to internal FAMILY_RESPONSIBILITY', () => {
        expect(service.fromSimplePay('FAMILY')).toBe(
          LeaveType.FAMILY_RESPONSIBILITY,
        );
      });

      it('should map SimplePay MATERNITY to internal MATERNITY', () => {
        expect(service.fromSimplePay('MATERNITY')).toBe(LeaveType.MATERNITY);
      });

      it('should map SimplePay PARENTAL to internal PARENTAL', () => {
        expect(service.fromSimplePay('PARENTAL')).toBe(LeaveType.PARENTAL);
      });

      it('should map SimplePay ADOPTION to internal ADOPTION', () => {
        expect(service.fromSimplePay('ADOPTION')).toBe(LeaveType.ADOPTION);
      });

      it('should map SimplePay COVID to internal COVID_QUARANTINE', () => {
        expect(service.fromSimplePay('COVID')).toBe(LeaveType.COVID_QUARANTINE);
      });

      it('should map SimplePay CUSTOM_1 to internal SCHOOL_HOLIDAYS', () => {
        expect(service.fromSimplePay('CUSTOM_1')).toBe(
          LeaveType.SCHOOL_HOLIDAYS,
        );
      });

      it('should map SimplePay CUSTOM_2 to internal TRAINING', () => {
        expect(service.fromSimplePay('CUSTOM_2')).toBe(LeaveType.TRAINING);
      });

      it('should map SimplePay OTHER to internal SPECIAL (fallback)', () => {
        expect(service.fromSimplePay('OTHER')).toBe(LeaveType.SPECIAL);
      });

      it('should handle case-insensitive input', () => {
        expect(service.fromSimplePay('annual')).toBe(LeaveType.ANNUAL);
        expect(service.fromSimplePay('Annual')).toBe(LeaveType.ANNUAL);
        expect(service.fromSimplePay('ANNUAL')).toBe(LeaveType.ANNUAL);
      });

      it('should handle whitespace in input', () => {
        expect(service.fromSimplePay('  ANNUAL  ')).toBe(LeaveType.ANNUAL);
      });

      it('should fallback to SPECIAL for unknown types', () => {
        expect(service.fromSimplePay('UNKNOWN_TYPE')).toBe(LeaveType.SPECIAL);
        expect(service.fromSimplePay('RANDOM')).toBe(LeaveType.SPECIAL);
      });
    });

    describe('fromSimplePayWithMeta', () => {
      it('should return exact match metadata for known types', () => {
        const result = service.fromSimplePayWithMeta('ANNUAL');
        expect(result.value).toBe(LeaveType.ANNUAL);
        expect(result.isExactMatch).toBe(true);
        expect(result.originalValue).toBe('ANNUAL');
      });

      it('should return non-exact match for unknown types', () => {
        const result = service.fromSimplePayWithMeta('UNKNOWN');
        expect(result.value).toBe(LeaveType.SPECIAL);
        expect(result.isExactMatch).toBe(false);
        expect(result.originalValue).toBe('UNKNOWN');
      });
    });
  });

  describe('Xero Mappings', () => {
    describe('toXero', () => {
      it('should map ANNUAL to Xero annual-leave', () => {
        expect(service.toXero(LeaveType.ANNUAL)).toBe('annual-leave');
      });

      it('should map SICK to Xero sick-leave', () => {
        expect(service.toXero(LeaveType.SICK)).toBe('sick-leave');
      });

      it('should map FAMILY_RESPONSIBILITY to Xero family-responsibility-leave', () => {
        expect(service.toXero(LeaveType.FAMILY_RESPONSIBILITY)).toBe(
          'family-responsibility-leave',
        );
      });

      it('should map MATERNITY to Xero maternity-leave', () => {
        expect(service.toXero(LeaveType.MATERNITY)).toBe('maternity-leave');
      });

      it('should map PARENTAL to Xero parental-leave', () => {
        expect(service.toXero(LeaveType.PARENTAL)).toBe('parental-leave');
      });

      it('should map ADOPTION to Xero adoption-leave', () => {
        expect(service.toXero(LeaveType.ADOPTION)).toBe('adoption-leave');
      });

      it('should map COMMISSIONING_PARENTAL to Xero parental-leave', () => {
        expect(service.toXero(LeaveType.COMMISSIONING_PARENTAL)).toBe(
          'parental-leave',
        );
      });

      it('should map STUDY to Xero study-leave', () => {
        expect(service.toXero(LeaveType.STUDY)).toBe('study-leave');
      });

      it('should map UNPAID to Xero unpaid-leave', () => {
        expect(service.toXero(LeaveType.UNPAID)).toBe('unpaid-leave');
      });

      it('should map COMPASSIONATE to Xero compassionate-leave', () => {
        expect(service.toXero(LeaveType.COMPASSIONATE)).toBe(
          'compassionate-leave',
        );
      });

      it('should map SPECIAL to Xero other-leave', () => {
        expect(service.toXero(LeaveType.SPECIAL)).toBe('other-leave');
      });

      it('should map COVID_QUARANTINE to Xero quarantine-leave', () => {
        expect(service.toXero(LeaveType.COVID_QUARANTINE)).toBe(
          'quarantine-leave',
        );
      });

      it('should map SCHOOL_HOLIDAYS to Xero other-leave', () => {
        expect(service.toXero(LeaveType.SCHOOL_HOLIDAYS)).toBe('other-leave');
      });

      it('should map TRAINING to Xero training-leave', () => {
        expect(service.toXero(LeaveType.TRAINING)).toBe('training-leave');
      });

      it('should map all leave types to Xero', () => {
        const allTypes = Object.values(LeaveType);
        allTypes.forEach((type) => {
          const mapped = service.toXero(type);
          expect(mapped).toBeDefined();
          expect(typeof mapped).toBe('string');
          expect(mapped.length).toBeGreaterThan(0);
        });
      });
    });

    describe('toXeroWithMeta', () => {
      it('should return exact match metadata for known types', () => {
        const result = service.toXeroWithMeta(LeaveType.ANNUAL);
        expect(result.value).toBe('annual-leave');
        expect(result.isExactMatch).toBe(true);
        expect(result.originalValue).toBe(LeaveType.ANNUAL);
      });
    });

    describe('fromXero', () => {
      it('should map Xero annual-leave to internal ANNUAL', () => {
        expect(service.fromXero('annual-leave')).toBe(LeaveType.ANNUAL);
      });

      it('should map Xero sick-leave to internal SICK', () => {
        expect(service.fromXero('sick-leave')).toBe(LeaveType.SICK);
      });

      it('should map Xero family-responsibility-leave to internal FAMILY_RESPONSIBILITY', () => {
        expect(service.fromXero('family-responsibility-leave')).toBe(
          LeaveType.FAMILY_RESPONSIBILITY,
        );
      });

      it('should map Xero maternity-leave to internal MATERNITY', () => {
        expect(service.fromXero('maternity-leave')).toBe(LeaveType.MATERNITY);
      });

      it('should map Xero parental-leave to internal PARENTAL', () => {
        expect(service.fromXero('parental-leave')).toBe(LeaveType.PARENTAL);
      });

      it('should map Xero adoption-leave to internal ADOPTION', () => {
        expect(service.fromXero('adoption-leave')).toBe(LeaveType.ADOPTION);
      });

      it('should map Xero other-leave to internal SPECIAL', () => {
        expect(service.fromXero('other-leave')).toBe(LeaveType.SPECIAL);
      });

      it('should map Xero quarantine-leave to internal COVID_QUARANTINE', () => {
        expect(service.fromXero('quarantine-leave')).toBe(
          LeaveType.COVID_QUARANTINE,
        );
      });

      it('should map Xero training-leave to internal TRAINING', () => {
        expect(service.fromXero('training-leave')).toBe(LeaveType.TRAINING);
      });

      it('should handle case-insensitive input', () => {
        expect(service.fromXero('Annual-Leave')).toBe(LeaveType.ANNUAL);
        expect(service.fromXero('ANNUAL-LEAVE')).toBe(LeaveType.ANNUAL);
      });

      it('should handle whitespace in input', () => {
        expect(service.fromXero('  annual-leave  ')).toBe(LeaveType.ANNUAL);
      });

      it('should fallback to SPECIAL for unknown types', () => {
        expect(service.fromXero('unknown-leave')).toBe(LeaveType.SPECIAL);
        expect(service.fromXero('random-type')).toBe(LeaveType.SPECIAL);
      });
    });

    describe('fromXeroWithMeta', () => {
      it('should return exact match metadata for known types', () => {
        const result = service.fromXeroWithMeta('annual-leave');
        expect(result.value).toBe(LeaveType.ANNUAL);
        expect(result.isExactMatch).toBe(true);
        expect(result.originalValue).toBe('annual-leave');
      });

      it('should return non-exact match for unknown types', () => {
        const result = service.fromXeroWithMeta('unknown-leave');
        expect(result.value).toBe(LeaveType.SPECIAL);
        expect(result.isExactMatch).toBe(false);
        expect(result.originalValue).toBe('unknown-leave');
      });
    });
  });

  describe('Leave Type Configuration', () => {
    describe('getConfig', () => {
      it('should return configuration for ANNUAL leave', () => {
        const config = service.getConfig(LeaveType.ANNUAL);
        expect(config.type).toBe(LeaveType.ANNUAL);
        expect(config.name).toBe('Annual Leave');
        expect(config.isPaid).toBe(true);
        expect(config.isStatutory).toBe(true);
        expect(config.defaultEntitlement).toBe(21);
        expect(config.accrualBasis).toBe('ANNUAL');
      });

      it('should return configuration for SICK leave', () => {
        const config = service.getConfig(LeaveType.SICK);
        expect(config.type).toBe(LeaveType.SICK);
        expect(config.name).toBe('Sick Leave');
        expect(config.isPaid).toBe(true);
        expect(config.isStatutory).toBe(true);
        expect(config.defaultEntitlement).toBe(30);
        expect(config.accrualBasis).toBe('CYCLE_3_YEAR');
        expect(config.requiresCertificate).toBe(true);
      });

      it('should return configuration for MATERNITY leave', () => {
        const config = service.getConfig(LeaveType.MATERNITY);
        expect(config.type).toBe(LeaveType.MATERNITY);
        expect(config.isPaid).toBe(false); // UIF covers
        expect(config.isStatutory).toBe(true);
        expect(config.defaultEntitlement).toBe(120); // ~4 months
        expect(config.accrualBasis).toBe('EVENT');
      });

      it('should return configuration for FAMILY_RESPONSIBILITY leave', () => {
        const config = service.getConfig(LeaveType.FAMILY_RESPONSIBILITY);
        expect(config.type).toBe(LeaveType.FAMILY_RESPONSIBILITY);
        expect(config.isPaid).toBe(true);
        expect(config.isStatutory).toBe(true);
        expect(config.defaultEntitlement).toBe(3);
        expect(config.minServiceMonths).toBe(4);
      });

      it('should throw error for unknown leave type', () => {
        expect(() => service.getConfig('INVALID' as LeaveType)).toThrow(
          'Unknown leave type',
        );
      });
    });

    describe('getConfigSafe', () => {
      it('should return configuration for valid types', () => {
        const config = service.getConfigSafe(LeaveType.ANNUAL);
        expect(config).not.toBeNull();
        expect(config?.type).toBe(LeaveType.ANNUAL);
      });

      it('should return null for invalid types', () => {
        const config = service.getConfigSafe('INVALID' as LeaveType);
        expect(config).toBeNull();
      });
    });
  });

  describe('Leave Type Checks', () => {
    describe('isStatutory', () => {
      it('should return true for statutory leave types', () => {
        expect(service.isStatutory(LeaveType.ANNUAL)).toBe(true);
        expect(service.isStatutory(LeaveType.SICK)).toBe(true);
        expect(service.isStatutory(LeaveType.FAMILY_RESPONSIBILITY)).toBe(true);
        expect(service.isStatutory(LeaveType.MATERNITY)).toBe(true);
        expect(service.isStatutory(LeaveType.PARENTAL)).toBe(true);
        expect(service.isStatutory(LeaveType.ADOPTION)).toBe(true);
        expect(service.isStatutory(LeaveType.COMMISSIONING_PARENTAL)).toBe(
          true,
        );
      });

      it('should return false for non-statutory leave types', () => {
        expect(service.isStatutory(LeaveType.STUDY)).toBe(false);
        expect(service.isStatutory(LeaveType.UNPAID)).toBe(false);
        expect(service.isStatutory(LeaveType.COMPASSIONATE)).toBe(false);
        expect(service.isStatutory(LeaveType.SPECIAL)).toBe(false);
        expect(service.isStatutory(LeaveType.COVID_QUARANTINE)).toBe(false);
        expect(service.isStatutory(LeaveType.SCHOOL_HOLIDAYS)).toBe(false);
        expect(service.isStatutory(LeaveType.TRAINING)).toBe(false);
      });
    });

    describe('isPaid', () => {
      it('should return true for paid leave types', () => {
        expect(service.isPaid(LeaveType.ANNUAL)).toBe(true);
        expect(service.isPaid(LeaveType.SICK)).toBe(true);
        expect(service.isPaid(LeaveType.FAMILY_RESPONSIBILITY)).toBe(true);
        expect(service.isPaid(LeaveType.STUDY)).toBe(true);
        expect(service.isPaid(LeaveType.COMPASSIONATE)).toBe(true);
      });

      it('should return false for unpaid/UIF-covered leave types', () => {
        expect(service.isPaid(LeaveType.MATERNITY)).toBe(false);
        expect(service.isPaid(LeaveType.PARENTAL)).toBe(false);
        expect(service.isPaid(LeaveType.ADOPTION)).toBe(false);
        expect(service.isPaid(LeaveType.UNPAID)).toBe(false);
      });
    });

    describe('isUifCovered', () => {
      it('should return true for UIF-covered leave types', () => {
        expect(service.isUifCovered(LeaveType.MATERNITY)).toBe(true);
        expect(service.isUifCovered(LeaveType.PARENTAL)).toBe(true);
        expect(service.isUifCovered(LeaveType.ADOPTION)).toBe(true);
        expect(service.isUifCovered(LeaveType.COMMISSIONING_PARENTAL)).toBe(
          true,
        );
      });

      it('should return false for non-UIF-covered leave types', () => {
        expect(service.isUifCovered(LeaveType.ANNUAL)).toBe(false);
        expect(service.isUifCovered(LeaveType.SICK)).toBe(false);
        expect(service.isUifCovered(LeaveType.STUDY)).toBe(false);
      });
    });

    describe('requiresCertificate', () => {
      it('should return true for leave types requiring documentation', () => {
        expect(service.requiresCertificate(LeaveType.SICK)).toBe(true);
        expect(service.requiresCertificate(LeaveType.MATERNITY)).toBe(true);
        expect(
          service.requiresCertificate(LeaveType.FAMILY_RESPONSIBILITY),
        ).toBe(true);
        expect(service.requiresCertificate(LeaveType.COVID_QUARANTINE)).toBe(
          true,
        );
      });

      it('should return false for leave types not requiring documentation', () => {
        expect(service.requiresCertificate(LeaveType.ANNUAL)).toBe(false);
        expect(service.requiresCertificate(LeaveType.UNPAID)).toBe(false);
        expect(service.requiresCertificate(LeaveType.SPECIAL)).toBe(false);
      });
    });
  });

  describe('Leave Type Helpers', () => {
    describe('getDefaultEntitlement', () => {
      it('should return correct entitlement for ANNUAL leave', () => {
        expect(service.getDefaultEntitlement(LeaveType.ANNUAL)).toBe(21);
      });

      it('should return correct entitlement for SICK leave', () => {
        expect(service.getDefaultEntitlement(LeaveType.SICK)).toBe(30);
      });

      it('should return correct entitlement for FAMILY_RESPONSIBILITY', () => {
        expect(
          service.getDefaultEntitlement(LeaveType.FAMILY_RESPONSIBILITY),
        ).toBe(3);
      });

      it('should return correct entitlement for MATERNITY leave', () => {
        expect(service.getDefaultEntitlement(LeaveType.MATERNITY)).toBe(120);
      });

      it('should return null for leave types with no fixed entitlement', () => {
        expect(service.getDefaultEntitlement(LeaveType.UNPAID)).toBeNull();
        expect(service.getDefaultEntitlement(LeaveType.STUDY)).toBeNull();
      });
    });

    describe('getName', () => {
      it('should return human-readable names', () => {
        expect(service.getName(LeaveType.ANNUAL)).toBe('Annual Leave');
        expect(service.getName(LeaveType.SICK)).toBe('Sick Leave');
        expect(service.getName(LeaveType.FAMILY_RESPONSIBILITY)).toBe(
          'Family Responsibility Leave',
        );
        expect(service.getName(LeaveType.MATERNITY)).toBe('Maternity Leave');
      });
    });

    describe('getDescription', () => {
      it('should return descriptions for leave types', () => {
        const description = service.getDescription(LeaveType.ANNUAL);
        expect(description).toContain('annual vacation leave');
        expect(description).toContain('21 consecutive days');
      });
    });
  });

  describe('Leave Type Lists', () => {
    describe('getAllTypes', () => {
      it('should return all leave types', () => {
        const allTypes = service.getAllTypes();
        expect(allTypes.length).toBe(Object.values(LeaveType).length);
        expect(allTypes).toContain(LeaveType.ANNUAL);
        expect(allTypes).toContain(LeaveType.SICK);
        expect(allTypes).toContain(LeaveType.MATERNITY);
        expect(allTypes).toContain(LeaveType.TRAINING);
      });
    });

    describe('getStatutoryTypes', () => {
      it('should return only statutory leave types', () => {
        const statutory = service.getStatutoryTypes();
        expect(statutory.length).toBe(STATUTORY_LEAVE_TYPES.length);
        expect(statutory).toContain(LeaveType.ANNUAL);
        expect(statutory).toContain(LeaveType.SICK);
        expect(statutory).toContain(LeaveType.MATERNITY);
        expect(statutory).not.toContain(LeaveType.STUDY);
        expect(statutory).not.toContain(LeaveType.TRAINING);
      });

      it('should include all BCEA-mandated leave types', () => {
        const statutory = service.getStatutoryTypes();
        expect(statutory).toContain(LeaveType.ANNUAL);
        expect(statutory).toContain(LeaveType.SICK);
        expect(statutory).toContain(LeaveType.FAMILY_RESPONSIBILITY);
        expect(statutory).toContain(LeaveType.MATERNITY);
        expect(statutory).toContain(LeaveType.PARENTAL);
        expect(statutory).toContain(LeaveType.ADOPTION);
        expect(statutory).toContain(LeaveType.COMMISSIONING_PARENTAL);
      });
    });

    describe('getPaidTypes', () => {
      it('should return only paid leave types', () => {
        const paid = service.getPaidTypes();
        expect(paid).toContain(LeaveType.ANNUAL);
        expect(paid).toContain(LeaveType.SICK);
        expect(paid).not.toContain(LeaveType.MATERNITY);
        expect(paid).not.toContain(LeaveType.UNPAID);
      });
    });

    describe('getUifCoveredTypes', () => {
      it('should return only UIF-covered leave types', () => {
        const uifCovered = service.getUifCoveredTypes();
        expect(uifCovered.length).toBe(UIF_COVERED_LEAVE_TYPES.length);
        expect(uifCovered).toContain(LeaveType.MATERNITY);
        expect(uifCovered).toContain(LeaveType.PARENTAL);
        expect(uifCovered).toContain(LeaveType.ADOPTION);
        expect(uifCovered).not.toContain(LeaveType.ANNUAL);
      });
    });

    describe('getNonStatutoryTypes', () => {
      it('should return only non-statutory leave types', () => {
        const nonStatutory = service.getNonStatutoryTypes();
        expect(nonStatutory).toContain(LeaveType.STUDY);
        expect(nonStatutory).toContain(LeaveType.UNPAID);
        expect(nonStatutory).toContain(LeaveType.TRAINING);
        expect(nonStatutory).not.toContain(LeaveType.ANNUAL);
        expect(nonStatutory).not.toContain(LeaveType.SICK);
      });
    });
  });

  describe('Leave Type Validation', () => {
    describe('isValidLeaveType', () => {
      it('should return true for valid leave types', () => {
        expect(service.isValidLeaveType('ANNUAL')).toBe(true);
        expect(service.isValidLeaveType('SICK')).toBe(true);
        expect(service.isValidLeaveType('MATERNITY')).toBe(true);
      });

      it('should return false for invalid leave types', () => {
        expect(service.isValidLeaveType('INVALID')).toBe(false);
        expect(service.isValidLeaveType('annual')).toBe(false); // Case sensitive
        expect(service.isValidLeaveType('')).toBe(false);
      });
    });

    describe('parseLeaveType', () => {
      it('should parse valid leave type strings', () => {
        expect(service.parseLeaveType('ANNUAL')).toBe(LeaveType.ANNUAL);
        expect(service.parseLeaveType('SICK')).toBe(LeaveType.SICK);
      });

      it('should handle case-insensitive parsing', () => {
        expect(service.parseLeaveType('annual')).toBe(LeaveType.ANNUAL);
        expect(service.parseLeaveType('Annual')).toBe(LeaveType.ANNUAL);
      });

      it('should handle hyphens in input', () => {
        expect(service.parseLeaveType('FAMILY-RESPONSIBILITY')).toBe(
          LeaveType.FAMILY_RESPONSIBILITY,
        );
        expect(service.parseLeaveType('COVID-QUARANTINE')).toBe(
          LeaveType.COVID_QUARANTINE,
        );
      });

      it('should parse by name', () => {
        expect(service.parseLeaveType('Annual Leave')).toBe(LeaveType.ANNUAL);
        expect(service.parseLeaveType('Sick Leave')).toBe(LeaveType.SICK);
      });

      it('should return null for invalid types', () => {
        expect(service.parseLeaveType('INVALID')).toBeNull();
        expect(service.parseLeaveType('Random Type')).toBeNull();
      });
    });
  });

  describe('Bulk Operations', () => {
    describe('bulkToSimplePay', () => {
      it('should convert multiple types to SimplePay codes', () => {
        const types = [LeaveType.ANNUAL, LeaveType.SICK, LeaveType.MATERNITY];
        const result = service.bulkToSimplePay(types);

        expect(result[LeaveType.ANNUAL]).toBe('ANNUAL');
        expect(result[LeaveType.SICK]).toBe('SICK');
        expect(result[LeaveType.MATERNITY]).toBe('MATERNITY');
      });

      it('should handle empty array', () => {
        const result = service.bulkToSimplePay([]);
        expect(Object.keys(result).length).toBe(0);
      });
    });

    describe('bulkToXero', () => {
      it('should convert multiple types to Xero identifiers', () => {
        const types = [LeaveType.ANNUAL, LeaveType.SICK, LeaveType.MATERNITY];
        const result = service.bulkToXero(types);

        expect(result[LeaveType.ANNUAL]).toBe('annual-leave');
        expect(result[LeaveType.SICK]).toBe('sick-leave');
        expect(result[LeaveType.MATERNITY]).toBe('maternity-leave');
      });

      it('should handle empty array', () => {
        const result = service.bulkToXero([]);
        expect(Object.keys(result).length).toBe(0);
      });
    });
  });

  describe('Filter Operations', () => {
    describe('getTypesBy', () => {
      it('should filter by isPaid', () => {
        const paidTypes = service.getTypesBy({ isPaid: true });
        const unpaidTypes = service.getTypesBy({ isPaid: false });

        paidTypes.forEach((type) => {
          expect(service.isPaid(type)).toBe(true);
        });

        unpaidTypes.forEach((type) => {
          expect(service.isPaid(type)).toBe(false);
        });
      });

      it('should filter by isStatutory', () => {
        const statutory = service.getTypesBy({ isStatutory: true });
        const nonStatutory = service.getTypesBy({ isStatutory: false });

        statutory.forEach((type) => {
          expect(service.isStatutory(type)).toBe(true);
        });

        nonStatutory.forEach((type) => {
          expect(service.isStatutory(type)).toBe(false);
        });
      });

      it('should filter by requiresCertificate', () => {
        const requiresCert = service.getTypesBy({ requiresCertificate: true });
        const noCert = service.getTypesBy({ requiresCertificate: false });

        requiresCert.forEach((type) => {
          expect(service.requiresCertificate(type)).toBe(true);
        });

        noCert.forEach((type) => {
          expect(service.requiresCertificate(type)).toBe(false);
        });
      });

      it('should filter by multiple criteria', () => {
        const paidStatutory = service.getTypesBy({
          isPaid: true,
          isStatutory: true,
        });

        paidStatutory.forEach((type) => {
          expect(service.isPaid(type)).toBe(true);
          expect(service.isStatutory(type)).toBe(true);
        });

        // Should include ANNUAL, SICK, FAMILY_RESPONSIBILITY
        expect(paidStatutory).toContain(LeaveType.ANNUAL);
        expect(paidStatutory).toContain(LeaveType.SICK);
        expect(paidStatutory).toContain(LeaveType.FAMILY_RESPONSIBILITY);

        // Should not include MATERNITY (UIF-covered, not paid by employer)
        expect(paidStatutory).not.toContain(LeaveType.MATERNITY);
      });
    });
  });

  describe('Configuration Completeness', () => {
    describe('getAllConfigs', () => {
      it('should return configurations for all leave types', () => {
        const configs = service.getAllConfigs();
        expect(configs.length).toBe(Object.values(LeaveType).length);
      });

      it('should have all required fields in each config', () => {
        const configs = service.getAllConfigs();
        configs.forEach((config) => {
          expect(config.type).toBeDefined();
          expect(config.name).toBeDefined();
          expect(config.description).toBeDefined();
          expect(typeof config.isPaid).toBe('boolean');
          expect(typeof config.isStatutory).toBe('boolean');
          expect(typeof config.requiresCertificate).toBe('boolean');
        });
      });
    });
  });

  describe('Bidirectional Mapping Consistency', () => {
    describe('SimplePay round-trip', () => {
      it('should maintain consistency for round-trip conversions (except many-to-one)', () => {
        // Note: COMMISSIONING_PARENTAL -> PARENTAL -> PARENTAL (not reversible)
        // SCHOOL_HOLIDAYS -> CUSTOM_1 -> SCHOOL_HOLIDAYS (reversible)
        const reversibleTypes = [
          LeaveType.ANNUAL,
          LeaveType.SICK,
          LeaveType.FAMILY_RESPONSIBILITY,
          LeaveType.MATERNITY,
          LeaveType.PARENTAL,
          LeaveType.ADOPTION,
          LeaveType.STUDY,
          LeaveType.UNPAID,
          LeaveType.COMPASSIONATE,
          LeaveType.SPECIAL,
          LeaveType.COVID_QUARANTINE,
          LeaveType.SCHOOL_HOLIDAYS,
          LeaveType.TRAINING,
        ];

        reversibleTypes.forEach((type) => {
          const simplePayCode = service.toSimplePay(type);
          const backToInternal = service.fromSimplePay(simplePayCode);
          expect(backToInternal).toBe(type);
        });
      });
    });

    describe('Xero round-trip', () => {
      it('should maintain consistency for round-trip conversions (except many-to-one)', () => {
        // Note: COMMISSIONING_PARENTAL and SCHOOL_HOLIDAYS map to same Xero codes
        const reversibleTypes = [
          LeaveType.ANNUAL,
          LeaveType.SICK,
          LeaveType.FAMILY_RESPONSIBILITY,
          LeaveType.MATERNITY,
          LeaveType.PARENTAL,
          LeaveType.ADOPTION,
          LeaveType.STUDY,
          LeaveType.UNPAID,
          LeaveType.COMPASSIONATE,
          // LeaveType.SPECIAL maps to other-leave, which maps back to SPECIAL
          LeaveType.SPECIAL,
          LeaveType.COVID_QUARANTINE,
          // LeaveType.SCHOOL_HOLIDAYS maps to other-leave
          LeaveType.TRAINING,
        ];

        reversibleTypes.forEach((type) => {
          const xeroCode = service.toXero(type);
          const backToInternal = service.fromXero(xeroCode);
          expect(backToInternal).toBe(type);
        });
      });
    });
  });

  describe('BCEA Compliance', () => {
    it('should have all BCEA-mandated leave types', () => {
      const allTypes = service.getAllTypes();

      // BCEA Chapter 3 mandated types
      expect(allTypes).toContain(LeaveType.ANNUAL);
      expect(allTypes).toContain(LeaveType.SICK);
      expect(allTypes).toContain(LeaveType.FAMILY_RESPONSIBILITY);
      expect(allTypes).toContain(LeaveType.MATERNITY);
    });

    it('should have correct entitlements per BCEA', () => {
      // Annual: 21 consecutive days (~15 working days)
      expect(service.getDefaultEntitlement(LeaveType.ANNUAL)).toBe(21);

      // Sick: 30 days over 3-year cycle
      expect(service.getDefaultEntitlement(LeaveType.SICK)).toBe(30);

      // Family Responsibility: 3 days per year
      expect(
        service.getDefaultEntitlement(LeaveType.FAMILY_RESPONSIBILITY),
      ).toBe(3);

      // Maternity: 4 months (~120 days)
      expect(service.getDefaultEntitlement(LeaveType.MATERNITY)).toBe(120);

      // Parental: 10 days
      expect(service.getDefaultEntitlement(LeaveType.PARENTAL)).toBe(10);

      // Adoption: 10 weeks (~70 days)
      expect(service.getDefaultEntitlement(LeaveType.ADOPTION)).toBe(70);
    });

    it('should correctly identify UIF-covered vs employer-paid leave', () => {
      // Employer-paid statutory
      expect(service.isPaid(LeaveType.ANNUAL)).toBe(true);
      expect(service.isPaid(LeaveType.SICK)).toBe(true);
      expect(service.isPaid(LeaveType.FAMILY_RESPONSIBILITY)).toBe(true);

      // UIF-covered (not employer-paid)
      expect(service.isPaid(LeaveType.MATERNITY)).toBe(false);
      expect(service.isPaid(LeaveType.PARENTAL)).toBe(false);
      expect(service.isPaid(LeaveType.ADOPTION)).toBe(false);
    });
  });
});
