import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSkillDto {
  @IsOptional()
  @IsString({ message: 'Skill name must be a string' })
  @MinLength(2, { message: 'Skill name must be at least 2 characters long' })
  @MaxLength(60, { message: 'Skill name cannot exceed 60 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Category must be a string' })
  @MaxLength(60, { message: 'Category cannot exceed 60 characters' })
  category?: string;
}
