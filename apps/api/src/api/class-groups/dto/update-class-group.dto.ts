import { PartialType } from '@nestjs/swagger';
import { CreateClassGroupDto } from './create-class-group.dto';

/**
 * All fields are optional on update.
 * PartialType preserves all validators from CreateClassGroupDto.
 */
export class UpdateClassGroupDto extends PartialType(CreateClassGroupDto) {}
