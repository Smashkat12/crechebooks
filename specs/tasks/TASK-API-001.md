<task_spec id="TASK-API-001" version="3.0">

<metadata>
  <title>Authentication Controller, Guards, and Auth Service</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>42</sequence>
  <implements>
    <requirement_ref>NFR-SEC-001</requirement_ref>
    <requirement_ref>NFR-SEC-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-21</last_updated>
</metadata>

<critical_context>
## IMPORTANT: What TASK-CORE-003 Actually Created

TASK-CORE-003 created ONLY the User entity foundation:
- `src/database/entities/user.entity.ts` - IUser interface and UserRole enum
- `src/database/dto/user.dto.ts` - CreateUserDto and UpdateUserDto
- `src/database/repositories/user.repository.ts` - UserRepository with CRUD operations
- Prisma User model with auth0Id field

TASK-CORE-003 explicitly declared OUT OF SCOPE:
- "Auth0 integration logic (separate task)"
- "Role-based access control middleware"

**This means THIS task must create the entire auth stack from scratch.**

## Current Project State (Verified 2025-12-21)

### Directory Structure That EXISTS:
```
src/
├── app.module.ts          # Only imports: ConfigModule, PrismaModule, HealthModule
├── main.ts                # Global prefix: 'api/v1', no swagger, no guards
├── config/                # Configuration module
├── database/
│   ├── entities/          # All entity interfaces here (NOT src/core/)
│   ├── dto/               # All DTOs here
│   ├── repositories/      # All repositories here
│   ├── services/          # Business logic services (22 services)
│   ├── prisma/            # PrismaService and module
│   └── parsers/           # CSV/PDF parsers
├── health/                # Health check endpoint
├── integrations/          # Email service
├── mcp/                   # Xero MCP server
└── shared/                # Utilities, exceptions, constants
```

### Directory Structure That DOES NOT EXIST:
- `src/api/` - MUST BE CREATED
- `src/core/` - DOES NOT EXIST (specs reference this incorrectly)

### Packages NOT Installed (Required for this task):
```json
{
  "@nestjs/passport": "required",
  "@nestjs/jwt": "required",
  "@nestjs/swagger": "required",
  "passport": "required",
  "passport-jwt": "required",
  "jwks-rsa": "required for Auth0 JWKS",
  "openid-client": "optional for full OIDC"
}
```

### Existing Files to Use:
- `src/database/entities/user.entity.ts` - UserRole enum, IUser interface
- `src/database/repositories/user.repository.ts` - findByAuth0Id(), updateLastLogin()
- `src/shared/exceptions/` - NotFoundException, ConflictException, DatabaseException
- `prisma/schema.prisma` - User model with auth0Id field
</critical_context>

<scope>
  <in_scope>
    - Install required npm packages
    - Create src/api/ directory structure
    - Create AuthService with Auth0 OAuth integration
    - Create JWT Strategy for Auth0 tokens
    - Create AuthController with OAuth login flow endpoints
    - Implement JwtAuthGuard for protected routes
    - Implement RolesGuard for role-based authorization
    - Create decorators: @Roles, @CurrentUser, @Public
    - Create DTOs for login, callback, refresh with validation
    - Configure Swagger/OpenAPI in main.ts
    - Add auth error handling and response formatting
    - Write unit tests using real assertions (NO MOCK DATA)
  </in_scope>
  <out_of_scope>
    - User entity (TASK-CORE-003 complete)
    - User repository (TASK-CORE-003 complete)
    - Permission-based authorization (future)
    - Multi-factor authentication (future)
  </out_of_scope>
</scope>

<prerequisites>
  <check>TASK-CORE-003 completed - User entity exists at src/database/entities/user.entity.ts</check>
  <check>UserRepository exists at src/database/repositories/user.repository.ts</check>
  <check>Prisma User model has auth0Id field</check>
  <check>Database connection configured in src/config/</check>
</prerequisites>

<environment_variables>
# Required Auth0 configuration (add to .env)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://api.crechebooks.co.za
AUTH0_CALLBACK_URL=http://localhost:3000/api/v1/auth/callback
JWT_EXPIRATION=86400
</environment_variables>

<implementation_steps>

## Step 1: Install Required Packages
```bash
npm install @nestjs/passport @nestjs/jwt @nestjs/swagger passport passport-jwt jwks-rsa
npm install -D @types/passport-jwt
```

