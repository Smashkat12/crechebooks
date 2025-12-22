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
