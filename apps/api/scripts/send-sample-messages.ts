/**
 * Send Sample WhatsApp Messages
 * Demonstrates all message types parents will receive
 *
 * Usage:
 *   TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx npx ts-node scripts/send-sample-messages.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
const TEST_RECIPIENT = process.env.TEST_WHATSAPP_NUMBER || '+27739356753';

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

async function sendMessage(body: string, label: string): Promise<boolean> {
  const fromNumber = `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;
  const toNumber = `whatsapp:${TEST_RECIPIENT}`;

  const formData = new URLSearchParams();
  formData.append('To', toNumber);
  formData.append('From', fromNumber);
  formData.append('Body', body);

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
      console.log(`✅ ${label} - SID: ${data.sid}`);
      return true;
    } else {
      console.log(`❌ ${label} - Error: ${data.error_message}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${label} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function main() {
  console.log('\n📱 Sending Sample WhatsApp Messages\n');
  console.log('====================================\n');

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('❌ Missing Twilio credentials');
    process.exit(1);
  }

  // Sample data
  const parentName = 'Sarah Johnson';
  const childName = 'Emma';
  const crecheName = 'Little Stars Daycare';
  const invoiceNumber = 'INV-2024-0042';
  const amount = 'R1,250.00';
  const dueDate = '15 February 2024';
  const paymentRef = 'PAY-2024-0089';
  const statementPeriod = 'January 2024';

  // Add delay between messages to avoid rate limiting
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 1. Invoice Notification
  console.log('1️⃣  Sending Invoice Notification...');
  await sendMessage(
    `Hello ${parentName},

Your invoice ${invoiceNumber} for ${amount} is now available.

Due Date: ${dueDate}

Thank you for choosing our services.

- CrecheBooks`,
    'Invoice Notification'
  );
  await delay(1500);

  // 2. Payment Reminder (7 days)
  console.log('2️⃣  Sending Payment Reminder (7 days)...');
  await sendMessage(
    `Reminder: Hello ${parentName},

This is a friendly reminder that invoice ${invoiceNumber} for ${amount} is 7 days overdue.

Please arrange payment at your earliest convenience.

If you have already paid, please ignore this message.

- CrecheBooks`,
    'Payment Reminder (7 days)'
  );
  await delay(1500);

  // 3. Payment Reminder (30 days - URGENT)
  console.log('3️⃣  Sending Payment Reminder (30 days - URGENT)...');
  await sendMessage(
    `URGENT: Hello ${parentName},

This is a friendly reminder that invoice ${invoiceNumber} for ${amount} is 30 days overdue.

Please arrange payment at your earliest convenience.

If you have already paid, please ignore this message.

- CrecheBooks`,
    'Payment Reminder (30 days URGENT)'
  );
  await delay(1500);

  // 4. Payment Confirmation
  console.log('4️⃣  Sending Payment Confirmation...');
  await sendMessage(
    `Hello ${parentName},

Thank you! We have received your payment of ${amount} for invoice ${invoiceNumber}.

Payment Reference: ${paymentRef}
Date: ${new Date().toLocaleDateString('en-ZA')}

- CrecheBooks`,
    'Payment Confirmation'
  );
  await delay(1500);

  // 5. Monthly Statement
  console.log('5️⃣  Sending Monthly Statement...');
  await sendMessage(
    `Hello ${parentName},

Your account statement for ${statementPeriod} is now available.

Opening Balance: R0.00
Closing Balance: R2,500.00

- CrecheBooks`,
    'Monthly Statement'
  );
  await delay(1500);

  // 6. Welcome Message
  console.log('6️⃣  Sending Welcome Message...');
  await sendMessage(
    `Welcome to ${crecheName}, ${parentName}!

Thank you for enrolling ${childName} with us.

You will receive invoices and important updates via WhatsApp.

To stop receiving messages, reply STOP at any time.

- CrecheBooks`,
    'Welcome Message'
  );

  console.log('\n====================================');
  console.log('📱 Check your WhatsApp for all 6 messages!');
  console.log('====================================\n');
}

main().catch(console.error);
