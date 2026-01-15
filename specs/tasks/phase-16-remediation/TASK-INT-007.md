<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-007</task_id>
    <title>Implement OAuth2 PKCE</title>
    <priority>MEDIUM</priority>
    <category>Security</category>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>oauth</tag>
      <tag>pkce</tag>
      <tag>xero-integration</tag>
      <tag>authorization-code</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The Xero OAuth2 integration currently uses the standard authorization code
      flow without PKCE (Proof Key for Code Exchange). While the state parameter
      provides CSRF protection, PKCE adds an additional layer of security against
      authorization code interception attacks, particularly important for mobile
      and public clients.
    </background>
    <issue_description>
      MEDIUM - OAuth2 without PKCE vulnerable to interception. Authorization codes
      can potentially be intercepted during the redirect flow, allowing attackers
      to exchange them for access tokens. PKCE prevents this by requiring proof
      that the client initiating the flow is the same one completing it.
    </issue_description>
    <business_impact>
      - Potential OAuth token theft via code interception
      - Does not meet current OAuth 2.1 security best practices
      - May not comply with future Xero API requirements
      - Reduced security posture for financial data access
    </business_impact>
    <technical_debt>
      OAuth 2.1 recommends PKCE for all OAuth clients. Adding it now ensures
      compliance with evolving security standards.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Implement PKCE code verifier generation</item>
      <item>Implement code challenge generation (SHA256)</item>
      <item>Store code verifier securely during OAuth flow</item>
      <item>Include code_challenge in authorization request</item>
      <item>Include code_verifier in token exchange request</item>
      <item>Update Xero OAuth integration</item>
    </in_scope>
    <out_of_scope>
      <item>Other OAuth integrations (may be separate tasks)</item>
      <item>OAuth provider-side configuration</item>
      <item>Token refresh flow changes</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/integrations/xero/xero-auth.service.ts</file>
      <file>apps/api/src/integrations/xero/xero-auth.service.spec.ts</file>
      <file>apps/api/src/common/utils/pkce.utils.ts (new)</file>
    </affected_files>
    <dependencies>
      <dependency>TASK-INT-002 - OAuth state encryption (should be completed first)</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement RFC 7636 PKCE extension for the Xero OAuth2 flow. Generate a
      cryptographically random code verifier, derive a SHA256 code challenge,
      store the verifier securely, and include appropriate parameters in the
      authorization and token requests.
    </approach>
    <steps>
      <step order="1">
        <description>Create PKCE utility module</description>
        <details>
          Build a reusable PKCE utility that handles code verifier generation
          and code challenge derivation according to RFC 7636.
        </details>
        <code_example>
```typescript
// apps/api/src/common/utils/pkce.utils.ts
import * as crypto from 'crypto';

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export class PKCEUtils {
  /**
   * Minimum length for code verifier (RFC 7636)
   */
  private static readonly MIN_VERIFIER_LENGTH = 43;

  /**
   * Maximum length for code verifier (RFC 7636)
   */
  private static readonly MAX_VERIFIER_LENGTH = 128;

  /**
   * Default verifier length (using 32 random bytes = 43 base64url chars)
   */
  private static readonly DEFAULT_VERIFIER_BYTES = 32;

  /**
   * Generates a PKCE code verifier and challenge pair
   * @returns PKCEPair with verifier, challenge, and method
   */
  static generate(): PKCEPair {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Generates a cryptographically random code verifier
   * RFC 7636 Section 4.1:
   * - 43-128 characters
   * - Characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
   */
  static generateCodeVerifier(bytes: number = this.DEFAULT_VERIFIER_BYTES): string {
    const buffer = crypto.randomBytes(bytes);
    const verifier = this.base64UrlEncode(buffer);

    // Validate length
    if (verifier.length < this.MIN_VERIFIER_LENGTH) {
      throw new Error(
        `Code verifier too short: ${verifier.length} < ${this.MIN_VERIFIER_LENGTH}`
      );
    }

    if (verifier.length > this.MAX_VERIFIER_LENGTH) {
      return verifier.slice(0, this.MAX_VERIFIER_LENGTH);
    }

    return verifier;
  }

  /**
   * Generates a code challenge from a code verifier using SHA256
   * RFC 7636 Section 4.2:
   * code_challenge = BASE64URL(SHA256(code_verifier))
   */
  static generateCodeChallenge(codeVerifier: string): string {
    if (!codeVerifier || codeVerifier.length < this.MIN_VERIFIER_LENGTH) {
      throw new Error('Invalid code verifier');
    }

    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier, 'ascii')
      .digest();

    return this.base64UrlEncode(hash);
  }

  /**
   * Verifies that a code verifier matches a code challenge
   * Used for testing and validation
   */
  static verify(codeVerifier: string, codeChallenge: string): boolean {
    const expectedChallenge = this.generateCodeChallenge(codeVerifier);
    return crypto.timingSafeEqual(
      Buffer.from(expectedChallenge),
      Buffer.from(codeChallenge)
    );
  }

  /**
   * Base64 URL encoding without padding
   * RFC 7636 uses base64url encoding
   */
  private static base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
```
        </code_example>
      </step>
      <step order="2">
        <description>Update state to include PKCE verifier</description>
        <details>
          Modify the OAuth state to securely store the code verifier alongside
          other state data. The verifier must be retrievable during the callback.
        </details>
        <code_example>
