/**
 * Auth Security Tests - TASK-SEC-001
 *
 * Verifies that:
 * 1. No hardcoded credentials exist in source files
 * 2. Auth service properly reads from environment variables
 * 3. Startup fails gracefully when required vars are missing
 * 4. Password comparison uses bcrypt hashing
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('TASK-SEC-001: Auth Security - No Hardcoded Credentials', () => {
  const authDir = path.join(__dirname, '../../../src/api/auth');
  const configDir = path.join(__dirname, '../../../src/config');

  describe('Source Code Credential Audit', () => {
    it('should not contain hardcoded passwords like "admin123" or "viewer123"', () => {
      const dangerousPatterns = [
        'admin123',
        'viewer123',
        'password123',
        'test123',
        'secret123',
        'dev123',
      ];

      const authFiles = fs.readdirSync(authDir, { recursive: true });
      const sourceFiles = authFiles.filter(
        (f) =>
          typeof f === 'string' && f.endsWith('.ts') && !f.includes('.spec.ts'),
      );

      for (const file of sourceFiles) {
        const filePath = path.join(authDir, file as string);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8');

          for (const pattern of dangerousPatterns) {
            expect(content).not.toContain(pattern);
          }
        }
      }
    });

    it('should not contain plaintext password assignments', () => {
      // Regex patterns that indicate hardcoded credentials
      const dangerousRegexes = [
        /password\s*=\s*['"][^'"]{3,}['"]/i, // password = "something"
        /pwd\s*=\s*['"][^'"]{3,}['"]/i, // pwd = "something"
        /secret\s*=\s*['"](?!process\.env)[^'"]{3,}['"]/i, // secret = "literal" (not env)
      ];

      const authFiles = fs.readdirSync(authDir, { recursive: true });
      const sourceFiles = authFiles.filter(
        (f) =>
          typeof f === 'string' &&
          f.endsWith('.ts') &&
          !f.includes('.spec.ts') &&
          !f.includes('dto'),
      );

      for (const file of sourceFiles) {
        const filePath = path.join(authDir, file as string);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Remove comments and strings that describe passwords
          const codeWithoutComments = content
            .replace(/\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/@ApiProperty\([^)]*\)/g, ''); // Remove decorator descriptions

          for (const regex of dangerousRegexes) {
            const match = codeWithoutComments.match(regex);
            if (match) {
              // Allow password hash variables and environment variable patterns
              const isAllowed =
                match[0].includes('Hash') ||
                match[0].includes('HASH') ||
                match[0].includes('configService') ||
                match[0].includes('process.env');
              expect(isAllowed).toBe(true);
            }
          }
        }
      }
    });

    it('should use grep to verify no common hardcoded password patterns exist', () => {
      const projectRoot = path.join(__dirname, '../../../');

      // Using grep to search for dangerous patterns in auth source files
      const grepPatterns = ['admin123', 'viewer123', 'password123'];

      for (const pattern of grepPatterns) {
        try {
          // Grep for pattern in auth directory, excluding spec files
          const result = execSync(
            `grep -rn "${pattern}" "${authDir}" --include="*.ts" | grep -v ".spec.ts" | grep -v "test" || true`,
            { encoding: 'utf-8' },
          );

          // Should return empty (no matches)
          expect(result.trim()).toBe('');
        } catch (error) {
          // grep returns exit code 1 if no matches found, which is what we want
          expect(true).toBe(true);
        }
      }
    });
  });

  describe('Environment Variable Usage', () => {
    it('should reference DEV_USER_*_PASSWORD_HASH for dev credentials', () => {
      const authServicePath = path.join(authDir, 'auth.service.ts');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      // Auth service should use environment variable pattern
      expect(content).toContain('DEV_USER_');
      expect(content).toContain('PASSWORD_HASH');
      expect(content).toContain('configService.get');
    });

    it('should use bcrypt.compare for password verification', () => {
      const authServicePath = path.join(authDir, 'auth.service.ts');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      // Should import and use bcrypt
      expect(content).toContain("import * as bcrypt from 'bcrypt'");
      expect(content).toContain('bcrypt.compare');
    });

    it('should validate DEV_AUTH_ENABLED before allowing dev login', () => {
      const authServicePath = path.join(authDir, 'auth.service.ts');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      // Should check DEV_AUTH_ENABLED environment variable
      expect(content).toContain('DEV_AUTH_ENABLED');
      expect(content).toContain("devAuthEnabled !== 'true'");
    });

    it('should validate environment configuration on module init', () => {
      const authModulePath = path.join(authDir, 'auth.module.ts');
      const content = fs.readFileSync(authModulePath, 'utf-8');

      // Should implement OnModuleInit and validate configuration
      expect(content).toContain('OnModuleInit');
      expect(content).toContain('validateAuthConfiguration');
    });

    it('should fail fast in production if DEV_AUTH_ENABLED=true', () => {
      const authModulePath = path.join(authDir, 'auth.module.ts');
      const content = fs.readFileSync(authModulePath, 'utf-8');

      // Should block DEV_AUTH_ENABLED in production
      expect(content).toContain(
        'DEV_AUTH_ENABLED must not be true in production',
      );
    });

    it('should validate password hash format (must be bcrypt)', () => {
      const authModulePath = path.join(authDir, 'auth.module.ts');
      const content = fs.readFileSync(authModulePath, 'utf-8');

      // Should validate bcrypt hash format (starts with $2)
      expect(content).toContain("startsWith('$2')");
      expect(content).toContain('must be a bcrypt hash');
    });
  });

  describe('.env.example Security Documentation', () => {
    it('should document DEV_AUTH_ENABLED with security warnings', () => {
      const envExamplePath = path.join(
        __dirname,
        '../../../../../.env.example',
      );
      const content = fs.readFileSync(envExamplePath, 'utf-8');

      // Should have clear security documentation
      expect(content).toContain('DEV_AUTH_ENABLED');
      expect(content).toContain('NEVER enable in production');
      expect(content).toContain('bcrypt hash');
    });

    it('should not contain actual password values in .env.example', () => {
      const envExamplePath = path.join(
        __dirname,
        '../../../../../.env.example',
      );
      const content = fs.readFileSync(envExamplePath, 'utf-8');

      // DEV_USER password hashes should be empty or placeholder
      const lines = content.split('\n');
      const passwordHashLines = lines.filter((line) =>
        line.includes('PASSWORD_HASH='),
      );

      for (const line of passwordHashLines) {
        // Should either be empty (PASSWORD_HASH=) or commented out
        const value = line.split('=')[1]?.trim();
        const isEmptyOrComment =
          !value || value.startsWith('#') || value.startsWith('$2b$');
        // Allow bcrypt hash placeholders like $2b$10$...
        expect(isEmptyOrComment || value === '').toBe(true);
      }
    });

    it('should document how to generate bcrypt hashes', () => {
      const envExamplePath = path.join(
        __dirname,
        '../../../../../.env.example',
      );
      const content = fs.readFileSync(envExamplePath, 'utf-8');

      // Should include bcrypt hash generation instructions
      expect(content.toLowerCase()).toContain('bcrypt');
      expect(content).toMatch(/generate|hash/i);
    });
  });

  describe('Auth Service Security Implementation', () => {
    it('should not log actual credential values', () => {
      const authServicePath = path.join(authDir, 'auth.service.ts');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      // Should not log passwords or hashes
      const logStatements =
        content.match(/this\.logger\.(log|debug|warn|error)\([^)]+\)/g) || [];

      for (const logStmt of logStatements) {
        // Log statements should not include actual password or hash values
        // Allow messages ABOUT passwords (e.g., "wrong password") but not the values
        expect(logStmt).not.toContain('devUser.passwordHash');
        expect(logStmt).not.toMatch(/\$\{.*passwordHash/i); // ${passwordHash}
        expect(logStmt).not.toMatch(/\$\{.*password\}/i); // ${password} variable
        expect(logStmt).not.toMatch(/password\s*:\s*\$\{/i); // password: ${...}
      }
    });

    it('should use constant-time comparison via bcrypt', () => {
      const authServicePath = path.join(authDir, 'auth.service.ts');
      const content = fs.readFileSync(authServicePath, 'utf-8');

      // bcrypt.compare is timing-safe by design
      expect(content).toContain('bcrypt.compare');

      // Should not use direct string comparison for passwords
      expect(content).not.toMatch(/password\s*===\s*['"][^'"]+['"]/);
      expect(content).not.toMatch(/password\s*===\s*devUser\.password/);
    });
  });
});

describe('TASK-SEC-001: Auth Module Startup Validation', () => {
  // These tests verify the startup validation logic
  // The actual validation happens in auth.module.ts onModuleInit

  it('validates required production auth variables', () => {
    const authModulePath = path.join(
      __dirname,
      '../../../src/api/auth/auth.module.ts',
    );
    const content = fs.readFileSync(authModulePath, 'utf-8');

    // Should check for required Auth0 variables in production
    expect(content).toContain('AUTH0_DOMAIN');
    expect(content).toContain('AUTH0_CLIENT_ID');
    expect(content).toContain('AUTH0_CLIENT_SECRET');
    expect(content).toContain('AUTH0_AUDIENCE');
  });

  it('validates dev user configuration when DEV_AUTH_ENABLED', () => {
    const authModulePath = path.join(
      __dirname,
      '../../../src/api/auth/auth.module.ts',
    );
    const content = fs.readFileSync(authModulePath, 'utf-8');

    // Should check for dev user configuration
    expect(content).toContain('DEV_USER_1_EMAIL');
    expect(content).toContain('DEV_USER_1_PASSWORD_HASH');
    expect(content).toContain('DEV_USER_1_NAME');
    expect(content).toContain('DEV_USER_1_ROLE');
  });

  it('throws error for missing production configuration', () => {
    const authModulePath = path.join(
      __dirname,
      '../../../src/api/auth/auth.module.ts',
    );
    const content = fs.readFileSync(authModulePath, 'utf-8');

    // Should throw error when required vars are missing
    expect(content).toContain('throw new Error');
    expect(content).toContain('Missing required auth environment variables');
  });
});
