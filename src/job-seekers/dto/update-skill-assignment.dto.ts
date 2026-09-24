import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SKILL_LEVELS } from './assign-skill.dto.js';

export class UpdateSkillAssignmentDto {
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