```typescript
// Updated state data structure
interface OAuthStateData {
  userId: string;
  returnUrl: string;
  codeVerifier: string;  // Add PKCE verifier
  nonce: string;
  timestamp: number;
}
```
        </code_example>
      </step>
      <step order="3">
        <description>Update authorization URL generation</description>
        <details>
          Include code_challenge and code_challenge_method in the authorization
          request URL.
        </details>
        <code_example>
```typescript
// apps/api/src/integrations/xero/xero-auth.service.ts
import { PKCEUtils, PKCEPair } from '../../common/utils/pkce.utils';

@Injectable()
export class XeroAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.getOrThrow('XERO_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('XERO_CLIENT_SECRET');
    this.redirectUri = this.configService.getOrThrow('XERO_REDIRECT_URI');

    const stateKey = this.configService.getOrThrow('XERO_STATE_KEY');
    this.stateKey = Buffer.from(stateKey, 'utf-8');
  }

  /**
   * Generate authorization URL with PKCE
   */
  generateAuthorizationUrl(userId: string, returnUrl: string): string {
    // Generate PKCE pair
    const pkce = PKCEUtils.generate();

    // Create state with code verifier
    const state = this.generateState(userId, returnUrl, pkce.codeVerifier);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid profile email accounting.transactions accounting.contacts',
      state: state,
      // PKCE parameters
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });

    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  /**
   * Generate encrypted state including PKCE verifier
   */
  private generateState(
    userId: string,
    returnUrl: string,
    codeVerifier: string,
  ): string {
    const stateData: OAuthStateData = {
      userId,
      returnUrl,
      codeVerifier,  // Include verifier in encrypted state
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    };

    // Encrypt state data
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.stateKey.slice(0, 32),
      iv
    );

    let encrypted = cipher.update(JSON.stringify(stateData), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'base64'),
    ]).toString('base64url');
  }

  /**
   * Handle OAuth callback with PKCE verification
   */
  async handleCallback(code: string, state: string): Promise<TokenResponse> {
    // Decrypt and validate state
    const stateData = this.validateState(state);

    // Exchange code for tokens with PKCE verifier
    const tokens = await this.exchangeCodeForTokens(
      code,
      stateData.codeVerifier
    );

    return {
      ...tokens,
      userId: stateData.userId,
      returnUrl: stateData.returnUrl,
    };
  }

  /**
   * Exchange authorization code for tokens with PKCE
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<XeroTokens> {
    const tokenUrl = 'https://identity.xero.com/connect/token';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      // PKCE: Include code verifier
      code_verifier: codeVerifier,
    });

    const response = await this.httpService.axiosRef.post(
      tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
      scope: response.data.scope,
    };
  }

  /**
   * Validate and decrypt state parameter
   */
  private validateState(encryptedState: string): OAuthStateData {
    try {
      const data = Buffer.from(encryptedState, 'base64url');
      const iv = data.slice(0, 12);
      const authTag = data.slice(12, 28);
      const encrypted = data.slice(28);

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.stateKey.slice(0, 32),
        iv
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const stateData: OAuthStateData = JSON.parse(decrypted);

      // Validate timestamp (10 minute expiry)
      const maxAge = 10 * 60 * 1000;
      if (Date.now() - stateData.timestamp > maxAge) {
        throw new Error('OAuth state has expired');
      }

      // Validate code verifier is present
      if (!stateData.codeVerifier) {
        throw new Error('Missing PKCE code verifier in state');
      }

      return stateData;
    } catch (error) {
      throw new UnauthorizedException('Invalid OAuth state parameter');
    }
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Add PKCE validation logging</description>
        <details>
          Add appropriate logging for PKCE operations without exposing
          sensitive values.
        </details>
        <code_example>
```typescript
// Logging example (never log actual verifier or challenge)
this.logger.debug('PKCE parameters generated', {
  challengeMethod: pkce.codeChallengeMethod,
  verifierLength: pkce.codeVerifier.length,
  challengeLength: pkce.codeChallenge.length,
});

