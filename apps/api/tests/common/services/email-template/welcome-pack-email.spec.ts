/**
 * Welcome Pack Email Template Tests
 * TASK-ENROL-007: Parent Welcome Email Template
 */

import {
  EmailTemplateService,
  EmailTemplateName,
  WelcomePackEmailData,
} from '../../../../src/common/services/email-template/email-template.service';

describe('Welcome Pack Email Template (TASK-ENROL-007)', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
    // Manually trigger onModuleInit since we're not using NestJS DI
    service.onModuleInit();
  });

  describe('Template Registration', () => {
    it('should register welcome pack template', () => {
      expect(service.hasTemplate(EmailTemplateName.WELCOME_PACK_EMAIL)).toBe(
        true,
      );
    });

    it('should include welcome pack in available templates', () => {
      const templates = service.getAvailableTemplates();
      expect(templates).toContain(EmailTemplateName.WELCOME_PACK_EMAIL);
    });
  });

  describe('renderWelcomePackEmail', () => {
    const baseWelcomeData: WelcomePackEmailData = {
      tenantName: 'Sunshine Daycare',
      tenantLogo: 'https://example.com/logo.png',
      primaryColor: '#28a745',
      secondaryColor: '#218838',
      recipientName: 'Jane Smith',
      supportEmail: 'support@sunshinedaycare.co.za',
      supportPhone: '+27 11 123 4567',
      footerText: 'Nurturing little minds since 2010',
      childName: 'Emma Smith',
      startDate: new Date('2026-02-01'),
      feeTierName: 'Full Day Care',
      monthlyFeeCents: 450000,
    };

    it('should return valid RenderedEmail with html, text, and subject', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('subject');
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
      expect(typeof result.subject).toBe('string');
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.subject.length).toBeGreaterThan(0);
    });

    it('should contain child name in HTML output', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.html).toContain('Emma Smith');
    });

    it('should contain child name in text output', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.text).toContain('Emma Smith');
    });

    it('should format monthly fee correctly as South African Rand', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      // R 4,500.00 or R 4 500,00 (locale-dependent spacing and decimal separator)
      expect(result.html).toMatch(/R\s*4[\s,]?500[.,]00/);
      expect(result.text).toMatch(/R\s*4[\s,]?500[.,]00/);
    });

    it('should format start date', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      // Date should contain 01, 02, and 2026 in some format
      expect(result.html).toMatch(/0?1.0?2.2026|2026.0?2.0?1/);
    });

    it('should generate correct subject line with tenant and child name', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.subject).toBe(
        "Welcome to Sunshine Daycare - Emma Smith's Enrollment",
      );
    });

    it('should include fee tier name', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.html).toContain('Full Day Care');
      expect(result.text).toContain('Full Day Care');
    });

    it('should include tenant branding', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.html).toContain('https://example.com/logo.png');
      expect(result.html).toContain('#28a745');
      expect(result.html).toContain('support@sunshinedaycare.co.za');
      expect(result.html).toContain('Nurturing little minds since 2010');
    });

    it('should include recipient name', () => {
      const result = service.renderWelcomePackEmail(baseWelcomeData);

      expect(result.html).toContain('Jane Smith');
      expect(result.text).toContain('Jane Smith');
    });
  });

  describe('Optional Fields Handling', () => {
    const minimalData: WelcomePackEmailData = {
      tenantName: 'Test Creche',
      recipientName: 'Test Parent',
      childName: 'Test Child',
      startDate: new Date('2026-03-01'),
      feeTierName: 'Basic',
      monthlyFeeCents: 200000,
    };

    it('should render without optional welcomeMessage', () => {
      const result = service.renderWelcomePackEmail(minimalData);

      expect(result.html).not.toContain('undefined');
      expect(result.html).toBeTruthy();
    });

    it('should render without optional operatingHours', () => {
      const result = service.renderWelcomePackEmail(minimalData);

      expect(result.html).not.toContain('Operating Hours');
      expect(result.html).toBeTruthy();
    });

    it('should render without optional welcomePackDownloadUrl', () => {
      const result = service.renderWelcomePackEmail(minimalData);

      expect(result.html).not.toContain('Download Welcome Pack');
    });

    it('should render without optional parentPortalUrl', () => {
      const result = service.renderWelcomePackEmail(minimalData);

      expect(result.html).not.toContain('Parent Portal');
    });

    it('should include welcomeMessage when provided', () => {
      const dataWithMessage: WelcomePackEmailData = {
        ...minimalData,
        welcomeMessage:
          'We are so excited to have your little one join our family!',
      };

      const result = service.renderWelcomePackEmail(dataWithMessage);

      expect(result.html).toContain(
        'We are so excited to have your little one join our family!',
      );
      expect(result.text).toContain(
        'We are so excited to have your little one join our family!',
      );
    });

    it('should include operatingHours when provided', () => {
      const dataWithHours: WelcomePackEmailData = {
        ...minimalData,
        operatingHours: 'Monday to Friday, 7:00 AM - 6:00 PM',
      };

      const result = service.renderWelcomePackEmail(dataWithHours);

      expect(result.html).toContain('Operating Hours');
      expect(result.html).toContain('Monday to Friday, 7:00 AM - 6:00 PM');
      expect(result.text).toContain('Monday to Friday, 7:00 AM - 6:00 PM');
    });

    it('should include welcome pack download URL when provided', () => {
      const dataWithUrl: WelcomePackEmailData = {
        ...minimalData,
        welcomePackDownloadUrl: 'https://example.com/welcome-pack.pdf',
      };

      const result = service.renderWelcomePackEmail(dataWithUrl);

      expect(result.html).toContain('https://example.com/welcome-pack.pdf');
      expect(result.html).toContain('Download Welcome Pack');
      expect(result.text).toContain('https://example.com/welcome-pack.pdf');
    });

    it('should include parent portal URL when provided', () => {
      const dataWithPortal: WelcomePackEmailData = {
        ...minimalData,
        parentPortalUrl: 'https://portal.example.com',
      };

      const result = service.renderWelcomePackEmail(dataWithPortal);

      expect(result.html).toContain('https://portal.example.com');
      expect(result.html).toContain('Parent Portal');
      expect(result.text).toContain('https://portal.example.com');
    });

    it('should handle all optional fields together', () => {
      const fullData: WelcomePackEmailData = {
        ...minimalData,
        welcomeMessage: 'Custom welcome message',
        operatingHours: '7:00 AM - 5:30 PM',
        welcomePackDownloadUrl: 'https://example.com/pack.pdf',
        parentPortalUrl: 'https://portal.example.com',
      };

      const result = service.renderWelcomePackEmail(fullData);

      expect(result.html).toContain('Custom welcome message');
      expect(result.html).toContain('7:00 AM - 5:30 PM');
      expect(result.html).toContain('https://example.com/pack.pdf');
      expect(result.html).toContain('https://portal.example.com');
    });
  });

  describe('Subject Line Generation', () => {
    it('should generate subject with tenant name and child name', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Little Stars Academy',
        recipientName: 'Parent',
        childName: 'Tommy Jones',
        startDate: new Date(),
        feeTierName: 'Premium',
        monthlyFeeCents: 500000,
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.subject).toBe(
        "Welcome to Little Stars Academy - Tommy Jones's Enrollment",
      );
    });

    it('should handle child name with apostrophe correctly', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test Creche',
        recipientName: 'Parent',
        childName: "O'Connor",
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      const result = service.renderWelcomePackEmail(data);

      // The apostrophe should be escaped for XSS prevention
      // HTML entity could be &#x27; or &#39; depending on Handlebars version
      expect(result.subject).toMatch(
        /Welcome to Test Creche - O(&#x27;|&#39;|')Connor/,
      );
    });
  });

  describe('Text Output Generation', () => {
    it('should generate plain text version without HTML tags', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Happy Kids Daycare',
        recipientName: 'Sarah Brown',
        childName: 'Max Brown',
        startDate: new Date('2026-04-15'),
        feeTierName: 'Half Day',
        monthlyFeeCents: 250000,
        operatingHours: '8:00 AM - 1:00 PM',
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.text).not.toContain('<');
      expect(result.text).not.toContain('>');
      expect(result.text).toContain('Max Brown');
      expect(result.text).toContain('Sarah Brown');
      expect(result.text).toContain('Half Day');
      // R 2,500.00 or R 2 500,00 (locale-dependent)
      expect(result.text).toMatch(/R\s*2[\s,]?500[.,]00/);
    });

    it('should include enrollment confirmation section in text', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Test Child',
        startDate: new Date('2026-05-01'),
        feeTierName: 'Standard',
        monthlyFeeCents: 300000,
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.text).toContain('ENROLLMENT CONFIRMATION');
      expect(result.text).toContain("Child's Name:");
      expect(result.text).toContain('Start Date:');
      expect(result.text).toContain('Fee Structure:');
      expect(result.text).toContain('Monthly Fee:');
    });

    it('should include next steps section in text', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.text).toContain("WHAT'S NEXT?");
    });
  });

  describe('Current Year in Footer', () => {
    it('should include current year in footer', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.html).toContain(new Date().getFullYear().toString());
      expect(result.text).toContain(new Date().getFullYear().toString());
    });

    it('should allow custom year override', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
        currentYear: 2030,
      };

      const result = service.renderWelcomePackEmail(data);

      expect(result.html).toContain('2030');
      expect(result.text).toContain('2030');
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in child name', () => {
      const maliciousData: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Parent',
        childName: '<script>alert("xss")</script>',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      const result = service.renderWelcomePackEmail(maliciousData);

      // Should not contain raw script tag
      expect(result.html).not.toContain('<script>alert');
      // Should be escaped (may be double-escaped depending on context)
      expect(result.html).toMatch(/&(amp;)?lt;script/);
    });

    it('should escape HTML in welcome message', () => {
      const maliciousData: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Parent',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
        welcomeMessage: '<img src="x" onerror="alert(1)">',
      };

      const result = service.renderWelcomePackEmail(maliciousData);

      // Should not contain raw onerror attribute
      expect(result.html).not.toContain('onerror="alert');
      // Should be escaped (may be double-escaped)
      expect(result.html).toMatch(/&(amp;)?lt;img/);
    });

    it('should escape HTML in tenant name', () => {
      const maliciousData: WelcomePackEmailData = {
        tenantName: '<div onclick="hack()">Evil Corp</div>',
        recipientName: 'Parent',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      const result = service.renderWelcomePackEmail(maliciousData);

      // Should not contain raw onclick handler
      expect(result.html).not.toContain('onclick="hack');
      // Should be escaped (may be double-escaped)
      expect(result.html).toMatch(/&(amp;)?lt;div/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero monthly fee', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Scholarship',
        monthlyFeeCents: 0,
      };

      const result = service.renderWelcomePackEmail(data);

      // R 0.00 or R 0,00 (locale-dependent decimal separator)
      expect(result.html).toMatch(/R\s*0[.,]00/);
      expect(result.text).toMatch(/R\s*0[.,]00/);
    });

    it('should handle large monthly fee', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Premium Elite',
        monthlyFeeCents: 1500000, // R 15,000.00
      };

      const result = service.renderWelcomePackEmail(data);

      // R 15,000.00 or R 15 000,00 (locale-dependent)
      expect(result.html).toMatch(/R\s*15[\s,]?000[.,]00/);
    });

    it('should handle string date format', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: '2026-06-15',
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
      };

      expect(() => service.renderWelcomePackEmail(data)).not.toThrow();

      const result = service.renderWelcomePackEmail(data);
      // Date should contain 15, 06, and 2026 in some format
      expect(result.html).toMatch(/15.0?6.2026|2026.0?6.15/);
    });

    it('should handle empty optional strings gracefully', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Basic',
        monthlyFeeCents: 100000,
        operatingHours: '',
        welcomeMessage: '',
        welcomePackDownloadUrl: '',
        parentPortalUrl: '',
      };

      expect(() => service.renderWelcomePackEmail(data)).not.toThrow();
    });
  });

  describe('Integration with render() method', () => {
    it('should work with generic render method', () => {
      const data: WelcomePackEmailData = {
        tenantName: 'Test Creche',
        recipientName: 'Parent',
        childName: 'Child',
        startDate: new Date(),
        feeTierName: 'Standard',
        monthlyFeeCents: 350000,
      };

      const result = service.render(EmailTemplateName.WELCOME_PACK_EMAIL, data);

      expect(result.html).toContain('Child');
      expect(result.subject).toContain('Welcome to Test Creche');
    });
  });
});
