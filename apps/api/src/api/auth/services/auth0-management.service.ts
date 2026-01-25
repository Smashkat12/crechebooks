import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Auth0CreateUserDto {
  email: string;
  password: string;
  name: string;
  connection?: string;
}

export interface Auth0User {
  user_id: string;
  email: string;
  name: string;
  email_verified: boolean;
  created_at: string;
}

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Auth0ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  errorCode?: string;
}

/**
 * Auth0 Management API Service
 *
 * Handles user management operations via Auth0 Management API:
 * - Creating users during signup
 * - Updating user metadata
 * - Deleting users
 *
 * Requires the following environment variables:
 * - AUTH0_DOMAIN: Your Auth0 domain (e.g., your-tenant.auth0.com)
 * - AUTH0_MANAGEMENT_CLIENT_ID: Management API client ID
 * - AUTH0_MANAGEMENT_CLIENT_SECRET: Management API client secret
 *
 * The Management API application in Auth0 needs these permissions:
 * - create:users
 * - read:users
 * - update:users
 * - delete:users
 */
@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name);
  private readonly auth0Domain: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly defaultConnection: string;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.auth0Domain = this.configService.get<string>('AUTH0_DOMAIN') || '';
    this.clientId =
      this.configService.get<string>('AUTH0_MANAGEMENT_CLIENT_ID') ||
      this.configService.get<string>('AUTH0_CLIENT_ID') ||
      '';
    this.clientSecret =
      this.configService.get<string>('AUTH0_MANAGEMENT_CLIENT_SECRET') ||
      this.configService.get<string>('AUTH0_CLIENT_SECRET') ||
      '';
    // Default to Username-Password-Authentication, can be overridden
    this.defaultConnection =
      this.configService.get<string>('AUTH0_CONNECTION') ||
      'Username-Password-Authentication';

    if (!this.auth0Domain) {
      this.logger.warn('AUTH0_DOMAIN not configured - Auth0 Management API disabled');
    }
  }

  /**
   * Check if Auth0 Management API is configured
   */
  isConfigured(): boolean {
    return !!(this.auth0Domain && this.clientId && this.clientSecret);
  }

  /**
   * Get Management API access token using client credentials
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new InternalServerErrorException(
        'Auth0 Management API not configured. Set AUTH0_DOMAIN, AUTH0_MANAGEMENT_CLIENT_ID, and AUTH0_MANAGEMENT_CLIENT_SECRET.',
      );
    }

    this.logger.debug('Fetching new Auth0 Management API access token');

    try {
      const response = await fetch(`https://${this.auth0Domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          audience: `https://${this.auth0Domain}/api/v2/`,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(
          `Failed to get Management API token: ${response.status} - ${error}`,
        );
        throw new InternalServerErrorException(
          'Failed to authenticate with Auth0 Management API',
        );
      }

      const data = (await response.json()) as Auth0TokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

      this.logger.debug('Auth0 Management API access token obtained');
      return this.accessToken;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Auth0 Management API token error', error);
      throw new InternalServerErrorException(
        'Failed to connect to Auth0 Management API',
      );
    }
  }

  /**
   * Create a new user in Auth0
   *
   * @param dto User creation data
   * @returns Created Auth0 user with user_id
   */
  async createUser(dto: Auth0CreateUserDto): Promise<Auth0User> {
    const accessToken = await this.getAccessToken();

    this.logger.debug(`Creating Auth0 user: ${dto.email}`);

    try {
      const response = await fetch(
        `https://${this.auth0Domain}/api/v2/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            email: dto.email,
            password: dto.password,
            name: dto.name,
            connection: dto.connection || this.defaultConnection,
            email_verified: false, // Require email verification
            verify_email: true, // Send verification email
          }),
        },
      );

      if (!response.ok) {
        const errorData = (await response.json()) as Auth0ErrorResponse;
        this.logger.error(
          `Auth0 create user failed: ${response.status} - ${JSON.stringify(errorData)}`,
        );

        // Handle specific Auth0 errors
        if (
          response.status === 409 ||
          errorData.errorCode === 'auth0_idp_error'
        ) {
          throw new ConflictException(
            'A user with this email already exists in the authentication system.',
          );
        }

        if (errorData.message?.includes('PasswordStrengthError')) {
          throw new ConflictException(
            'Password does not meet security requirements. Use at least 8 characters with uppercase, lowercase, numbers, and special characters.',
          );
        }

        throw new InternalServerErrorException(
          errorData.message || 'Failed to create user account',
        );
      }

      const user = (await response.json()) as Auth0User;
      this.logger.log(`Auth0 user created: ${user.user_id} (${dto.email})`);

      return user;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Auth0 create user error', error);
      throw new InternalServerErrorException(
        'Failed to create user in authentication system',
      );
    }
  }

  /**
   * Get user by email from Auth0
   *
   * @param email User email
   * @returns Auth0 user or null if not found
   */
  async getUserByEmail(email: string): Promise<Auth0User | null> {
    const accessToken = await this.getAccessToken();

    this.logger.debug(`Looking up Auth0 user by email: ${email}`);

    try {
      const response = await fetch(
        `https://${this.auth0Domain}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(
          `Auth0 get user by email failed: ${response.status} - ${error}`,
        );
        return null;
      }

      const users = (await response.json()) as Auth0User[];
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      this.logger.error('Auth0 get user by email error', error);
      return null;
    }
  }

  /**
   * Delete a user from Auth0
   *
   * @param userId Auth0 user_id
   */
  async deleteUser(userId: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    this.logger.debug(`Deleting Auth0 user: ${userId}`);

    try {
      const response = await fetch(
        `https://${this.auth0Domain}/api/v2/users/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        this.logger.error(
          `Auth0 delete user failed: ${response.status} - ${error}`,
        );
        throw new InternalServerErrorException(
          'Failed to delete user from authentication system',
        );
      }

      this.logger.log(`Auth0 user deleted: ${userId}`);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Auth0 delete user error', error);
      throw new InternalServerErrorException(
        'Failed to delete user from authentication system',
      );
    }
  }

  /**
   * Update user password in Auth0
   *
   * @param userId Auth0 user_id
   * @param newPassword New password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    this.logger.debug(`Updating password for Auth0 user: ${userId}`);

    try {
      const response = await fetch(
        `https://${this.auth0Domain}/api/v2/users/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            password: newPassword,
            connection: this.defaultConnection,
          }),
        },
      );

      if (!response.ok) {
        const errorData = (await response.json()) as Auth0ErrorResponse;
        this.logger.error(
          `Auth0 update password failed: ${response.status} - ${JSON.stringify(errorData)}`,
        );

        if (errorData.message?.includes('PasswordStrengthError')) {
          throw new ConflictException(
            'Password does not meet security requirements.',
          );
        }

        throw new InternalServerErrorException(
          'Failed to update password in authentication system',
        );
      }

      this.logger.log(`Auth0 password updated for user: ${userId}`);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Auth0 update password error', error);
      throw new InternalServerErrorException(
        'Failed to update password in authentication system',
      );
    }
  }
}
