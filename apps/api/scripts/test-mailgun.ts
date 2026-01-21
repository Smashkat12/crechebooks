/**
 * Mailgun Integration Test Script
 *
 * Tests Mailgun email sending functionality directly.
 * Run with: npx ts-node scripts/test-mailgun.ts
 *
 * IMPORTANT: In sandbox mode, you can only send to authorized recipients.
 * Add recipients at: Mailgun Dashboard > Domain Settings > Setup > Authorized Recipients
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Mailgun from 'mailgun.js';
import FormData from 'form-data';

async function testMailgun() {
  console.log('='.repeat(60));
  console.log('Mailgun Integration Test');
  console.log('='.repeat(60));

  // Check configuration
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const region = process.env.MAILGUN_REGION ?? 'us';
  const fromEmail = process.env.MAILGUN_FROM_EMAIL ?? `postmaster@${domain}`;

  console.log('\n📧 Configuration:');
  console.log(`  Domain: ${domain}`);
  console.log(`  Region: ${region}`);
  console.log(`  From: ${fromEmail}`);
  console.log(`  API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);

  if (!apiKey || !domain) {
    console.error('\n❌ ERROR: Missing MAILGUN_API_KEY or MAILGUN_DOMAIN in .env');
    process.exit(1);
  }

  // Initialize Mailgun client
  const mailgun = new Mailgun(FormData);
  const baseUrl = region === 'eu'
    ? 'https://api.eu.mailgun.net'
    : 'https://api.mailgun.net';

  const client = mailgun.client({
    username: 'api',
    key: apiKey,
    url: baseUrl,
  });

  console.log('\n🔗 Testing connection...');

  try {
    // Test connection by getting domain info
    const domainInfo = await client.domains.get(domain);
    console.log('✅ Connection successful!');
    console.log(`  Domain state: ${(domainInfo as any).state || 'active'}`);
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }

  // Send test email
  const testRecipient = process.argv[2] || 'smashkat12@gmail.com';

  console.log(`\n📤 Sending test email to: ${testRecipient}`);
  console.log('   (Use authorized recipient from Mailgun sandbox settings)');

  try {
    const result = await client.messages.create(domain, {
      from: fromEmail,
      to: [testRecipient],
      subject: 'CrecheBooks - Email Test',
      text: `Hello from CrecheBooks!\n\nThis is a test email sent via Mailgun.\n\nTimestamp: ${new Date().toISOString()}\n\nIf you receive this, your email integration is working correctly!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">CrecheBooks Email Test</h1>
          <p>Hello from CrecheBooks!</p>
          <p>This is a test email sent via <strong>Mailgun</strong>.</p>
          <p style="color: #666; font-size: 12px;">Timestamp: ${new Date().toISOString()}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #22c55e; font-weight: bold;">✅ If you receive this, your email integration is working correctly!</p>
        </div>
      `,
    });

    console.log('\n✅ Email queued successfully!');
    console.log(`  Message ID: ${result.id}`);
    console.log(`  Status: ${result.message}`);
    console.log('\n📬 Check your inbox (and spam folder) for the test email.');
  } catch (error: any) {
    console.error('\n❌ Failed to send email:', error.message);
    if (error.message.includes('not an authorized recipient')) {
      console.log('\n⚠️  SANDBOX MODE: You need to add the recipient as an authorized recipient.');
      console.log('   Go to: Mailgun Dashboard > Domain Settings > Setup > Add test email recipient');
      console.log(`   Add: ${testRecipient}`);
    }
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test completed successfully!');
  console.log('='.repeat(60));
}

testMailgun().catch(console.error);
