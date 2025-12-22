import { IsUrl, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @IsUrl(
    { require_tld: false },
    { message: 'redirect_uri must be a valid URL' },
  )
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
