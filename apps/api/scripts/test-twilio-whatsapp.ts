/**
 * Test Script: Twilio WhatsApp Sandbox
 * TASK-WA-007: Test Twilio WhatsApp Integration
 *
 * Usage:
 *   npx ts-node scripts/test-twilio-whatsapp.ts
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID     - Your Twilio Account SID
 *   TWILIO_AUTH_TOKEN      - Your Twilio Auth Token
 *   TWILIO_WHATSAPP_NUMBER - Twilio WhatsApp number (sandbox: +14155238886)
 *
 * IMPORTANT: For sandbox testing:
 *   1. The recipient must have joined the sandbox by sending "join without-copper" to the Twilio number
 *   2. The sandbox message must be sent within 24 hours of the join
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

// Your WhatsApp number to test with (the one that joined the sandbox)
const TEST_RECIPIENT = process.env.TEST_WHATSAPP_NUMBER || '+27739356753';

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

async function sendTestMessage(): Promise<void> {
  console.log('\n🚀 Twilio WhatsApp Sandbox Test\n');
  console.log('================================');

  // Validate configuration
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('❌ Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    console.log('\nSet these in your .env file:');
    console.log('  TWILIO_ACCOUNT_SID=ACxxxxxx');
    console.log('  TWILIO_AUTH_TOKEN=xxxxxxxx');
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   Account SID: ${TWILIO_ACCOUNT_SID.substring(0, 8)}...`);
  console.log(`   WhatsApp Number: ${TWILIO_WHATSAPP_NUMBER}`);
  console.log(`   Recipient: ${TEST_RECIPIENT}`);
  console.log('');

  // Format numbers for Twilio WhatsApp
  const fromNumber = `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;
  const toNumber = `whatsapp:${TEST_RECIPIENT}`;

  // Test message
  const testMessage = `🧪 CrecheBooks WhatsApp Test

This is a test message from your CrecheBooks WhatsApp integration!

✅ If you received this, your Twilio sandbox is working correctly.

Time: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}

- CrecheBooks Team`;

  console.log('📤 Sending test message...\n');

  try {
    // Build form data
    const formData = new URLSearchParams();
    formData.append('To', toNumber);
    formData.append('From', fromNumber);
    formData.append('Body', testMessage);

    // Make API request
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json() as TwilioResponse;

    if (!response.ok) {
      console.error('❌ Twilio API Error:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error Code: ${data.error_code || 'N/A'}`);
      console.error(`   Error Message: ${data.error_message || 'Unknown error'}`);

      if (data.error_code === 21608) {
        console.log('\n💡 Tip: The recipient needs to join the sandbox first.');
        console.log(`   Send "join without-copper" to ${TWILIO_WHATSAPP_NUMBER} from ${TEST_RECIPIENT}`);
      } else if (data.error_code === 63007) {
        console.log('\n💡 Tip: The sandbox link may have expired. Re-join the sandbox.');
      }

      process.exit(1);
    }

    console.log('✅ Message sent successfully!');
    console.log('');
    console.log('📬 Message Details:');
    console.log(`   SID: ${data.sid}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   To: ${TEST_RECIPIENT}`);
    console.log('');
    console.log('📱 Check your WhatsApp for the message!');

  } catch (error) {
    console.error('❌ Failed to send message:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function sendInvoiceTest(): Promise<void> {
  console.log('\n📄 Testing Invoice Notification...\n');

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('❌ Missing Twilio credentials');
    return;
  }

  const fromNumber = `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;
  const toNumber = `whatsapp:${TEST_RECIPIENT}`;

  // Simulated invoice notification
  const invoiceMessage = `Hello Test Parent,

Your invoice INV-2024-001 for R1,250.00 is now available.

Due Date: 15 February 2024

Please arrange payment at your earliest convenience.

Thank you for choosing our services.

- CrecheBooks`;

  const formData = new URLSearchParams();
  formData.append('To', toNumber);
  formData.append('From', fromNumber);
  formData.append('Body', invoiceMessage);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json() as TwilioResponse;

    if (response.ok) {
      console.log('✅ Invoice notification sent!');
      console.log(`   SID: ${data.sid}`);
    } else {
      console.error('❌ Failed:', data.error_message || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Twilio WhatsApp Sandbox Test Script

Usage:
  npx ts-node scripts/test-twilio-whatsapp.ts [options]

Options:
  --help, -h     Show this help message
  --invoice      Test invoice notification format

Environment Variables:
  TWILIO_ACCOUNT_SID      Your Twilio Account SID (required)
  TWILIO_AUTH_TOKEN       Your Twilio Auth Token (required)
  TWILIO_WHATSAPP_NUMBER  Twilio WhatsApp number (default: +14155238886)
  TEST_WHATSAPP_NUMBER    Recipient phone number (default: +27739356753)

Prerequisites:
  1. Create a Twilio account at https://www.twilio.com
  2. Go to Messaging > Try it out > Send a WhatsApp message
  3. Have recipient send "join without-copper" to the sandbox number
  4. Set environment variables in your .env file
`);
    return;
  }

  // Send basic test message
  await sendTestMessage();

  // Optionally send invoice test
  if (args.includes('--invoice')) {
    await sendInvoiceTest();
  }
}

main().catch(console.error);
