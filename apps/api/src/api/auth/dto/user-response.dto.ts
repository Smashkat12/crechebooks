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

  @ApiProperty({
    example: 'tenant-uuid',
    description: 'Tenant ID (null for SUPER_ADMIN)',
    nullable: true,
  })
  tenant_id: string | null;
}
