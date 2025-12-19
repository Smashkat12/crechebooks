<task_spec id="TASK-API-001" version="1.0">

<metadata>
  <title>Authentication Controller and Guards</title>
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
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the Surface Layer authentication endpoints and guards for the CrecheBooks
system. It creates the REST API controllers for OAuth2/Auth0 login flow and implements NestJS
guards for JWT authentication and role-based authorization. This is the entry point for all
API security and integrates with the Auth0 service created in TASK-CORE-003.
</context>

<input_context_files>
  <file purpose="auth_service">src/core/auth/auth.service.ts</file>
  <file purpose="jwt_strategy">src/core/auth/strategies/jwt.strategy.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#authentication_endpoints</file>
  <file purpose="user_entity">src/core/user/entities/user.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-003 completed (Auth service and strategies)</check>
  <check>JWT strategy configured</check>
  <check>Auth0 credentials in environment</check>
</prerequisites>

<scope>
  <in_scope>
    - Create AuthController with OAuth login flow endpoints
    - Implement JwtAuthGuard for protected routes
    - Implement RolesGuard for role-based authorization
    - Create DTOs for login request/response with validation
    - Add Swagger/OpenAPI annotations
    - Implement refresh token endpoint
    - Add auth error handling and response formatting
  </in_scope>
  <out_of_scope>
    - Auth0 service implementation (TASK-CORE-003)
    - User entity (TASK-CORE-002)
    - Permission-based authorization (future enhancement)
    - Multi-factor authentication (future)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/auth/auth.controller.ts">
      @Controller('auth')
      @ApiTags('Authentication')
      export class AuthController {
        @Post('login')
        @HttpCode(200)
        @ApiOperation({ summary: 'Initiate OAuth login flow' })
        @ApiResponse({ status: 200, type: LoginResponseDto })
        async login(@Body() dto: LoginRequestDto): Promise&lt;LoginResponseDto&gt;;

        @Post('callback')
        @HttpCode(200)
        @ApiOperation({ summary: 'Handle OAuth callback' })
        @ApiResponse({ status: 200, type: AuthCallbackResponseDto })
        async callback(@Body() dto: CallbackRequestDto): Promise&lt;AuthCallbackResponseDto&gt;;

        @Post('refresh')
        @HttpCode(200)
        @ApiOperation({ summary: 'Refresh access token' })
        @ApiResponse({ status: 200, type: RefreshResponseDto })
        async refresh(@Body() dto: RefreshRequestDto): Promise&lt;RefreshResponseDto&gt;;
      }
    </signature>
    <signature file="src/api/auth/guards/jwt-auth.guard.ts">
      @Injectable()
      export class JwtAuthGuard extends AuthGuard('jwt') {
        canActivate(context: ExecutionContext): boolean | Promise&lt;boolean&gt;;
        handleRequest(err: any, user: any, info: any): User;
      }
    </signature>
    <signature file="src/api/auth/guards/roles.guard.ts">
      @Injectable()
      export class RolesGuard implements CanActivate {
        canActivate(context: ExecutionContext): boolean | Promise&lt;boolean&gt;;
      }
    </signature>
    <signature file="src/api/auth/decorators/roles.decorator.ts">
      export const Roles = (...roles: UserRole[]): CustomDecorator&lt;string&gt;;
      export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): User);
    </signature>
    <signature file="src/api/auth/dto/login.dto.ts">
      export class LoginRequestDto {
        @IsUrl()
        @ApiProperty({ example: 'http://localhost:3000/callback' })
        redirect_uri: string;
      }

      export class LoginResponseDto {
        @ApiProperty({ example: 'https://auth0.com/authorize?...' })
        auth_url: string;
      }
    </signature>
    <signature file="src/api/auth/dto/callback.dto.ts">
      export class CallbackRequestDto {
        @IsString()
        @ApiProperty()
        code: string;

        @IsString()
        @ApiProperty()
        state: string;
      }

      export class AuthCallbackResponseDto {
        @ApiProperty()
        access_token: string;

        @ApiProperty()
        refresh_token: string;

        @ApiProperty({ example: 86400 })
        expires_in: number;

        @ApiProperty({ type: UserResponseDto })
        user: UserResponseDto;
      }
    </signature>
  </signatures>

  <constraints>
    - All DTOs must use class-validator decorators
    - All endpoints must have Swagger/OpenAPI documentation
    - Guards must extract tenant_id from JWT claims
    - Refresh tokens must be validated against database
    - Must return standardized error responses
    - JWT expiry must be configurable via environment
    - Must log authentication failures for security monitoring
  </constraints>

  <verification>
    - POST /auth/login returns valid Auth0 authorization URL
    - POST /auth/callback exchanges code for valid JWT
    - POST /auth/refresh returns new access token with valid refresh token
    - JwtAuthGuard blocks requests without valid token
    - RolesGuard blocks requests with insufficient role
    - @CurrentUser decorator extracts user from JWT
    - Swagger documentation displays correctly
    - All DTOs validate input correctly
  </verification>
