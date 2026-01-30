/**
 * API Key Management Controller
 *
 * TASK-CLI-001: REST endpoints for API key lifecycle management
 *
 * Endpoints:
 * - POST   /api/v1/auth/api-keys      - Create new API key
 * - GET    /api/v1/auth/api-keys      - List API keys for tenant
 * - GET    /api/v1/auth/api-keys/:id  - Get single API key details
 * - DELETE /api/v1/auth/api-keys/:id  - Revoke an API key
 * - POST   /api/v1/auth/api-keys/:id/rotate - Rotate (revoke + create new)
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ApiKeyService,
  CreateApiKeyDto,
  ApiKeyWithSecret,
} from './services/api-key.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { getTenantId } from './utils/tenant-assertions';
import type { IUser } from '../../database/entities/user.entity';
import { ApiKeyScope, ApiKey } from '@prisma/client';

// DTO for API key creation request
class CreateApiKeyRequest {
  name!: string;
  scopes!: ApiKeyScope[];
  description?: string;
  environment?: string;
  expiresInDays?: number;
}

// Response DTOs (hide sensitive data)
class ApiKeyResponse {
  id!: string;
  name!: string;
  keyPrefix!: string;
  scopes!: ApiKeyScope[];
  description?: string | null;
  environment!: string;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  lastUsedIp?: string | null;
  revokedAt?: Date | null;
  createdAt!: Date;

  static from(apiKey: ApiKey): ApiKeyResponse {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      description: apiKey.description,
      environment: apiKey.environment,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      lastUsedIp: apiKey.lastUsedIp,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    };
  }
}

class CreateApiKeyResponse extends ApiKeyResponse {
  /** Full secret key - only returned once on creation! */
  secretKey!: string;

  static fromWithSecret(apiKey: ApiKeyWithSecret): CreateApiKeyResponse {
    return {
      ...ApiKeyResponse.from(apiKey),
      secretKey: apiKey.secretKey,
    };
  }
}

@ApiTags('API Keys')
@Controller('api/v1/auth/api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new API key',
    description:
      'Generate a new API key for CLI/MCP access. The secret key is only returned once!',
  })
  @ApiResponse({ status: 201, description: 'API key created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createApiKey(
    @CurrentUser() user: IUser,
    @Body() request: CreateApiKeyRequest,
  ): Promise<CreateApiKeyResponse> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Creating API key "${request.name}" for tenant ${tenantId}`,
    );

    // Calculate expiry date if specified
    let expiresAt: Date | undefined;
    if (request.expiresInDays && request.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);
    }

    const dto: CreateApiKeyDto = {
      name: request.name,
      scopes: request.scopes || [ApiKeyScope.FULL_ACCESS],
      description: request.description,
      environment: request.environment || 'production',
      expiresAt,
    };

    const apiKey = await this.apiKeyService.createApiKey(
      user.id,
      tenantId,
      dto,
    );

    return CreateApiKeyResponse.fromWithSecret(apiKey);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the tenant' })
  @ApiQuery({ name: 'includeRevoked', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of API keys' })
  async listApiKeys(
    @CurrentUser() user: IUser,
    @Query('includeRevoked') includeRevoked?: string,
  ): Promise<ApiKeyResponse[]> {
    const tenantId = getTenantId(user);
    const keys = await this.apiKeyService.listApiKeys(
      tenantId,
      includeRevoked === 'true',
    );
    return keys.map(ApiKeyResponse.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details' })
  @ApiResponse({ status: 200, description: 'API key details' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async getApiKey(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<ApiKeyResponse> {
    const tenantId = getTenantId(user);
    const apiKey = await this.apiKeyService.getApiKey(id, tenantId);
    return ApiKeyResponse.from(apiKey);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 409, description: 'API key already revoked' })
  async revokeApiKey(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = getTenantId(user);
    await this.apiKeyService.revokeApiKey(id, tenantId, user.id);
    return { success: true, message: 'API key revoked successfully' };
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Rotate an API key',
    description:
      'Revokes the old key and creates a new one with the same settings. The new secret is only returned once!',
  })
  @ApiResponse({ status: 201, description: 'New API key created' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 403, description: 'Cannot rotate revoked key' })
  async rotateApiKey(
    @CurrentUser() user: IUser,
    @Param('id') id: string,
  ): Promise<CreateApiKeyResponse> {
    const tenantId = getTenantId(user);
    this.logger.log(`Rotating API key ${id} for tenant ${tenantId}`);

    const newKey = await this.apiKeyService.rotateApiKey(id, tenantId, user.id);

    return CreateApiKeyResponse.fromWithSecret(newKey);
  }
}
