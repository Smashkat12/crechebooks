import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import {
  CallbackRequestDto,
  AuthCallbackResponseDto,
} from './dto/callback.dto';
import { RefreshRequestDto, RefreshResponseDto } from './dto/refresh.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate OAuth login flow',
    description: 'Returns Auth0 authorization URL to redirect user to',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid redirect URI',
  })
  login(@Body() dto: LoginRequestDto): LoginResponseDto {
    this.logger.debug(`Login initiated with redirect: ${dto.redirect_uri}`);
    const authUrl = this.authService.getAuthorizationUrl(dto.redirect_uri);
    return { auth_url: authUrl };
  }

  @Post('callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle OAuth callback',
    description: 'Exchange authorization code for tokens and user info',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AuthCallbackResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid authorization code or state',
  })
  async callback(
    @Body() dto: CallbackRequestDto,
  ): Promise<AuthCallbackResponseDto> {
    this.logger.debug('Processing OAuth callback');
    const result = await this.authService.handleCallback(dto.code, dto.state);

    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenant_id: result.user.tenantId,
      },
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange refresh token for a new access token',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
  })
  async refresh(@Body() dto: RefreshRequestDto): Promise<RefreshResponseDto> {
    this.logger.debug('Processing token refresh');
    const result = await this.authService.refreshAccessToken(dto.refresh_token);

    return {
      access_token: result.accessToken,
      expires_in: result.expiresIn,
    };
  }
}
