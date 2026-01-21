/**
 * Demo Script: Generate Welcome Pack PDF
 *
 * This script generates the actual PDF that would be attached to the welcome email.
 *
 * Run with: npx ts-node scripts/demo-welcome-pack-pdf.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock data
const mockTenant = {
  name: 'Little Stars Crèche',
  address: '123 Main Street, Sandton, Johannesburg, 2196',
  phone: '+27 11 123 4567',
  email: 'info@littlestars.co.za',
  operatingHours: 'Monday - Friday: 06:30 - 18:00',
  parentWelcomeMessage: 'Welcome to our Little Stars family! We are committed to providing a nurturing, safe, and stimulating environment where your child can learn, grow, and thrive.',
  bankName: 'First National Bank',
  bankAccountHolder: 'Little Stars Crèche',
  bankAccountNumber: '62123456789',
  bankBranchCode: '250655',
  bankAccountType: 'Cheque',
};

const mockChild = {
  firstName: 'Thabo',
  lastName: 'Mokoena',
};

const mockEnrollment = {
  startDate: new Date('2026-02-01'),
};

const mockFeeStructure = {
  name: 'Full Day (6+ hours)',
  amountCents: 450000,
  registrationFeeCents: 75000,
  siblingDiscountPercent: 10,
};

function formatCurrency(cents: number): string {
  const amount = cents / 100;
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

async function generatePdf(): Promise<Buffer> {
  // Dynamic import of PDFKit
  const PDFDocumentConstructor = (await import('pdfkit')).default;
  const doc = new PDFDocumentConstructor({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true, // Enable page buffering for switchToPage
    info: {
      Title: `Welcome Pack - ${mockChild.firstName} ${mockChild.lastName}`,
      Author: mockTenant.name,
      Subject: 'Parent Welcome Pack',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const primaryColor = '#4CAF50';
  const textColor = '#333333';
  const lightGray = '#f5f5f5';

  // Helper function to draw a horizontal line
  const drawLine = (y: number) => {
    doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, y).lineTo(545, y).stroke();
  };

  // ===================== PAGE 1 =====================

  // Header
  doc.rect(0, 0, 595, 120).fill(primaryColor);
  doc.fillColor('#ffffff')
    .fontSize(28)
    .font('Helvetica-Bold')
    .text(mockTenant.name, 50, 40, { align: 'center' });
  doc.fontSize(14)
    .font('Helvetica')
    .text('Parent Welcome Pack', 50, 75, { align: 'center' });
  doc.fontSize(10)
    .text(`Generated: ${formatDate(new Date())}`, 50, 95, { align: 'center' });

  let y = 140;

  // Welcome Message Section
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Welcome Message', 50, y);
  y += 25;

  doc.rect(50, y, 495, 80).fill(lightGray);
  doc.fillColor(textColor)
    .fontSize(11)
    .font('Helvetica')
    .text(
      mockTenant.parentWelcomeMessage || 'Welcome to our crèche! We are delighted to have your child joining our family.',
      60,
      y + 10,
      { width: 475, align: 'left' }
    );
  y += 100;

  // Enrollment Details Section
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Enrollment Details', 50, y);
  y += 25;

  drawLine(y);
  y += 10;

  const enrollmentDetails = [
    ['Child\'s Name:', `${mockChild.firstName} ${mockChild.lastName}`],
    ['Start Date:', formatDate(mockEnrollment.startDate)],
    ['Fee Tier:', mockFeeStructure.name],
  ];

  for (const [label, value] of enrollmentDetails) {
    doc.fillColor('#666666').fontSize(11).font('Helvetica').text(label, 50, y);
    doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold').text(value, 200, y);
    y += 22;
  }
  y += 10;

  // Contact Information Section
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Contact Information', 50, y);
  y += 25;

  drawLine(y);
  y += 10;

  const contactDetails = [
    ['Address:', mockTenant.address],
    ['Phone:', mockTenant.phone],
    ['Email:', mockTenant.email],
    ['Operating Hours:', mockTenant.operatingHours || 'Contact us for details'],
  ];

  for (const [label, value] of contactDetails) {
    doc.fillColor('#666666').fontSize(11).font('Helvetica').text(label, 50, y);
    doc.fillColor(textColor).fontSize(11).font('Helvetica').text(value, 200, y);
    y += 22;
  }
  y += 10;

  // Fee Structure Section
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Fee Structure', 50, y);
  y += 25;

  drawLine(y);
  y += 10;

  const feeDetails = [
    ['Monthly Fee:', formatCurrency(mockFeeStructure.amountCents)],
    ['Registration Fee:', formatCurrency(mockFeeStructure.registrationFeeCents)],
    ['Sibling Discount:', `${mockFeeStructure.siblingDiscountPercent}% for additional children`],
  ];

  for (const [label, value] of feeDetails) {
    doc.fillColor('#666666').fontSize(11).font('Helvetica').text(label, 50, y);
    doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold').text(value, 200, y);
    y += 22;
  }
  y += 10;

  // What's Included
  doc.fillColor('#666666').fontSize(11).font('Helvetica-Bold').text("What's Included:", 50, y);
  y += 18;

  const includedItems = [
    '• Daily nutritious meals and snacks',
    '• Educational materials and activities',
    '• Outdoor play equipment and facilities',
    '• Regular progress updates and parent communication',
    '• End-of-year concert and special events',
  ];

  for (const item of includedItems) {
    doc.fillColor(textColor).fontSize(10).font('Helvetica').text(item, 60, y);
    y += 16;
  }

  // Bank Details Section
  y += 15;
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Banking Details', 50, y);
  y += 25;

  doc.rect(50, y, 495, 100).fill('#e8f4fd');
  y += 10;

  const bankDetails = [
    ['Bank:', mockTenant.bankName],
    ['Account Holder:', mockTenant.bankAccountHolder],
    ['Account Number:', mockTenant.bankAccountNumber],
    ['Branch Code:', mockTenant.bankBranchCode],
    ['Account Type:', mockTenant.bankAccountType],
  ];

  for (const [label, value] of bankDetails) {
    doc.fillColor('#666666').fontSize(10).font('Helvetica').text(label, 60, y);
    doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text(value, 180, y);
    y += 18;
  }

  // ===================== PAGE 2 =====================
  doc.addPage();
  y = 50;

  // Key Policies Section
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Key Policies', 50, y);
  y += 25;

  drawLine(y);
  y += 15;

  const policies = [
    {
      title: 'Drop-off & Pick-up',
      content: 'Children must be signed in and out daily. Only authorized persons may collect children. Please notify us in advance of any changes to collection arrangements.',
    },
    {
      title: 'Sick Child Policy',
      content: 'Children with fever, vomiting, diarrhea, or contagious conditions must stay home. Please inform us if your child will be absent due to illness.',
    },
    {
      title: 'Payment Terms',
      content: 'Fees are due by the 1st of each month. A late payment fee may apply after the 7th. Please use your child\'s name as payment reference.',
    },
    {
      title: 'Absence Notification',
      content: 'Please notify us by 8:00 AM if your child will be absent. Fees are not reduced for absence except for extended medical leave (doctor\'s note required).',
    },
    {
      title: 'Notice Period',
      content: 'One calendar month\'s written notice is required for withdrawal. Fees are payable during the notice period.',
    },
  ];

  for (const policy of policies) {
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text(policy.title, 50, y);
    y += 18;
    doc.fillColor(textColor).fontSize(10).font('Helvetica').text(policy.content, 50, y, { width: 495 });
    y += doc.heightOfString(policy.content, { width: 495 }) + 15;
  }

  // What to Bring Section
  y += 10;
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('What to Bring', 50, y);
  y += 25;

  drawLine(y);
  y += 15;

  const whatToBring = [
    { item: 'Labelled spare clothes', desc: 'At least 2 complete changes of weather-appropriate clothing' },
    { item: 'Nappies/diapers', desc: 'If applicable, please provide a sufficient supply weekly' },
    { item: 'Comfort item', desc: 'A familiar toy or blanket for nap time (optional)' },
    { item: 'Water bottle', desc: 'Labelled with your child\'s name' },
    { item: 'Sunscreen & hat', desc: 'SPF 30+ sunscreen and a hat for outdoor play' },
    { item: 'Bag/backpack', desc: 'Labelled bag for daily items and artwork' },
  ];

  for (const item of whatToBring) {
    doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold').text(`• ${item.item}`, 50, y);
    doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`  ${item.desc}`, 60, y + 14);
    y += 35;
  }

  // Emergency Procedures Section
  y += 10;
  doc.fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Emergency Procedures', 50, y);
  y += 25;

  drawLine(y);
  y += 15;

  doc.fillColor(textColor).fontSize(10).font('Helvetica').text(
    'In case of emergency, we will:\n\n' +
    '1. Ensure the safety and well-being of all children\n' +
    '2. Contact emergency services if required (Ambulance: 10177, Fire: 10177)\n' +
    '3. Administer first aid as needed (staff are first-aid certified)\n' +
    '4. Contact parents/guardians immediately\n' +
    '5. Document the incident for records and reporting\n\n' +
    'Please ensure your emergency contact details are always up to date.',
    50,
    y,
    { width: 495 }
  );

  // Footer on all pages
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#999999')
      .fontSize(9)
      .text(
        `${mockTenant.name} | ${mockTenant.phone} | ${mockTenant.email}`,
        50,
        780,
        { align: 'center', width: 495 }
      );
    doc.text(`Page ${i + 1} of ${pages.count}`, 50, 795, { align: 'center', width: 495 });
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('📄 GENERATING WELCOME PACK PDF');
  console.log('═'.repeat(60));
  console.log('');

  try {
    const pdfBuffer = await generatePdf();

    const outputDir = path.join(__dirname, '..', 'demo-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pdfPath = path.join(outputDir, 'welcome-pack.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    console.log('✅ PDF generated successfully!');
    console.log('');
    console.log('📁 File:', pdfPath);
    console.log('📊 Size:', `${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    console.log('');
    console.log('Open the PDF to see what the parent receives as an attachment:');
    console.log(`   file://${pdfPath}`);
    console.log('');
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
  }
}

main();
