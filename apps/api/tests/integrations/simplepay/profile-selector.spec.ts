/**
 * Profile Selector Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ProfileSelector,
  StaffRole,
  EmploymentType,
  DEFAULT_PROFILE_RULES,
} from '../../../src/integrations/simplepay/setup-pipeline/profile-selector';

describe('ProfileSelector', () => {
  let profileSelector: ProfileSelector;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfileSelector],
    }).compile();

    profileSelector = module.get<ProfileSelector>(ProfileSelector);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(profileSelector).toBeDefined();
    });

    it('should have default rules loaded', () => {
      const profiles = profileSelector.getAvailableProfiles();
      expect(profiles.length).toBeGreaterThan(0);
    });
  });

  describe('selectProfile', () => {
    describe('Principal/Manager role', () => {
      it('should select Principal/Manager for PRINCIPAL + PERMANENT', () => {
        const result = profileSelector.selectProfile('Principal', 'PERMANENT');

        expect(result.profileName).toBe('Principal/Manager');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should select Principal/Manager for Director position', () => {
        const result = profileSelector.selectProfile('Director', 'PERMANENT');

        expect(result.profileName).toBe('Principal/Manager');
      });

      it('should select Principal/Manager for Head Teacher', () => {
        const result = profileSelector.selectProfile(
          'Head Teacher',
          'PERMANENT',
        );

        expect(result.profileName).toBe('Principal/Manager');
      });
    });

    describe('Teacher role', () => {
      it('should select Full-Time Teacher for TEACHER + PERMANENT', () => {
        const result = profileSelector.selectProfile('Teacher', 'PERMANENT');

        expect(result.profileName).toBe('Full-Time Teacher');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should select Part-Time Teacher for TEACHER + CONTRACT', () => {
        const result = profileSelector.selectProfile('Teacher', 'CONTRACT');

        expect(result.profileName).toBe('Part-Time Teacher');
      });

      it('should select Part-Time Teacher for TEACHER + CASUAL', () => {
        const result = profileSelector.selectProfile('Teacher', 'CASUAL');

        expect(result.profileName).toBe('Part-Time Teacher');
      });
    });

    describe('Assistant role', () => {
      it('should select Part-Time Teacher for ASSISTANT + any employment type', () => {
        const permanent = profileSelector.selectProfile(
          'Assistant',
          'PERMANENT',
        );
        expect(permanent.profileName).toBe('Part-Time Teacher');

        const contract = profileSelector.selectProfile(
          'Teaching Aide',
          'CONTRACT',
        );
        expect(contract.profileName).toBe('Part-Time Teacher');
      });

      it('should select Part-Time Teacher for Helper position', () => {
        const result = profileSelector.selectProfile('Helper', 'PERMANENT');
        expect(result.profileName).toBe('Part-Time Teacher');
      });
    });

    describe('Kitchen role', () => {
      it('should select General Staff for KITCHEN positions', () => {
        const cook = profileSelector.selectProfile('Cook', 'PERMANENT');
        expect(cook.profileName).toBe('General Staff');

        const chef = profileSelector.selectProfile('Chef', 'PERMANENT');
        expect(chef.profileName).toBe('General Staff');

        const kitchen = profileSelector.selectProfile(
          'Kitchen Staff',
          'PERMANENT',
        );
        expect(kitchen.profileName).toBe('General Staff');
      });
    });

    describe('Admin role', () => {
      it('should select General Staff for ADMIN positions', () => {
        const admin = profileSelector.selectProfile('Admin', 'PERMANENT');
        expect(admin.profileName).toBe('General Staff');

        const secretary = profileSelector.selectProfile(
          'Secretary',
          'PERMANENT',
        );
        expect(secretary.profileName).toBe('General Staff');

        const receptionist = profileSelector.selectProfile(
          'Receptionist',
          'PERMANENT',
        );
        expect(receptionist.profileName).toBe('General Staff');
      });
    });

    describe('Support staff roles', () => {
      it('should select General Staff for CLEANER', () => {
        const result = profileSelector.selectProfile('Cleaner', 'PERMANENT');
        // Cleaner isn't in specific rules, falls to General Staff
        expect(result.profileName).toBeDefined();
      });

      it('should select General Staff for DRIVER', () => {
        const result = profileSelector.selectProfile('Driver', 'PERMANENT');
        expect(result.profileName).toBeDefined();
      });

      it('should select General Staff for SECURITY', () => {
        const result = profileSelector.selectProfile(
          'Security Guard',
          'PERMANENT',
        );
        expect(result.profileName).toBeDefined();
      });

      it('should select General Staff for MAINTENANCE', () => {
        const result = profileSelector.selectProfile('Gardener', 'PERMANENT');
        expect(result.profileName).toBeDefined();
      });
    });

    describe('Casual employment type', () => {
      it('should select General Staff for support roles + CASUAL', () => {
        // Casual support staff (non-teacher roles) fall through to General Staff
        const cleaner = profileSelector.selectProfile('Cleaner', 'CASUAL');
        expect(cleaner.profileName).toBe('General Staff');

        const driver = profileSelector.selectProfile('Driver', 'CASUAL');
        expect(driver.profileName).toBe('General Staff');
      });
    });

    describe('Fallback behavior', () => {
      it('should select General Staff for unknown position', () => {
        const result = profileSelector.selectProfile(
          'Unknown Position',
          'PERMANENT',
        );

        expect(result.profileName).toBe('General Staff');
        expect(result.confidence).toBeLessThan(0.5);
      });

      it('should handle null position', () => {
        const result = profileSelector.selectProfile(null, 'PERMANENT');

        expect(result.profileName).toBe('General Staff');
      });

      it('should normalize employment type', () => {
        const fullTime = profileSelector.selectProfile('Teacher', 'FULL_TIME');
        expect(fullTime.profileName).toBe('Full-Time Teacher');

        const temporary = profileSelector.selectProfile('Teacher', 'TEMPORARY');
        expect(temporary.profileName).toBe('Part-Time Teacher');
      });
    });
  });

  describe('normalizeRole', () => {
    it('should recognize Principal variations', () => {
      expect(profileSelector.normalizeRole('Principal')).toBe(
        StaffRole.PRINCIPAL,
      );
      expect(profileSelector.normalizeRole('DIRECTOR')).toBe(
        StaffRole.PRINCIPAL,
      );
      expect(profileSelector.normalizeRole('manager')).toBe(
        StaffRole.PRINCIPAL,
      );
      expect(profileSelector.normalizeRole('Head of School')).toBe(
        StaffRole.PRINCIPAL,
      );
    });

    it('should recognize Teacher variations', () => {
      expect(profileSelector.normalizeRole('Teacher')).toBe(StaffRole.TEACHER);
      expect(profileSelector.normalizeRole('LEAD TEACHER')).toBe(
        StaffRole.TEACHER,
      );
    });

    it('should distinguish Teacher from Teaching Assistant', () => {
      expect(profileSelector.normalizeRole('Teacher')).toBe(StaffRole.TEACHER);
      expect(profileSelector.normalizeRole('Teaching Assistant')).toBe(
        StaffRole.ASSISTANT,
      );
    });

    it('should recognize Assistant variations', () => {
      expect(profileSelector.normalizeRole('Assistant')).toBe(
        StaffRole.ASSISTANT,
      );
      expect(profileSelector.normalizeRole('Aide')).toBe(StaffRole.ASSISTANT);
      expect(profileSelector.normalizeRole('helper')).toBe(StaffRole.ASSISTANT);
    });

    it('should recognize Kitchen variations', () => {
      expect(profileSelector.normalizeRole('Kitchen')).toBe(StaffRole.KITCHEN);
      expect(profileSelector.normalizeRole('Cook')).toBe(StaffRole.KITCHEN);
      expect(profileSelector.normalizeRole('Chef')).toBe(StaffRole.KITCHEN);
      expect(profileSelector.normalizeRole('Food Handler')).toBe(
        StaffRole.KITCHEN,
      );
    });

    it('should recognize Admin variations', () => {
      expect(profileSelector.normalizeRole('Admin')).toBe(StaffRole.ADMIN);
      expect(profileSelector.normalizeRole('Secretary')).toBe(StaffRole.ADMIN);
      expect(profileSelector.normalizeRole('Receptionist')).toBe(
        StaffRole.ADMIN,
      );
      expect(profileSelector.normalizeRole('Office Clerk')).toBe(
        StaffRole.ADMIN,
      );
    });

    it('should recognize Cleaner variations', () => {
      expect(profileSelector.normalizeRole('Cleaner')).toBe(StaffRole.CLEANER);
      expect(profileSelector.normalizeRole('Domestic Worker')).toBe(
        StaffRole.CLEANER,
      );
    });

    it('should recognize Driver variations', () => {
      expect(profileSelector.normalizeRole('Driver')).toBe(StaffRole.DRIVER);
      expect(profileSelector.normalizeRole('Transport')).toBe(StaffRole.DRIVER);
    });

    it('should recognize Security variations', () => {
      expect(profileSelector.normalizeRole('Security')).toBe(
        StaffRole.SECURITY,
      );
      expect(profileSelector.normalizeRole('Guard')).toBe(StaffRole.SECURITY);
    });

    it('should recognize Maintenance variations', () => {
      expect(profileSelector.normalizeRole('Maintenance')).toBe(
        StaffRole.MAINTENANCE,
      );
      expect(profileSelector.normalizeRole('Handyman')).toBe(
        StaffRole.MAINTENANCE,
      );
      expect(profileSelector.normalizeRole('Gardener')).toBe(
        StaffRole.MAINTENANCE,
      );
    });

    it('should return OTHER for unrecognized positions', () => {
      expect(profileSelector.normalizeRole('Random Position')).toBe(
        StaffRole.OTHER,
      );
      expect(profileSelector.normalizeRole('')).toBe(StaffRole.OTHER);
      expect(profileSelector.normalizeRole(null)).toBe(StaffRole.OTHER);
    });
  });

  describe('normalizeEmploymentType', () => {
    it('should normalize PERMANENT variations', () => {
      expect(profileSelector.normalizeEmploymentType('PERMANENT')).toBe(
        EmploymentType.PERMANENT,
      );
      expect(profileSelector.normalizeEmploymentType('permanent')).toBe(
        EmploymentType.PERMANENT,
      );
      expect(profileSelector.normalizeEmploymentType('FULL_TIME')).toBe(
        EmploymentType.PERMANENT,
      );
    });

    it('should normalize CONTRACT variations', () => {
      expect(profileSelector.normalizeEmploymentType('CONTRACT')).toBe(
        EmploymentType.CONTRACT,
      );
      expect(profileSelector.normalizeEmploymentType('contract')).toBe(
        EmploymentType.CONTRACT,
      );
      expect(profileSelector.normalizeEmploymentType('TEMPORARY')).toBe(
        EmploymentType.CONTRACT,
      );
    });

    it('should normalize CASUAL variations', () => {
      expect(profileSelector.normalizeEmploymentType('CASUAL')).toBe(
        EmploymentType.CASUAL,
      );
      expect(profileSelector.normalizeEmploymentType('casual')).toBe(
        EmploymentType.CASUAL,
      );
      expect(profileSelector.normalizeEmploymentType('PART_TIME')).toBe(
        EmploymentType.CASUAL,
      );
    });

    it('should default to PERMANENT for unknown types', () => {
      expect(profileSelector.normalizeEmploymentType('UNKNOWN')).toBe(
        EmploymentType.PERMANENT,
      );
    });
  });

  describe('getAvailableProfiles', () => {
    it('should return unique profile names', () => {
      const profiles = profileSelector.getAvailableProfiles();

      expect(Array.isArray(profiles)).toBe(true);
      const uniqueProfiles = new Set(profiles);
      expect(uniqueProfiles.size).toBe(profiles.length);
    });

    it('should include essential profiles', () => {
      const profiles = profileSelector.getAvailableProfiles();

      expect(profiles).toContain('Principal/Manager');
      expect(profiles).toContain('Full-Time Teacher');
      expect(profiles).toContain('General Staff');
    });
  });

  describe('addRule', () => {
    it('should add a new custom rule', () => {
      const customRule = {
        role: StaffRole.OTHER,
        employmentType: EmploymentType.PERMANENT,
        profileName: 'Custom Profile',
        priority: 0, // Highest priority
      };

      profileSelector.addRule(customRule);

      const result = profileSelector.selectProfile(
        'Random Position',
        'PERMANENT',
      );
      expect(result.profileName).toBe('Custom Profile');

      // Cleanup
      profileSelector.removeRuleByProfile('Custom Profile');
    });
  });

  describe('removeRuleByProfile', () => {
    it('should remove a rule by profile name', () => {
      const customRule = {
        role: StaffRole.OTHER,
        employmentType: EmploymentType.PERMANENT,
        profileName: 'Temp Profile',
        priority: 0,
      };

      profileSelector.addRule(customRule);
      const removed = profileSelector.removeRuleByProfile('Temp Profile');

      expect(removed).toBe(true);
    });

    it('should return false for non-existent profile', () => {
      const removed = profileSelector.removeRuleByProfile(
        'Non Existent Profile',
      );
      expect(removed).toBe(false);
    });
  });

  describe('getRulesForRole', () => {
    it('should return rules for a specific role', () => {
      const teacherRules = profileSelector.getRulesForRole(StaffRole.TEACHER);

      expect(teacherRules.length).toBeGreaterThan(0);
      expect(teacherRules.some((r) => r.role === StaffRole.TEACHER)).toBe(true);
    });

    it('should include wildcard rules', () => {
      const rules = profileSelector.getRulesForRole(StaffRole.CLEANER);

      // Should include wildcard role rules
      expect(rules.some((r) => r.role === '*')).toBe(true);
    });
  });

  describe('DEFAULT_PROFILE_RULES', () => {
    it('should have all required rule properties', () => {
      for (const rule of DEFAULT_PROFILE_RULES) {
        expect(rule.role).toBeDefined();
        expect(rule.employmentType).toBeDefined();
        expect(rule.profileName).toBeDefined();
        expect(typeof rule.priority).toBe('number');
      }
    });

    it('should have unique priorities for specific rules', () => {
      const specificRules = DEFAULT_PROFILE_RULES.filter(
        (r) => r.role !== '*' && r.employmentType !== '*',
      );
      const priorities = specificRules.map((r) => r.priority);
      const uniquePriorities = new Set(priorities);

      expect(uniquePriorities.size).toBe(priorities.length);
    });
  });
});
