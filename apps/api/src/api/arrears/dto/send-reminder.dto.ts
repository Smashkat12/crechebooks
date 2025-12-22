import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';

export enum ReminderMethod {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  BOTH = 'both',
}

export class SendReminderDto {
  @ApiProperty({
    description: 'Parent IDs to send reminders to',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  parentIds: string[];

  @ApiProperty({
    description: 'Delivery method',
    enum: ReminderMethod,
  })
  @IsEnum(ReminderMethod)
  method: ReminderMethod;

  @ApiPropertyOptional({
    description: 'Custom template to use',
  })
  @IsOptional()
  @IsString()
  template?: string;
}

export class SendReminderResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  failed: number;
}
