import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class DevLoginRequestDto {
  @ApiProperty({
    description: 'User email address',
    example: 'admin@crechebooks.co.za',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'admin123',
  })
  @IsString()
  @MinLength(6)
  password: string;
}

export class DevLoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token: string;

  @ApiProperty({ description: 'Token expiration in seconds' })
  expires_in: number;

  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenant_id: string;
  };
}
