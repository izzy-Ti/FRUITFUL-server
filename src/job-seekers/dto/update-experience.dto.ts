import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateExperienceDto {
  @IsOptional()
  @IsString({ message: 'Job title must be a string' })
  @MaxLength(120, { message: 'Job title cannot exceed 120 characters' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Company name must be a string' })
  @MaxLength(120, { message: 'Company name cannot exceed 120 characters' })
  company?: string;

  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  @MaxLength(120, { message: 'Location cannot exceed 120 characters' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'Employment type must be a string' })
  @MaxLength(60, { message: 'Employment type cannot exceed 60 characters' })
  employmentType?: string;

  @IsOptional()
  @IsString({ message: 'Start date must be a string' })
  startDate?: string;

  @IsOptional()
  @IsString({ message: 'End date must be a string' })
  endDate?: string;

  @IsOptional()
  @IsBoolean({ message: 'isCurrent must be a boolean' })
  isCurrent?: boolean;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;
}
