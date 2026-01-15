/**
 * Jest E2E Test Setup
 * Loads environment variables from .env.test or .env before running E2E tests
 *
 * TASK-INT-001: Ensure ENCRYPTION_KEY is set for tests
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Try .env.test first, fall back to .env
const envTestPath = path.resolve(__dirname, '../.env.test');
const envPath = path.resolve(__dirname, '../.env');

const configPath = fs.existsSync(envTestPath) ? envTestPath : envPath;

dotenv.config({ path: configPath });

/**
 * TASK-INT-001: Ensure ENCRYPTION_KEY is set for tests
 * This provides a test-only key when not specified in environment.
 * This key is ONLY for testing - never use in production!
 */
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'test-only-encryption-key-for-e2e-tests-32chars';
}