</definition_of_done>

<pseudo_code>
AuthController (src/api/auth/auth.controller.ts):
  @Controller('auth')
  @ApiTags('Authentication')
  class AuthController:
    constructor(private authService: AuthService)

    @Post('login')
    async login(dto: LoginRequestDto):
      auth_url = await authService.getAuthorizationUrl(dto.redirect_uri)
      return { auth_url }

    @Post('callback')
    async callback(dto: CallbackRequestDto):
      result = await authService.handleCallback(dto.code, dto.state)
      return {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: result.expiresIn,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          tenant_id: result.user.tenantId
        }
      }

    @Post('refresh')
    async refresh(dto: RefreshRequestDto):
      result = await authService.refreshAccessToken(dto.refresh_token)
      return {
        access_token: result.accessToken,
        expires_in: result.expiresIn
      }

JwtAuthGuard (src/api/auth/guards/jwt-auth.guard.ts):
  @Injectable()
  class JwtAuthGuard extends AuthGuard('jwt'):
    canActivate(context: ExecutionContext):
      return super.canActivate(context)

    handleRequest(err, user, info):
      if (err || !user):
        throw new UnauthorizedException('Invalid or expired token')
      return user

RolesGuard (src/api/auth/guards/roles.guard.ts):
  @Injectable()
  class RolesGuard implements CanActivate:
    constructor(private reflector: Reflector)

    canActivate(context: ExecutionContext):
      requiredRoles = reflector.getAllAndOverride('roles', [
        context.getHandler(),
        context.getClass()
      ])

      if (!requiredRoles):
        return true

      user = context.switchToHttp().getRequest().user

      if (!user):
        throw new UnauthorizedException()

      hasRole = requiredRoles.some(role => user.role === role)

      if (!hasRole):
        throw new ForbiddenException('Insufficient permissions')

      return true

Roles Decorator (src/api/auth/decorators/roles.decorator.ts):
  export const Roles = (...roles: UserRole[]):
    return SetMetadata('roles', roles)

  export const CurrentUser = createParamDecorator((data, ctx):
    request = ctx.switchToHttp().getRequest()
    return request.user
  )
</pseudo_code>

<files_to_create>
  <file path="src/api/auth/auth.controller.ts">Authentication controller with OAuth endpoints</file>
  <file path="src/api/auth/auth.module.ts">Auth API module</file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts">JWT authentication guard</file>
  <file path="src/api/auth/guards/roles.guard.ts">Role-based authorization guard</file>
  <file path="src/api/auth/decorators/roles.decorator.ts">@Roles and @CurrentUser decorators</file>
  <file path="src/api/auth/dto/login.dto.ts">Login request/response DTOs</file>
  <file path="src/api/auth/dto/callback.dto.ts">Callback request/response DTOs</file>
  <file path="src/api/auth/dto/refresh.dto.ts">Refresh token DTOs</file>
  <file path="src/api/auth/dto/user-response.dto.ts">User response DTO for auth endpoints</file>
  <file path="tests/api/auth/auth.controller.spec.ts">Auth controller unit tests</file>
  <file path="tests/api/auth/guards/jwt-auth.guard.spec.ts">JWT guard tests</file>
  <file path="tests/api/auth/guards/roles.guard.spec.ts">Roles guard tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import AuthApiModule</file>
  <file path="src/main.ts">Apply global guards and Swagger configuration</file>
</files_to_modify>

<validation_criteria>
  <criterion>All auth endpoints respond with correct status codes</criterion>
  <criterion>JWT guard blocks unauthenticated requests</criterion>
  <criterion>Roles guard enforces role requirements</criterion>
  <criterion>DTOs validate input correctly (URL format, required fields)</criterion>
  <criterion>Swagger UI shows all auth endpoints with examples</criterion>
  <criterion>CurrentUser decorator extracts user from request</criterion>
  <criterion>Error responses follow standard format</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- auth.controller.spec</command>
  <command>npm run test -- jwt-auth.guard.spec</command>
  <command>npm run test -- roles.guard.spec</command>
  <command>npm run test:e2e -- auth.e2e-spec</command>
  <command>curl -X POST http://localhost:3000/v1/auth/login -d '{"redirect_uri":"http://localhost:3000"}'</command>
</test_commands>

</task_spec>
