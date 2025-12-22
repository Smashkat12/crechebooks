/**
 * Jest E2E Test Setup
 * Loads environment variables from .env.test before running E2E tests
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
});
