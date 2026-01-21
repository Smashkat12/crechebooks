/**
 * Demo Script: Parent Welcome Pack Workflow
 *
 * This script demonstrates what a parent (katlego@elleelephant.co.za)
 * will receive when their child is enrolled.
 *
 * Run with: npx ts-node scripts/demo-welcome-pack.ts
 */

import { EmailTemplateService, WelcomePackEmailData } from '../src/common/services/email-template/email-template.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock data for the demo
const mockTenantInfo = {
  name: 'Little Stars Crèche',
  logo: null,
  primaryColor: '#4CAF50',
  secondaryColor: '#388E3C',
  address: '123 Main Street, Sandton, Johannesburg, 2196',
  phone: '+27 11 123 4567',
  email: 'info@littlestars.co.za',
  operatingHours: 'Monday - Friday: 06:30 - 18:00',
  parentWelcomeMessage: 'Welcome to our Little Stars family! We are committed to providing a nurturing, safe, and stimulating environment where your child can learn, grow, and thrive.',
  supportEmail: 'support@littlestars.co.za',
  supportPhone: '+27 11 123 4567',
  bankName: 'First National Bank',
  bankAccountHolder: 'Little Stars Crèche',
  bankAccountNumber: '62123456789',
  bankBranchCode: '250655',
  bankAccountType: 'Cheque',
};

const mockParent = {
  id: 'parent-uuid-001',
  firstName: 'Katlego',
  lastName: 'Mokoena',
  email: 'katlego@elleelephant.co.za',
  phone: '+27 82 123 4567',
};

const mockChild = {
  id: 'child-uuid-001',
  firstName: 'Thabo',
  lastName: 'Mokoena',
  dateOfBirth: new Date('2022-03-15'),
};

const mockFeeStructure = {
  id: 'fee-uuid-001',
  name: 'Full Day (6+ hours)',
  amountCents: 450000, // R4,500.00
  registrationFeeCents: 75000, // R750.00
};

const mockEnrollment = {
  id: 'enrollment-uuid-001',
  startDate: new Date('2026-02-01'),
  status: 'ACTIVE',
};

