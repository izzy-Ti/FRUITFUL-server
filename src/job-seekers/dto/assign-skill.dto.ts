import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export class AssignSkillDto {
  @IsOptional()
  @IsString({ message: 'skillId must be a string' })
  skillId?: string;

  @IsOptional()
  @IsString({ message: 'skillName must be a string' })
  skillName?: string;

  @IsOptional()
  @IsString()
  @IsIn(SKILL_LEVELS, {
    message: `level must be one of: ${SKILL_LEVELS.join(', ')}`,
  })
  level?: string;

  @IsOptional()
  @IsInt({ message: 'yearsOfExperience must be an integer' })
  @Min(0, { message: 'yearsOfExperience cannot be negative' })
  @Max(50, { message: 'yearsOfExperience cannot exceed 50' })
  yearsOfExperience?: number;
}

export class BatchAssignSkillsDto {
  @IsArray({ message: 'skills must be an array' })
  @ValidateNested({ each: true })
  @Type(() => AssignSkillDto)
  skills!: AssignSkillDto[];
}