this.logger.debug('Token exchange with PKCE', {
  hasCodeVerifier: !!stateData.codeVerifier,
  verifierLength: stateData.codeVerifier?.length,
});
```
        </code_example>
      </step>
      <step order="5">
        <description>Write comprehensive tests</description>
        <details>
          Test PKCE generation, verification, integration with OAuth flow,
          and error handling.
        </details>
        <code_example>
```typescript
// apps/api/src/common/utils/pkce.utils.spec.ts
describe('PKCEUtils', () => {
  describe('generate', () => {
    it('should generate valid PKCE pair', () => {
      const pkce = PKCEUtils.generate();

      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeChallengeMethod).toBe('S256');
    });

    it('should generate unique verifiers', () => {
      const pkce1 = PKCEUtils.generate();
      const pkce2 = PKCEUtils.generate();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe('verify', () => {
    it('should verify valid pair', () => {
      const pkce = PKCEUtils.generate();

      expect(PKCEUtils.verify(pkce.codeVerifier, pkce.codeChallenge)).toBe(true);
    });

    it('should reject invalid pair', () => {
      const pkce = PKCEUtils.generate();
      const wrongChallenge = 'invalid_challenge_value';

      expect(PKCEUtils.verify(pkce.codeVerifier, wrongChallenge)).toBe(false);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should match RFC 7636 test vector', () => {
      // RFC 7636 Appendix B test vector
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      expect(challenge).toBe(expectedChallenge);
    });
  });
});
```
        </code_example>
      </step>
    </steps>
    <technical_notes>
      - Code verifier: 43-128 characters, base64url-safe alphabet
      - Code challenge: SHA256 hash of verifier, base64url encoded
      - Always use S256 method (plain is deprecated)
      - Store verifier securely (encrypted in state or server-side session)
      - Verifier should never be transmitted to authorization server
      - Challenge is public, verifier is secret
      - RFC 7636 reference: https://tools.ietf.org/html/rfc7636
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>PKCE generates valid code verifier length</description>
        <expected_result>Verifier is 43-128 characters</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>PKCE generates valid code challenge</description>
        <expected_result>Challenge is SHA256 of verifier, base64url encoded</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Code verifiers are unique per request</description>
        <expected_result>Multiple generations produce different verifiers</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>RFC 7636 test vector passes</description>
        <expected_result>Known verifier produces expected challenge</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Authorization URL includes PKCE parameters</description>
        <expected_result>URL has code_challenge and code_challenge_method</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Token exchange includes code verifier</description>
        <expected_result>Token request includes code_verifier parameter</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>Verifier is stored in encrypted state</description>
        <expected_result>State contains verifier, retrievable on callback</expected_result>
      </test_case>
      <test_case>
        <id>TC-008</id>
        <description>Missing verifier in state fails callback</description>
        <expected_result>UnauthorizedException thrown</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>PKCE code verifier generated per authorization request</criterion>
      <criterion>SHA256 code challenge included in authorization URL</criterion>
      <criterion>Code verifier securely stored during OAuth flow</criterion>
      <criterion>Code verifier included in token exchange request</criterion>
      <criterion>RFC 7636 test vectors pass</criterion>
      <criterion>Integration tests verify complete PKCE flow</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>PKCE utility module created</item>
      <item>Code verifier generation implemented</item>
      <item>SHA256 code challenge generation implemented</item>
      <item>Verifier stored securely in OAuth state</item>
      <item>Authorization URL includes PKCE parameters</item>
      <item>Token exchange includes code_verifier</item>
      <item>RFC 7636 compliance verified</item>
      <item>Unit tests for PKCE utilities</item>
      <item>Integration tests for OAuth flow with PKCE</item>
      <item>No sensitive values logged</item>
      <item>Code reviewed</item>
      <item>Documentation updated</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