async function main() {
  console.log('═'.repeat(60));
  console.log('🎉 WELCOME PACK DEMO - Parent Enrollment Workflow');
  console.log('═'.repeat(60));
  console.log('');
  console.log('📧 Parent Email:', mockParent.email);
  console.log('👶 Child:', `${mockChild.firstName} ${mockChild.lastName}`);
  console.log('📅 Start Date:', mockEnrollment.startDate.toLocaleDateString('en-ZA'));
  console.log('💰 Fee Tier:', mockFeeStructure.name, `(R ${(mockFeeStructure.amountCents / 100).toLocaleString('en-ZA')} /month)`);
  console.log('');

  // Initialize the email template service
  const emailService = new EmailTemplateService();

  // Manually trigger initialization (normally done by NestJS)
  emailService.onModuleInit();

  // Prepare email data
  const emailData: WelcomePackEmailData = {
    // Tenant branding
    tenantName: mockTenantInfo.name,
    tenantLogo: mockTenantInfo.logo || undefined,
    primaryColor: mockTenantInfo.primaryColor,
    secondaryColor: mockTenantInfo.secondaryColor,
    footerText: 'Licensed Early Childhood Development Centre | DSD Registered',
    supportEmail: mockTenantInfo.supportEmail,
    supportPhone: mockTenantInfo.supportPhone,

    // Bank details for payment
    bankName: mockTenantInfo.bankName,
    bankAccountHolder: mockTenantInfo.bankAccountHolder,
    bankAccountNumber: mockTenantInfo.bankAccountNumber,
    bankBranchCode: mockTenantInfo.bankBranchCode,
    bankAccountType: mockTenantInfo.bankAccountType,

    // Recipient info
    recipientName: `${mockParent.firstName} ${mockParent.lastName}`,

    // Enrollment details
    childName: `${mockChild.firstName} ${mockChild.lastName}`,
    startDate: mockEnrollment.startDate,
    feeTierName: mockFeeStructure.name,
    monthlyFeeCents: mockFeeStructure.amountCents,

    // Optional extras
    operatingHours: mockTenantInfo.operatingHours,
    welcomeMessage: mockTenantInfo.parentWelcomeMessage,
    welcomePackDownloadUrl: 'https://app.crechebooks.co.za/download/welcome-pack/enrollment-uuid-001',
    parentPortalUrl: 'https://app.crechebooks.co.za/parent-portal',
  };

  // Render the email
  const renderedEmail = emailService.renderWelcomePackEmail(emailData);

  console.log('─'.repeat(60));
  console.log('📬 EMAIL PREVIEW');
  console.log('─'.repeat(60));
  console.log('');
  console.log('To:', mockParent.email);
  console.log('Subject:', renderedEmail.subject);
  console.log('');

  // Save HTML email to file for viewing
  const outputDir = path.join(__dirname, '..', 'demo-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const htmlPath = path.join(outputDir, 'welcome-pack-email.html');
  fs.writeFileSync(htmlPath, renderedEmail.html);
  console.log('✅ HTML email saved to:', htmlPath);

  const textPath = path.join(outputDir, 'welcome-pack-email.txt');
  fs.writeFileSync(textPath, renderedEmail.text);
  console.log('✅ Plain text email saved to:', textPath);

  console.log('');
  console.log('─'.repeat(60));
  console.log('📄 PLAIN TEXT EMAIL CONTENT');
  console.log('─'.repeat(60));
  console.log('');
  console.log(renderedEmail.text);
  console.log('');

  console.log('─'.repeat(60));
  console.log('📎 PDF ATTACHMENT');
  console.log('─'.repeat(60));
  console.log('');
  console.log('The email includes a PDF welcome pack attachment containing:');
  console.log('');
  console.log('📋 SECTIONS IN THE PDF:');
  console.log('  1. ✅ Header with crèche name and date');
  console.log('  2. ✅ Welcome Message (personalized)');
  console.log('  3. ✅ Enrollment Details');
  console.log('     - Child: Thabo Mokoena');
  console.log('     - Start Date: 01/02/2026');
  console.log('     - Fee Tier: Full Day (6+ hours)');
  console.log('  4. ✅ Contact Information');
  console.log('     - Address: 123 Main Street, Sandton, Johannesburg, 2196');
  console.log('     - Phone: +27 11 123 4567');
  console.log('     - Email: info@littlestars.co.za');
  console.log('     - Hours: Monday - Friday: 06:30 - 18:00');
  console.log('  5. ✅ Fee Structure');
  console.log('     - Monthly Fee: R 4,500.00');
  console.log('     - Registration Fee: R 750.00');
  console.log('     - What\'s Included: Daily meals, educational materials, etc.');
  console.log('  6. ✅ Key Policies');
  console.log('     - Drop-off & Pick-up procedures');
  console.log('     - Sick child policy');
  console.log('     - Payment terms');
  console.log('  7. ✅ What to Bring');
  console.log('     - Labelled spare clothes');
  console.log('     - Nappies/diapers (if applicable)');
  console.log('     - Comfort item');
  console.log('     - Water bottle');
  console.log('  8. ✅ Emergency Procedures');
  console.log('');

  console.log('═'.repeat(60));
  console.log('🎯 SUMMARY');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`When Katlego Mokoena enrolls their child Thabo at ${mockTenantInfo.name}:`);
  console.log('');
  console.log('1. The enrollment is created in the system');
  console.log('2. An enrollment invoice is generated (registration + pro-rated first month)');
  console.log('3. A welcome pack email is AUTOMATICALLY sent to katlego@elleelephant.co.za');
  console.log('4. The email includes:');
  console.log('   - Beautiful HTML email with enrollment confirmation');
  console.log('   - Plain text fallback for older email clients');
  console.log('   - PDF attachment with full welcome pack');
  console.log('   - Direct links to download welcome pack and access parent portal');
  console.log('');
  console.log('📁 Open the HTML file to see the beautiful email:');
  console.log(`   file://${htmlPath}`);
  console.log('');
}

main().catch(console.error);
