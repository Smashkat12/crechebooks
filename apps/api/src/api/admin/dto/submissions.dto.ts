import { ApiProperty } from '@nestjs/swagger';

export class ContactSubmissionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: ['PENDING', 'CONTACTED'] })
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class DemoRequestDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  crecheName: string;

  @ApiProperty()
  childrenCount: number;

  @ApiProperty()
  province: string;

  @ApiProperty({ required: false })
  currentSoftware?: string;

  @ApiProperty({ required: false })
  preferredTime?: string;

  @ApiProperty()
  marketingConsent: boolean;

  @ApiProperty({ enum: ['PENDING', 'CONTACTED'] })
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class ContactSubmissionsResponseDto {
  @ApiProperty({ type: [ContactSubmissionDto] })
  submissions: ContactSubmissionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  pendingCount: number;
}

export class DemoRequestsResponseDto {
  @ApiProperty({ type: [DemoRequestDto] })
  requests: DemoRequestDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  pendingCount: number;
}
