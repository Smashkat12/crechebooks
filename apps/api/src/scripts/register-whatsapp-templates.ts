#!/usr/bin/env npx tsx
/**
 * WhatsApp Content Template Registration Script
 * TASK-WA-008: Rich WhatsApp Template Definitions
 *
 * Registers all WhatsApp content templates with Twilio Content API
 * and submits them for WhatsApp approval.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx src/scripts/register-whatsapp-templates.ts
 *
 * Required environment variables:
 *   - TWILIO_ACCOUNT_SID
 *   - TWILIO_AUTH_TOKEN
 *
 * Note: Templates must be approved by WhatsApp before they can be used
 * outside the 24-hour messaging window. Approval typically takes 24-48 hours.
 */

import 'dotenv/config';
import { ALL_TEMPLATES } from '../integrations/whatsapp/templates/content-templates';
import type { ContentTemplateDefinition } from '../integrations/whatsapp/types/content.types';

// Twilio API configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const CONTENT_API_URL = 'https://content.twilio.com/v1';

/**
 * Twilio Content API response for content item
 */
interface TwilioContentItem {
  sid: string;
  friendly_name: string;
  language: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
  date_created: string;
  date_updated: string;
  url: string;
  account_sid: string;
}

/**
 * Twilio Content API list response
 */
interface TwilioContentListResponse {
  contents: TwilioContentItem[];
  meta: {
    page: number;
    page_size: number;
    first_page_url: string;
    previous_page_url: string | null;
    url: string;
    next_page_url: string | null;
    key: string;
  };
}

/**
 * Get authorization header for Twilio API
 */
function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`;
}

/**
 * Check for existing templates in Twilio
 */
async function getExistingTemplates(): Promise<Map<string, TwilioContentItem>> {
  console.log('Fetching existing templates...');

  const response = await fetch(`${CONTENT_API_URL}/Content?PageSize=100`, {
    method: 'GET',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to fetch templates: ${error.message || response.status}`,
    );
  }

  const data = (await response.json()) as TwilioContentListResponse;
  const templates = new Map<string, TwilioContentItem>();

  for (const content of data.contents || []) {
    templates.set(content.friendly_name, content);
  }

  console.log(`Found ${templates.size} existing templates\n`);
  return templates;
}

/**
 * Create a new content template
 */
async function createTemplate(
  definition: ContentTemplateDefinition,
): Promise<TwilioContentItem | null> {
  const response = await fetch(`${CONTENT_API_URL}/Content`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      friendly_name: definition.friendlyName,
      language: definition.language,
      variables: definition.variables,
      types: definition.types,
    }),
  });

  const data = (await response.json()) as TwilioContentItem;

  if (!response.ok) {
    const error = data as unknown as { message?: string; code?: number };
    console.error(`    Error: ${error.message || 'Unknown error'}`);
    return null;
  }

  return data;
}

/**
 * Submit template for WhatsApp approval
 */
async function submitForApproval(
  contentSid: string,
  category: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${CONTENT_API_URL}/Content/${contentSid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: category.toLowerCase(),
          category: category,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      console.error(
        `    Approval error: ${(error as { message?: string }).message || 'Unknown'}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `    Approval exception: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Main registration function
 */
async function registerTemplates(): Promise<void> {
  console.log('='.repeat(60));
  console.log('WhatsApp Content Template Registration');
  console.log('='.repeat(60));
  console.log();

  // Validate environment
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('Error: Missing required environment variables.');
    console.error('Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    process.exit(1);
  }

  console.log(`Account SID: ${TWILIO_ACCOUNT_SID.substring(0, 8)}...`);
  console.log();

  // Get existing templates
  const existingTemplates = await getExistingTemplates();

  // Track results
  const results = {
    skipped: 0,
    created: 0,
    approved: 0,
    failed: 0,
  };

  // Process each template
  for (const template of ALL_TEMPLATES) {
    console.log(`Processing: ${template.friendlyName}`);

    // Check if already exists
    const existing = existingTemplates.get(template.friendlyName);
    if (existing) {
      console.log(`  [SKIP] Already exists (${existing.sid})`);
      results.skipped++;
      continue;
    }

    // Create template
    console.log('  Creating template...');
    const created = await createTemplate(template);

    if (!created) {
      console.log('  [FAIL] Failed to create template');
      results.failed++;
      continue;
    }

    console.log(`  [OK] Created (${created.sid})`);
    results.created++;

    // Submit for approval
    console.log('  Submitting for WhatsApp approval...');
    const approved = await submitForApproval(created.sid, template.category);

    if (approved) {
      console.log('  [OK] Submitted for approval');
      results.approved++;
    } else {
      console.log('  [WARN] Approval submission failed');
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Registration Summary');
  console.log('='.repeat(60));
  console.log(`Templates processed: ${ALL_TEMPLATES.length}`);
  console.log(`  Skipped (existing): ${results.skipped}`);
  console.log(`  Created:            ${results.created}`);
  console.log(`  Submitted:          ${results.approved}`);
  console.log(`  Failed:             ${results.failed}`);
  console.log();

  if (results.approved > 0) {
    console.log(
      'Note: Templates submitted for approval typically take 24-48 hours',
    );
    console.log('to be reviewed by WhatsApp. Check status in Twilio Console.');
  }

  console.log();
  console.log('Done!');
}

// Run the script
registerTemplates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Registration failed:', error);
    process.exit(1);
  });
