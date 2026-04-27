/**
 * Accept Staff Invite DTO
 * Staff invitation acceptance — public endpoint (no auth required).
 */

import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptStaffInviteDto {
  @IsString()
  @MinLength(20, { message: 'Token is too short' })
  @ApiProperty({
    description: 'Raw invite token from email link',
    example: 'dGhpcyBpcyBhIGZha2UgdG9rZW4gZm9yIGRlbW8',
    minLength: 20,
  })
  token: string;
}
