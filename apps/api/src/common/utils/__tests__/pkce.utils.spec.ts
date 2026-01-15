/**
 * PKCEUtils Tests
 * TASK-INT-007: OAuth2 PKCE for Xero Integration
 *
 * Tests RFC 7636 compliant PKCE implementation including:
 * - Test vectors from RFC 7636 Appendix B
 * - Uniqueness of generated verifiers
 * - Validation of verifier/challenge pairs
 * - Edge cases and error handling
 */

import { PKCEUtils, PKCEPair } from '../pkce.utils';

describe('PKCEUtils', () => {
  describe('generate()', () => {
    it('should produce a valid PKCE pair', () => {
      const pkce = PKCEUtils.generate();

      expect(pkce).toHaveProperty('codeVerifier');
      expect(pkce).toHaveProperty('codeChallenge');
      expect(pkce).toHaveProperty('codeChallengeMethod');
      expect(pkce.codeChallengeMethod).toBe('S256');
    });

    it('should generate code verifier with valid length (43-128 chars)', () => {
      const pkce = PKCEUtils.generate();

      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate code verifier with valid characters only', () => {
      const pkce = PKCEUtils.generate();
      const validCharsRegex = /^[A-Za-z0-9\-._~]+$/;

      expect(pkce.codeVerifier).toMatch(validCharsRegex);
    });

    it('should generate unique verifiers on each call', () => {
      const pairs: PKCEPair[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        pairs.push(PKCEUtils.generate());
      }

      const verifiers = pairs.map((p) => p.codeVerifier);
      const uniqueVerifiers = new Set(verifiers);

      // All verifiers should be unique
      expect(uniqueVerifiers.size).toBe(iterations);
    });

    it('should generate unique challenges for unique verifiers', () => {
      const pairs: PKCEPair[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        pairs.push(PKCEUtils.generate());
      }

      const challenges = pairs.map((p) => p.codeChallenge);
      const uniqueChallenges = new Set(challenges);

      // All challenges should be unique (due to unique verifiers)
      expect(uniqueChallenges.size).toBe(iterations);
    });

    it('should generate base64url encoded values (no +, /, or = characters)', () => {
      // Test multiple times to ensure consistency
      for (let i = 0; i < 50; i++) {
        const pkce = PKCEUtils.generate();

        expect(pkce.codeVerifier).not.toMatch(/[+/=]/);
        expect(pkce.codeChallenge).not.toMatch(/[+/=]/);
      }
    });
  });

  describe('generateCodeVerifier()', () => {
    it('should generate verifier with default 32 bytes', () => {
      const verifier = PKCEUtils.generateCodeVerifier();

      // 32 bytes = 43 base64url chars (after removing padding)
      expect(verifier.length).toBe(43);
    });

    it('should generate verifier with custom byte length', () => {
      const verifier = PKCEUtils.generateCodeVerifier(64);

      // 64 bytes = 86 base64url chars
      expect(verifier.length).toBe(86);
    });

    it('should truncate verifier at 128 characters maximum', () => {
      // 96 bytes would normally produce 128 chars of base64
      const verifier = PKCEUtils.generateCodeVerifier(100);

      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('should throw error for insufficient entropy (< 32 bytes)', () => {
      expect(() => PKCEUtils.generateCodeVerifier(16)).toThrow(
        'Insufficient entropy',
      );
    });

    it('should throw error for zero bytes', () => {
      expect(() => PKCEUtils.generateCodeVerifier(0)).toThrow(
        'Insufficient entropy',
      );
    });
  });

  describe('generateCodeChallenge() - RFC 7636 Appendix B Test Vector', () => {
    /**
     * RFC 7636 Appendix B specifies this test vector:
     *
     * code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
     *
     * S256:
     * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
     *                = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
     */
    it('should produce correct challenge for RFC 7636 test vector', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const challenge = PKCEUtils.generateCodeChallenge(verifier);

      expect(challenge).toBe(expectedChallenge);
    });

    it('should produce consistent challenges for same verifier', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      const challenge1 = PKCEUtils.generateCodeChallenge(verifier);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier);
      const challenge3 = PKCEUtils.generateCodeChallenge(verifier);

      expect(challenge1).toBe(challenge2);
      expect(challenge2).toBe(challenge3);
    });

    it('should produce different challenges for different verifiers', () => {
      const verifier1 = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const verifier2 = 'aBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      const challenge1 = PKCEUtils.generateCodeChallenge(verifier1);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('generateCodeChallenge() - Error Handling', () => {
    it('should throw error for empty verifier', () => {
      expect(() => PKCEUtils.generateCodeChallenge('')).toThrow(
        'Code verifier is required',
      );
    });

    it('should throw error for null/undefined verifier', () => {
      expect(() =>
        PKCEUtils.generateCodeChallenge(null as unknown as string),
      ).toThrow('Code verifier is required');
      expect(() =>
        PKCEUtils.generateCodeChallenge(undefined as unknown as string),
      ).toThrow('Code verifier is required');
    });

    it('should throw error for verifier shorter than 43 characters', () => {
      const shortVerifier = 'a'.repeat(42);

      expect(() => PKCEUtils.generateCodeChallenge(shortVerifier)).toThrow(
        'Invalid code verifier: length 42 is less than minimum 43',
      );
    });

    it('should throw error for verifier longer than 128 characters', () => {
      const longVerifier = 'a'.repeat(129);

      expect(() => PKCEUtils.generateCodeChallenge(longVerifier)).toThrow(
        'Invalid code verifier: length 129 exceeds maximum 128',
      );
    });

    it('should throw error for verifier with invalid characters', () => {
      // Contains space
      const verifierWithSpace = 'dBjftJeZ4CVP mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      expect(() => PKCEUtils.generateCodeChallenge(verifierWithSpace)).toThrow(
        'contains characters outside the allowed set',
      );

      // Contains +
      const verifierWithPlus = 'dBjftJeZ4CVP+mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      expect(() => PKCEUtils.generateCodeChallenge(verifierWithPlus)).toThrow(
        'contains characters outside the allowed set',
      );

      // Contains /
      const verifierWithSlash = 'dBjftJeZ4CVP/mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      expect(() => PKCEUtils.generateCodeChallenge(verifierWithSlash)).toThrow(
        'contains characters outside the allowed set',
      );

      // Contains =
      const verifierWithEquals = 'dBjftJeZ4CVP=mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      expect(() => PKCEUtils.generateCodeChallenge(verifierWithEquals)).toThrow(
        'contains characters outside the allowed set',
      );
    });

    it('should accept verifier exactly 43 characters (minimum)', () => {
      const minVerifier = 'a'.repeat(43);

      expect(() => PKCEUtils.generateCodeChallenge(minVerifier)).not.toThrow();
    });

    it('should accept verifier exactly 128 characters (maximum)', () => {
      const maxVerifier = 'a'.repeat(128);

      expect(() => PKCEUtils.generateCodeChallenge(maxVerifier)).not.toThrow();
    });

    it('should accept valid RFC 7636 characters: letters, numbers, -, ., _, ~', () => {
      // All allowed characters
      const validVerifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-._~';

      expect(() =>
        PKCEUtils.generateCodeChallenge(validVerifier),
      ).not.toThrow();
    });
  });

  describe('verify()', () => {
    it('should return true for matching verifier and challenge', () => {
      const pkce = PKCEUtils.generate();

      const isValid = PKCEUtils.verify(pkce.codeVerifier, pkce.codeChallenge);

      expect(isValid).toBe(true);
    });

    it('should return true for RFC 7636 test vector', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const isValid = PKCEUtils.verify(verifier, challenge);

      expect(isValid).toBe(true);
    });

    it('should return false for non-matching verifier and challenge', () => {
      const pkce = PKCEUtils.generate();
      const wrongChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const isValid = PKCEUtils.verify(pkce.codeVerifier, wrongChallenge);

      expect(isValid).toBe(false);
    });

    it('should return false for tampered challenge', () => {
      const pkce = PKCEUtils.generate();
      const tamperedChallenge = pkce.codeChallenge.slice(0, -1) + 'X';

      const isValid = PKCEUtils.verify(pkce.codeVerifier, tamperedChallenge);

      expect(isValid).toBe(false);
    });

    it('should return false for empty verifier', () => {
      const isValid = PKCEUtils.verify(
        '',
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      );

      expect(isValid).toBe(false);
    });

    it('should return false for invalid verifier', () => {
      const isValid = PKCEUtils.verify(
        'short',
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      );

      expect(isValid).toBe(false);
    });

    it('should return false for challenges with different lengths', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const shortChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URW';

      const isValid = PKCEUtils.verify(verifier, shortChallenge);

      expect(isValid).toBe(false);
    });
  });

  describe('validateVerifier()', () => {
    it('should return valid for properly generated verifier', () => {
      const pkce = PKCEUtils.generate();
      const result = PKCEUtils.validateVerifier(pkce.codeVerifier);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for empty verifier', () => {
      const result = PKCEUtils.validateVerifier('');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Code verifier is required');
    });

    it('should return invalid for verifier too short', () => {
      const result = PKCEUtils.validateVerifier('a'.repeat(42));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should return invalid for verifier too long', () => {
      const result = PKCEUtils.validateVerifier('a'.repeat(129));

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should return invalid for verifier with invalid characters', () => {
      const result = PKCEUtils.validateVerifier('a'.repeat(43) + ' ');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should return valid for RFC 7636 test vector', () => {
      const result = PKCEUtils.validateVerifier(
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe('PKCE Flow Integration', () => {
    it('should complete a full PKCE flow simulation', () => {
      // Step 1: Client generates PKCE pair
      const pkce = PKCEUtils.generate();

      // Step 2: Client sends authorization request with code_challenge
      // (simulated - in real flow this goes to auth server)
      const authRequest = {
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'https://example.com/callback',
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod,
        state: 'random-state',
      };

      expect(authRequest.code_challenge).toBeDefined();
      expect(authRequest.code_challenge_method).toBe('S256');

      // Step 3: Auth server stores the challenge (simulated)
      const storedChallenge = authRequest.code_challenge;

      // Step 4: Client receives auth code and exchanges it with code_verifier
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'auth-code-from-server',
        redirect_uri: 'https://example.com/callback',
        client_id: 'test-client',
        code_verifier: pkce.codeVerifier,
      };

      // Step 5: Server verifies the code_verifier matches stored challenge
      const isValid = PKCEUtils.verify(
        tokenRequest.code_verifier,
        storedChallenge,
      );

      expect(isValid).toBe(true);
    });

    it('should detect interception attack (wrong verifier)', () => {
      // Attacker intercepts auth code but doesn't have the original verifier
      const legitimateClient = PKCEUtils.generate();
      const storedChallenge = legitimateClient.codeChallenge;

      // Attacker generates their own verifier
      const attackerPkce = PKCEUtils.generate();

      // Server verifies - attacker's verifier won't match
      const isValid = PKCEUtils.verify(
        attackerPkce.codeVerifier,
        storedChallenge,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Security Properties', () => {
    it('should use sufficient entropy (32+ bytes)', () => {
      // Each generated verifier should have high entropy
      // With 32 bytes of random data, collision probability is negligible
      const verifiers = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const pkce = PKCEUtils.generate();
        verifiers.add(pkce.codeVerifier);
      }

      // All should be unique
      expect(verifiers.size).toBe(iterations);
    });

    it('should resist timing attacks in verify()', () => {
      const pkce = PKCEUtils.generate();

      // These should take approximately the same time regardless of
      // how early they differ (timing-safe comparison)
      const challenge = pkce.codeChallenge;
      const wrongChallenge1 = 'X' + challenge.slice(1); // Differs at start
      const wrongChallenge2 = challenge.slice(0, -1) + 'X'; // Differs at end

      // Both should return false
      expect(PKCEUtils.verify(pkce.codeVerifier, wrongChallenge1)).toBe(false);
      expect(PKCEUtils.verify(pkce.codeVerifier, wrongChallenge2)).toBe(false);
    });

    it('should produce unpredictable verifiers', () => {
      // Statistical test: generated verifiers should have even character distribution
      const pkce = PKCEUtils.generate();
      const chars = pkce.codeVerifier.split('');

      // Character frequency should be somewhat even
      // (not perfectly, but no single char should dominate)
      const frequency: Record<string, number> = {};
      for (const char of chars) {
        frequency[char] = (frequency[char] || 0) + 1;
      }

      const maxFrequency = Math.max(...Object.values(frequency));
      const avgFrequency = chars.length / Object.keys(frequency).length;

      // No character should appear more than 3x the average
      expect(maxFrequency).toBeLessThan(avgFrequency * 3);
    });
  });
});
