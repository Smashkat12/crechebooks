import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassGroupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  ageMinMonths: number | null;

  @ApiPropertyOptional()
  ageMaxMonths: number | null;

  @ApiPropertyOptional()
  capacity: number | null;

  @ApiProperty()
  displayOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  childCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
