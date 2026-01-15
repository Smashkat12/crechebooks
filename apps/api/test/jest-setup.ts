/**
 * Jest Unit Test Setup
 * Sets up environment for unit tests
 *
 * TASK-INT-001: Ensure ENCRYPTION_KEY is set for tests
 * TASK-INT-006: Added reflect-metadata for class-transformer/class-validator
 */

// Required for class-transformer and class-validator decorators
import 'reflect-metadata';

/**
 * Provide test-only encryption key when not specified in environment.
 * This key is ONLY for testing - never use in production!
 * The actual ENCRYPTION_KEY should be set via environment variables in production.
 */
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'test-only-encryption-key-for-unit-tests-32ch';
}