## Step 2: Create Directory Structure
```
src/api/
├── api.module.ts
└── auth/
    ├── auth.module.ts
    ├── auth.controller.ts
    ├── auth.service.ts
    ├── strategies/
    │   └── jwt.strategy.ts
    ├── guards/
    │   ├── jwt-auth.guard.ts
    │   └── roles.guard.ts
    ├── decorators/
    │   ├── roles.decorator.ts
    │   ├── current-user.decorator.ts
    │   └── public.decorator.ts
    └── dto/
        ├── login.dto.ts
        ├── callback.dto.ts
        ├── refresh.dto.ts
        └── user-response.dto.ts
```

## Step 3: Implementation Order
1. Create src/api/auth/dto/*.ts - All DTOs with class-validator
2. Create src/api/auth/strategies/jwt.strategy.ts - Auth0 JWT validation
3. Create src/api/auth/auth.service.ts - OAuth flow + token exchange
4. Create src/api/auth/guards/*.ts - JwtAuthGuard and RolesGuard
5. Create src/api/auth/decorators/*.ts - @Roles, @CurrentUser, @Public
6. Create src/api/auth/auth.controller.ts - Endpoints
7. Create src/api/auth/auth.module.ts - Wire everything
8. Create src/api/api.module.ts - Import AuthModule
9. Update src/app.module.ts - Import ApiModule
10. Update src/main.ts - Add Swagger, global guards

</implementation_steps>

<definition_of_done>

<signatures>

<signature file="src/api/auth/auth.controller.ts">
import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import { CallbackRequestDto, AuthCallbackResponseDto } from './dto/callback.dto';
import { RefreshRequestDto, RefreshResponseDto } from './dto/refresh.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Initiate OAuth login flow' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto>;

  @Post('callback')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle OAuth callback' })
  @ApiResponse({ status: 200, type: AuthCallbackResponseDto })
  async callback(@Body() dto: CallbackRequestDto): Promise<AuthCallbackResponseDto>;

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, type: RefreshResponseDto })
  async refresh(@Body() dto: RefreshRequestDto): Promise<RefreshResponseDto>;
}
</signature>

<signature file="src/api/auth/auth.service.ts">
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../../database/repositories/user.repository';
import { IUser, UserRole } from '../../database/entities/user.entity';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: IUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {}

  async getAuthorizationUrl(redirectUri: string): Promise<string>;
  async handleCallback(code: string, state: string): Promise<AuthResult>;
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  async validateUser(auth0Id: string): Promise<IUser | null>;
}
</signature>

<signature file="src/api/auth/strategies/jwt.strategy.ts">
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

export interface JwtPayload {
  sub: string;           // auth0Id
  email: string;
  'https://crechebooks.co.za/tenant_id': string;
  'https://crechebooks.co.za/role': string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const domain = configService.get<string>('AUTH0_DOMAIN');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: JwtPayload): Promise<IUser>;
}
</signature>

<signature file="src/api/auth/guards/jwt-auth.guard.ts">
import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
  handleRequest<TUser>(err: Error | null, user: TUser, info: Error | null): TUser;
}
</signature>

<signature file="src/api/auth/guards/roles.guard.ts">
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../database/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean;
}
</signature>

<signature file="src/api/auth/decorators/roles.decorator.ts">
import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { UserRole } from '../../../database/entities/user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
</signature>

<signature file="src/api/auth/decorators/current-user.decorator.ts">
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IUser } from '../../../database/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (data: keyof IUser | undefined, ctx: ExecutionContext): IUser | IUser[keyof IUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as IUser;
    return data ? user[data] : user;
  },
);
</signature>

<signature file="src/api/auth/decorators/public.decorator.ts">
import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
</signature>

<signature file="src/api/auth/dto/login.dto.ts">
import { IsUrl, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @IsUrl({ require_tld: false }, { message: 'redirect_uri must be a valid URL' })
  @IsNotEmpty({ message: 'redirect_uri is required' })
  @ApiProperty({
    example: 'http://localhost:3000/callback',
    description: 'OAuth callback URL',
  })
  redirect_uri: string;
}

export class LoginResponseDto {
  @ApiProperty({
    example: 'https://your-tenant.auth0.com/authorize?...',
    description: 'Auth0 authorization URL to redirect user to',
  })
  auth_url: string;
}
</signature>

<signature file="src/api/auth/dto/callback.dto.ts">
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class CallbackRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Authorization code is required' })
  @ApiProperty({ description: 'OAuth authorization code from Auth0' })
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'State parameter is required' })
  @ApiProperty({ description: 'State parameter for CSRF protection' })
  state: string;
}

export class AuthCallbackResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token: string;

  @ApiProperty({ description: 'Refresh token for obtaining new access tokens' })
  refresh_token: string;

  @ApiProperty({ example: 86400, description: 'Token expiration in seconds' })
  expires_in: number;

  @ApiProperty({ type: UserResponseDto, description: 'Authenticated user details' })
  user: UserResponseDto;
}
</signature>

<signature file="src/api/auth/dto/refresh.dto.ts">
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  @ApiProperty({ description: 'Refresh token obtained from login' })
  refresh_token: string;
}

export class RefreshResponseDto {
  @ApiProperty({ description: 'New JWT access token' })
  access_token: string;

  @ApiProperty({ example: 86400, description: 'Token expiration in seconds' })
  expires_in: number;
}
</signature>

<signature file="src/api/auth/dto/user-response.dto.ts">
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../database/entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-here', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'John Smith', description: 'User display name' })
  name: string;

  @ApiProperty({ enum: UserRole, example: 'OWNER', description: 'User role' })
  role: UserRole;

  @ApiProperty({ example: 'tenant-uuid', description: 'Tenant ID' })
  tenant_id: string;
}
</signature>

<signature file="src/api/auth/auth.module.ts">
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from '../../database/prisma';
import { UserRepository } from '../../database/repositories/user.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('AUTH0_CLIENT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRATION', 86400),
        },
      }),
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    UserRepository,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
</signature>

<signature file="src/api/api.module.ts">
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule],
  exports: [AuthModule],
})
export class ApiModule {}
</signature>

<signature file="src/main.ts" action="modify">
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get('port', { infer: true }) || 3000;

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Enable CORS
  app.enableCors();

  // Global prefix for API
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CrecheBooks API')
    .setDescription('AI-powered bookkeeping system for South African creches')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  console.log(`CrecheBooks API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`Health check: http://localhost:${port}/health`);
}

void bootstrap();
</signature>

<signature file="src/app.module.ts" action="modify">
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma';
import { ApiModule } from './api/api.module';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { RolesGuard } from './api/auth/guards/roles.guard';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule, ApiModule],
  controllers: [],
  providers: [
    // Apply JwtAuthGuard globally - use @Public() to skip
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Apply RolesGuard globally - use @Roles() to require specific roles
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
</signature>

</signatures>

<constraints>
  - All DTOs MUST use class-validator decorators with explicit error messages
  - All endpoints MUST have Swagger/OpenAPI documentation
  - Guards MUST extract tenant_id from JWT claims
  - MUST log authentication failures with full context for security monitoring
  - JWT expiry MUST be configurable via AUTH0_DOMAIN, JWT_EXPIRATION env vars
  - MUST return standardized error responses matching api-contracts.md format
  - NO backwards compatibility hacks - fail fast with clear errors
  - NO mock data in tests - use real validation and assertions
  - DO NOT use 'any' type anywhere - use proper types or 'unknown'
</constraints>

</definition_of_done>

<error_handling>
## Required Error Cases

All errors MUST throw appropriate exceptions with detailed context:

1. **Invalid/expired JWT**: UnauthorizedException with message "Invalid or expired token"
2. **Missing JWT**: UnauthorizedException with message "Authorization token required"
3. **Insufficient role**: ForbiddenException with message "Insufficient permissions: required role X"
4. **Invalid OAuth code**: UnauthorizedException with message "Invalid authorization code"
5. **Expired OAuth state**: UnauthorizedException with message "OAuth state expired or invalid"
6. **User not found after JWT validation**: UnauthorizedException with message "User account not found"
7. **User deactivated**: ForbiddenException with message "User account is deactivated"
8. **Invalid refresh token**: UnauthorizedException with message "Invalid or expired refresh token"
9. **Auth0 API errors**: Log full error, throw UnauthorizedException with generic message

## Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Human-readable error message"
  },
  "requestId": "uuid"
}
```
</error_handling>

<files_to_create>
  <file path="src/api/api.module.ts">API module aggregating all API submodules</file>
  <file path="src/api/auth/auth.module.ts">Auth module with all providers</file>
  <file path="src/api/auth/auth.controller.ts">Authentication controller with OAuth endpoints</file>
  <file path="src/api/auth/auth.service.ts">Auth service with Auth0 integration</file>
  <file path="src/api/auth/strategies/jwt.strategy.ts">JWT strategy for Auth0 token validation</file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts">JWT authentication guard</file>
  <file path="src/api/auth/guards/roles.guard.ts">Role-based authorization guard</file>
  <file path="src/api/auth/decorators/roles.decorator.ts">@Roles decorator</file>
  <file path="src/api/auth/decorators/current-user.decorator.ts">@CurrentUser decorator</file>
  <file path="src/api/auth/decorators/public.decorator.ts">@Public decorator for unauthenticated routes</file>
  <file path="src/api/auth/dto/login.dto.ts">Login request/response DTOs</file>
  <file path="src/api/auth/dto/callback.dto.ts">OAuth callback DTOs</file>
  <file path="src/api/auth/dto/refresh.dto.ts">Refresh token DTOs</file>
  <file path="src/api/auth/dto/user-response.dto.ts">User response DTO</file>
  <file path="tests/api/auth/auth.controller.spec.ts">Auth controller tests</file>
  <file path="tests/api/auth/auth.service.spec.ts">Auth service tests</file>
  <file path="tests/api/auth/guards/jwt-auth.guard.spec.ts">JWT guard tests</file>
  <file path="tests/api/auth/guards/roles.guard.spec.ts">Roles guard tests</file>
  <file path="tests/api/auth/strategies/jwt.strategy.spec.ts">JWT strategy tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import ApiModule, register global guards</file>
  <file path="src/main.ts">Add ValidationPipe, Swagger config, remove duplicate CORS</file>
  <file path="package.json">Add @nestjs/passport, @nestjs/jwt, @nestjs/swagger, passport-jwt, jwks-rsa</file>
</files_to_modify>

<validation_criteria>
  <criterion>npm install completes without errors</criterion>
  <criterion>npm run build compiles without TypeScript errors</criterion>
  <criterion>POST /api/v1/auth/login returns valid Auth0 authorization URL</criterion>
  <criterion>POST /api/v1/auth/callback exchanges code for valid tokens</criterion>
  <criterion>POST /api/v1/auth/refresh returns new access token</criterion>
  <criterion>JwtAuthGuard blocks requests without valid token (401)</criterion>
  <criterion>JwtAuthGuard allows requests with @Public decorator</criterion>
  <criterion>RolesGuard blocks requests with insufficient role (403)</criterion>
  <criterion>@CurrentUser decorator extracts user from request</criterion>
  <criterion>Swagger docs accessible at /api/docs</criterion>
  <criterion>All DTOs validate input correctly (reject invalid, accept valid)</criterion>
  <criterion>All auth errors logged with context before returning</criterion>
  <criterion>npm run test passes all tests</criterion>
</validation_criteria>

<test_requirements>
## Test Commands
```bash
npm run test -- auth.controller.spec
npm run test -- auth.service.spec
npm run test -- jwt-auth.guard.spec
npm run test -- roles.guard.spec
npm run test -- jwt.strategy.spec
```

## Test Requirements
- NO MOCK DATA - test real validation, real guard behavior
- Tests MUST use actual class instances, not mocked objects
- Tests MUST verify actual error messages match specifications
- Tests MUST cover all error cases listed in error_handling section
- Tests MUST verify guards properly check @Public and @Roles metadata
- Integration tests MUST make real HTTP calls (supertest)

## Minimum Test Cases Per File
- auth.controller.spec.ts: 12 tests (3 endpoints x 4 scenarios each)
- auth.service.spec.ts: 10 tests (all methods + error cases)
- jwt-auth.guard.spec.ts: 8 tests (allow/deny scenarios)
- roles.guard.spec.ts: 8 tests (role combinations)
- jwt.strategy.spec.ts: 6 tests (validation scenarios)
</test_requirements>

<execution_verification>
## After Implementation, Run:
```bash
# 1. Install dependencies
npm install

# 2. Verify build
npm run build

# 3. Run tests
npm run test

# 4. Start server and test manually
npm run start:dev

# 5. Test health endpoint (should work without auth)
curl http://localhost:3000/health

# 6. Test login endpoint (should work without auth - @Public)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"redirect_uri":"http://localhost:3000/callback"}'

# 7. Test protected endpoint (should fail without token)
curl http://localhost:3000/api/v1/transactions
# Expected: 401 Unauthorized

# 8. Verify Swagger docs
curl http://localhost:3000/api/docs
```
</execution_verification>

</task_spec>
