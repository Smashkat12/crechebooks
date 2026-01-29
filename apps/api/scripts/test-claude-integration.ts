/**
 * Test script for Claude API integration via Requesty
 * Run with: npx ts-node scripts/test-claude-integration.ts
 */

import 'dotenv/config';

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

async function testClaudeIntegration(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl =
    process.env.ANTHROPIC_BASE_URL || 'https://router.requesty.ai/v1';
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  console.log('=== Claude Integration Test ===');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);
  console.log(`API Key: ${apiKey ? `${apiKey.slice(0, 15)}...` : 'NOT SET'}`);
  console.log('');

  if (!apiKey || apiKey === 'your-requesty-api-key') {
    console.error('ERROR: ANTHROPIC_API_KEY is not configured');
    process.exit(1);
  }

  const requestBody = {
    model,
    max_tokens: 256,
    temperature: 0,
    system:
      'You are a helpful assistant. Respond concisely to test API connectivity.',
    messages: [
      {
        role: 'user',
        content:
          'Say "CrecheBooks Claude integration successful!" and nothing else.',
      },
    ],
  };

  console.log('Sending test request to Claude via Requesty...');
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      console.error(`ERROR: API returned ${response.status}`);
      console.error(`Response: ${errorBody}`);
      process.exit(1);
    }

    const data = (await response.json()) as ClaudeResponse;

    console.log('');
    console.log('✅ SUCCESS!');
    console.log(`Duration: ${durationMs}ms`);
    console.log(`Model used: ${data.model}`);
    console.log(
      `Tokens: ${data.usage.input_tokens} input, ${data.usage.output_tokens} output`,
    );
    console.log(`Stop reason: ${data.stop_reason}`);
    console.log('');
    console.log('Response:');
    console.log(
      data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`ERROR after ${durationMs}ms:`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testClaudeIntegration().catch(console.error);
