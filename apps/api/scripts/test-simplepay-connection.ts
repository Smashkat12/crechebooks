#!/usr/bin/env npx ts-node
/**
 * SimplePay API Connection Test Script
 * TASK-STAFF-004: SimplePay Integration
 *
 * This script tests the SimplePay API connection with real credentials.
 * Run: npx ts-node scripts/test-simplepay-connection.ts
 *
 * Steps:
 * 1. Lists all accessible SimplePay clients using the API key
 * 2. Tests connection to each discovered client
 * 3. Shows sample data if successful
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
dotenv.config({ path: resolve(__dirname, '../.env') });

const SIMPLEPAY_BASE_URL = 'https://api.payroll.simplepay.cloud/v1';
const API_KEY = process.env.SIMPLEPAY_API_KEY;

interface SimplePayClientData {
  id: number;
  name: string;
  physical_address?: {
    city_or_town?: string;
  };
  demo?: boolean;
  paye_number?: string | null;
  uif_number?: string | null;
}

interface SimplePayClientWrapper {
  client: SimplePayClientData;
}

interface SimplePayEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  basic_salary: number;
}

async function testSimplePayConnection(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('            SimplePay API Connection Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!API_KEY) {
    console.error('❌ ERROR: SIMPLEPAY_API_KEY not set in .env file');
    console.log('\nPlease add your SimplePay API key to apps/api/.env:');
    console.log('  SIMPLEPAY_API_KEY=your_api_key_here\n');
    process.exit(1);
  }

  console.log(`📡 API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
  console.log(`🔗 Base URL: ${SIMPLEPAY_BASE_URL}\n`);

  const client = axios.create({
    baseURL: SIMPLEPAY_BASE_URL,
    headers: {
      Authorization: API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  try {
    // Step 1: List clients
    console.log('📋 Step 1: Listing SimplePay clients...\n');
    const clientsResponse = await client.get<SimplePayClientWrapper[]>('/clients');
    const rawClients = clientsResponse.data;

    // Unwrap nested client data
    const clients = rawClients.map((wrapper) => wrapper.client);

    if (!clients || clients.length === 0) {
      console.log('⚠️  No clients found. Your API key may not have access to any clients.');
      return;
    }

    console.log(`✅ Found ${clients.length} client(s):\n`);

    console.log('┌────────────┬────────────────────────────────────┬───────────┬─────────────────────┐');
    console.log('│ Client ID  │ Company Name                       │ Demo?     │ Location            │');
    console.log('├────────────┼────────────────────────────────────┼───────────┼─────────────────────┤');
    for (const c of clients) {
      const id = String(c.id).padEnd(10);
      const name = String(c.name || 'Unknown').substring(0, 34).padEnd(34);
      const isDemo = (c.demo ? 'Yes' : 'No').padEnd(9);
      const location = (c.physical_address?.city_or_town || 'N/A').substring(0, 19).padEnd(19);
      console.log(`│ ${id} │ ${name} │ ${isDemo} │ ${location} │`);
    }
    console.log('└────────────┴────────────────────────────────────┴───────────┴─────────────────────┘\n');

    // Step 2: Test connection to each client
    console.log('🔍 Step 2: Testing connection to each client...\n');

    for (const simplePayClient of clients) {
      console.log(`\n── Client: ${simplePayClient.name} (ID: ${simplePayClient.id}) ──\n`);

      try {
        // Note: SimplePay API doesn't have a /clients/{id} endpoint
        // Client details are available from the /clients/ list response
        console.log('  ✅ Client access confirmed');
        console.log(`  📋 PAYE Number: ${simplePayClient.paye_number || 'Not registered'}`);
        console.log(`  📋 UIF Number: ${simplePayClient.uif_number || 'Not registered'}`);
        console.log(`  🏢 Demo Account: ${simplePayClient.demo ? 'Yes' : 'No'}`);

        // Fetch employees - Note: SimplePay returns [] for empty, not 404
        // Response is array of { employee: {...} }
        interface EmployeeWrapper {
          employee: SimplePayEmployee;
        }
        const employeesResponse = await client.get<EmployeeWrapper[]>(
          `/clients/${simplePayClient.id}/employees`
        );

        // Handle both wrapped and unwrapped responses
        const rawEmployees = employeesResponse.data;
        const employees = Array.isArray(rawEmployees) && rawEmployees.length > 0 && rawEmployees[0].employee
          ? rawEmployees.map((w: EmployeeWrapper) => w.employee)
          : rawEmployees as unknown as SimplePayEmployee[];

        console.log(`  👥 Employees: ${employees.length}`);

        if (employees.length > 0) {
          console.log('\n  Sample employees (first 5):');
          console.log('  ┌────────────────────────────────┬──────────────────────┐');
          console.log('  │ Name                           │ Basic Salary (ZAR)   │');
          console.log('  ├────────────────────────────────┼──────────────────────┤');

          const sampleEmployees = employees.slice(0, 5);
          for (const emp of sampleEmployees) {
            const name = `${emp.first_name} ${emp.last_name}`.substring(0, 30).padEnd(30);
            const salary = emp.basic_salary?.toFixed(2).padStart(18) || 'N/A'.padStart(18);
            console.log(`  │ ${name} │ ${salary} │`);
          }
          console.log('  └────────────────────────────────┴──────────────────────┘');
        }
      } catch (error) {
        const axiosError = error as { response?: { status: number; data?: unknown }; message: string };
        console.log(`  ❌ Error: ${axiosError.response?.status || axiosError.message}`);
        if (axiosError.response?.data) {
          console.log(`     Details: ${JSON.stringify(axiosError.response.data)}`);
        }
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                     Summary');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ SimplePay API connection successful!\n');
    console.log('To set up the integration in CrecheBooks:\n');
    console.log('1. Copy one of the Client IDs above');
    console.log('2. Go to Settings > Integrations > SimplePay');
    console.log('3. Enter your API Key and Client ID');
    console.log('4. Click Connect\n');
    console.log('Or use the API endpoint:');
    console.log(`  POST /api/v1/integrations/simplepay/connect`);
    console.log(`  Body: { "clientId": "<client_id>", "apiKey": "${API_KEY}" }\n`);

  } catch (error) {
    const axiosError = error as { response?: { status: number; data?: unknown }; message: string };

    console.error('\n❌ Connection failed!\n');

    if (axiosError.response?.status === 401) {
      console.error('  Error: Invalid API key');
      console.error('  Please check your SIMPLEPAY_API_KEY in .env');
    } else if (axiosError.response?.status === 403) {
      console.error('  Error: Access forbidden');
      console.error('  Your API key may not have the required permissions');
    } else if (axiosError.response?.status === 429) {
      console.error('  Error: Rate limit exceeded');
      console.error('  SimplePay allows 60 requests per minute. Please wait and try again.');
    } else {
      console.error(`  Error: ${axiosError.message}`);
      if (axiosError.response?.data) {
        console.error(`  Details: ${JSON.stringify(axiosError.response.data)}`);
      }
    }

    process.exit(1);
  }
}

// Run the test
testSimplePayConnection().catch(console.error);
