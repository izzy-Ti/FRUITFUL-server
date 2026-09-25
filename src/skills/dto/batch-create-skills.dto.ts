import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSkillDto } from './create-skill.dto.js';

export class BatchCreateSkillsDto {
  @IsArray({ message: 'Skills must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreateSkillDto)
  skills!: CreateSkillDto[];
}
