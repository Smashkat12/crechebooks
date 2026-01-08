/**
 * Jest E2E Test Setup
 * Loads environment variables from .env.test or .env before running E2E tests
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Try .env.test first, fall back to .env
const envTestPath = path.resolve(__dirname, '../.env.test');
const envPath = path.resolve(__dirname, '../.env');

const configPath = fs.existsSync(envTestPath) ? envTestPath : envPath;

dotenv.config({ path: configPath });
