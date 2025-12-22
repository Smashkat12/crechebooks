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

  @ApiProperty({
    type: UserResponseDto,
    description: 'Authenticated user details',
  })
  user: UserResponseDto;
}
