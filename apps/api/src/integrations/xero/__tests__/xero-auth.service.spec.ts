/**
 * XeroAuthService Tests
 * TASK-INT-002: Remove Default OAuth State Key
 *
 * Tests for secure OAuth state encryption/decryption service.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { XeroAuthService, OAuthStatePayload } from '../xero-auth.service';

describe('XeroAuthService', () => {
  const VALID_KEY = 'test-encryption-key-32-chars-ok!'; // Exactly 32 chars
  const LONG_KEY = 'this-is-a-longer-key-that-exceeds-32-characters';
  const SHORT_KEY = 'too-short';

  let service: XeroAuthService;
  let configService: ConfigService;

  const createTestModule = async (stateKey: string | undefined) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'XERO_STATE_KEY') return stateKey;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    return module;
  };

  describe('onModuleInit - Configuration Validation', () => {
    it('should throw error when XERO_STATE_KEY is not set', async () => {
      const module = await createTestModule(undefined);
      service = module.get<XeroAuthService>(XeroAuthService);

      expect(() => service.onModuleInit()).toThrow(
        'CRITICAL: XERO_STATE_KEY environment variable is required',
      );
    });

    it('should throw error when XERO_STATE_KEY is empty string', async () => {
      const module = await createTestModule('');
      service = module.get<XeroAuthService>(XeroAuthService);

      expect(() => service.onModuleInit()).toThrow(
        'CRITICAL: XERO_STATE_KEY environment variable is required',
      );
    });

    it('should throw error when XERO_STATE_KEY is too short', async () => {
      const module = await createTestModule(SHORT_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);

      expect(() => service.onModuleInit()).toThrow(
        'CRITICAL: XERO_STATE_KEY must be at least 32 characters',
      );
    });

    it('should initialize successfully with valid key length', async () => {
      const module = await createTestModule(VALID_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);

      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should initialize successfully with key longer than 32 chars', async () => {
      const module = await createTestModule(LONG_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);

      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('State Generation and Validation', () => {
    beforeEach(async () => {
      const module = await createTestModule(VALID_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);
      service.onModuleInit();
    });

    const validPayload: OAuthStatePayload = {
      tenantId: 'tenant-123',
      returnUrl: 'https://example.com/callback',
      createdAt: Date.now(),
      nonce: 'test-nonce',
    };

    it('should generate unique state values for same payload', () => {
      const state1 = service.generateState(validPayload);
      const state2 = service.generateState(validPayload);

      // States should be different due to random IV and timestamp
      expect(state1).not.toBe(state2);
    });

    it('should generate URL-safe base64url encoded state', () => {
      const state = service.generateState(validPayload);

      // base64url should not contain + / or =
      expect(state).not.toMatch(/[+/=]/);
      // Should be valid base64url
      expect(() => Buffer.from(state, 'base64url')).not.toThrow();
    });

    it('should validate and decrypt valid state', () => {
      const state = service.generateState(validPayload);
      const decrypted = service.validateState(state);

      expect(decrypted.tenantId).toBe(validPayload.tenantId);
      expect(decrypted.returnUrl).toBe(validPayload.returnUrl);
      expect(decrypted.createdAt).toBe(validPayload.createdAt);
      expect(decrypted.nonce).toBeDefined();
    });

    it('should reject tampered state', () => {
      const state = service.generateState(validPayload);
      // Tamper with the middle of the state (where the ciphertext is)
      // This ensures we're modifying the encrypted data, not just padding
      const middleIndex = Math.floor(state.length / 2);
      const tamperedState =
        state.slice(0, middleIndex) +
        (state[middleIndex] === 'A' ? 'B' : 'A') +
        state.slice(middleIndex + 1);

      expect(() => service.validateState(tamperedState)).toThrow(
        UnauthorizedException,
      );
    });

    it('should reject completely invalid state', () => {
      expect(() => service.validateState('not-valid-state')).toThrow(
        UnauthorizedException,
      );
    });

    it('should reject empty state', () => {
      expect(() => service.validateState('')).toThrow(
        'Invalid OAuth state: malformed data',
      );
    });

    it('should reject state that is too short', () => {
      const shortState = Buffer.from('short').toString('base64url');

      expect(() => service.validateState(shortState)).toThrow(
        'Invalid OAuth state: malformed data',
      );
    });
  });

  describe('State Expiration', () => {
    beforeEach(async () => {
      const module = await createTestModule(VALID_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);
      service.onModuleInit();
    });

    it('should reject expired state', async () => {
      const payload: OAuthStatePayload = {
        tenantId: 'tenant-123',
        returnUrl: 'https://example.com/callback',
        createdAt: Date.now(),
        nonce: 'test-nonce',
      };

      const state = service.generateState(payload);

      // Wait a small amount of time to ensure state is older than maxAgeMs
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Validate with 1ms max age - state will be older than this
      expect(() => service.validateState(state, 1)).toThrow(
        'OAuth state has expired',
      );
    });

    it('should accept state within expiry window', () => {
      const payload: OAuthStatePayload = {
        tenantId: 'tenant-123',
        returnUrl: 'https://example.com/callback',
        createdAt: Date.now(),
        nonce: 'test-nonce',
      };

      const state = service.generateState(payload);

      // Validate with generous expiry (1 hour)
      const decrypted = service.validateState(state, 60 * 60 * 1000);
      expect(decrypted.tenantId).toBe(payload.tenantId);
    });
  });

  describe('Cross-Key Validation', () => {
    it('should reject state encrypted with different key', async () => {
      // Create service with first key and generate state
      const module1 = await createTestModule(VALID_KEY);
      const service1 = module1.get<XeroAuthService>(XeroAuthService);
      service1.onModuleInit();

      const state = service1.generateState({
        tenantId: 'tenant-123',
        returnUrl: 'https://example.com/callback',
        createdAt: Date.now(),
        nonce: 'test-nonce',
      });

      // Create service with different key (exactly 32 chars) and try to validate
      const differentKey = 'different-key-32-characters-ok!!'; // 32 chars
      const module2 = await createTestModule(differentKey);
      const service2 = module2.get<XeroAuthService>(XeroAuthService);
      service2.onModuleInit();

      expect(() => service2.validateState(state)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Error Message Security', () => {
    beforeEach(async () => {
      const module = await createTestModule(VALID_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);
      service.onModuleInit();
    });

    it('should not leak encryption details in error messages', () => {
      // Use a properly formatted but invalid state (correct length, wrong content)
      // This tests the decryption error path, not the malformed data path
      const fakeState = Buffer.alloc(50).fill(0).toString('base64url');

      expect(() => service.validateState(fakeState)).toThrow(
        UnauthorizedException,
      );
      // The error should be generic, not revealing crypto implementation details
      try {
        service.validateState(fakeState);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const message = (error as UnauthorizedException).message;
        // Should not contain crypto implementation details
        expect(message).not.toMatch(/gcm|aes|cipher|decrypt/i);
      }
    });

    it('should have specific message for expired state only', async () => {
      const payload: OAuthStatePayload = {
        tenantId: 'tenant-123',
        returnUrl: 'https://example.com/callback',
        createdAt: Date.now(),
        nonce: 'test-nonce',
      };

      const state = service.generateState(payload);

      // Wait to ensure state is older than maxAge
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => service.validateState(state, 1)).toThrow('expired');
    });
  });

  describe('PKCE Support - TASK-INT-007', () => {
    beforeEach(async () => {
      const module = await createTestModule(VALID_KEY);
      service = module.get<XeroAuthService>(XeroAuthService);
      service.onModuleInit();
    });

    describe('generatePKCE()', () => {
      it('should generate valid PKCE pair', () => {
        const pkce = service.generatePKCE();

        expect(pkce).toHaveProperty('codeVerifier');
        expect(pkce).toHaveProperty('codeChallenge');
        expect(pkce).toHaveProperty('codeChallengeMethod', 'S256');
        expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
      });

      it('should generate unique PKCE pairs', () => {
        const pkce1 = service.generatePKCE();
        const pkce2 = service.generatePKCE();

        expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
        expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
      });
    });

    describe('generateAuthorizationUrlWithPKCE()', () => {
      it('should generate authorization URL with PKCE parameters', () => {
        const result = service.generateAuthorizationUrlWithPKCE(
          'tenant-123',
          'https://example.com/callback',
          'https://login.xero.com/identity/connect/authorize?client_id=test&redirect_uri=http://localhost',
        );

        expect(result.authUrl).toContain('code_challenge=');
        expect(result.authUrl).toContain('code_challenge_method=S256');
        expect(result.authUrl).toContain('state=');
        expect(result.state).toBeDefined();
        expect(result.codeChallenge).toBeDefined();
        expect(result.codeChallengeMethod).toBe('S256');
      });

      it('should embed code verifier in encrypted state', () => {
        const result = service.generateAuthorizationUrlWithPKCE(
          'tenant-123',
          'https://example.com/callback',
          'https://login.xero.com/identity/connect/authorize',
        );

        // Decrypt the state and verify code verifier is present
        const decryptedState = service.validateState(result.state);
        expect(decryptedState.codeVerifier).toBeDefined();
        expect(decryptedState.codeVerifier?.length).toBeGreaterThanOrEqual(43);
      });

      it('should preserve tenant and return URL in state', () => {
        const result = service.generateAuthorizationUrlWithPKCE(
          'tenant-456',
          'https://myapp.com/oauth/callback',
          'https://login.xero.com/identity/connect/authorize',
        );

        const decryptedState = service.validateState(result.state);
        expect(decryptedState.tenantId).toBe('tenant-456');
        expect(decryptedState.returnUrl).toBe(
          'https://myapp.com/oauth/callback',
        );
      });
    });

    describe('validateStateWithPKCE()', () => {
      it('should return state with code verifier for PKCE flows', () => {
        const { state } = service.generateAuthorizationUrlWithPKCE(
          'tenant-123',
          'https://example.com/callback',
          'https://login.xero.com/identity/connect/authorize',
        );

        const result = service.validateStateWithPKCE(state);

        expect(result.codeVerifier).toBeDefined();
        expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
        expect(result.tenantId).toBe('tenant-123');
      });

      it('should throw error for state without code verifier', () => {
        // Generate state without PKCE (using old method)
        const state = service.generateState({
          tenantId: 'tenant-123',
          returnUrl: 'https://example.com/callback',
          createdAt: Date.now(),
          nonce: 'test-nonce',
          // No codeVerifier
        });

        expect(() => service.validateStateWithPKCE(state)).toThrow(
          'missing PKCE code verifier',
        );
      });

      it('should validate timestamp for PKCE state', async () => {
        const { state } = service.generateAuthorizationUrlWithPKCE(
          'tenant-123',
          'https://example.com/callback',
          'https://login.xero.com/identity/connect/authorize',
        );

        // Wait and then validate with very short max age
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(() => service.validateStateWithPKCE(state, 1)).toThrow(
          'OAuth state has expired',
        );
      });
    });

    describe('PKCE Full Flow', () => {
      it('should complete full OAuth flow with PKCE', () => {
        // Step 1: Generate authorization URL with PKCE
        const { authUrl, state, codeChallenge } =
          service.generateAuthorizationUrlWithPKCE(
            'tenant-789',
            'https://app.example.com/callback',
            'https://login.xero.com/identity/connect/authorize?client_id=abc&scope=openid',
          );

        // Verify URL contains all necessary parameters
        expect(authUrl).toContain(
          'code_challenge=' + encodeURIComponent(codeChallenge),
        );
        expect(authUrl).toContain('code_challenge_method=S256');
        expect(authUrl).toContain('state=');
        expect(authUrl).toContain('client_id=abc');
        expect(authUrl).toContain('scope=openid');

        // Step 2: On callback, validate state and get code verifier
        const validatedState = service.validateStateWithPKCE(state);

        expect(validatedState.tenantId).toBe('tenant-789');
        expect(validatedState.returnUrl).toBe(
          'https://app.example.com/callback',
        );
        expect(validatedState.codeVerifier).toBeDefined();
        expect(validatedState.codeVerifier.length).toBeGreaterThanOrEqual(43);

        // Step 3: Code verifier would be used in token exchange
        // (simulated - in real flow this goes to Xero's token endpoint)
        const tokenRequest = {
          grant_type: 'authorization_code',
          code: 'auth-code-from-xero',
          redirect_uri: validatedState.returnUrl,
          code_verifier: validatedState.codeVerifier,
        };

        expect(tokenRequest.code_verifier).toBe(validatedState.codeVerifier);
      });
    });
  });
});
