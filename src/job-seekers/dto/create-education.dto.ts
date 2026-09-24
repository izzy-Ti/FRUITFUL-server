import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEducationDto {
  @IsNotEmpty({ message: 'Institution name is required' })
  @IsString({ message: 'Institution must be a string' })
  @MaxLength(150, { message: 'Institution cannot exceed 150 characters' })
  institution!: string;

  @IsNotEmpty({ message: 'Degree or qualification is required' })
  @IsString({ message: 'Degree must be a string' })
  @MaxLength(120, { message: 'Degree cannot exceed 120 characters' })
  degree!: string;

  @IsOptional()
  @IsString({ message: 'Field of study must be a string' })
  @MaxLength(120, { message: 'Field of study cannot exceed 120 characters' })
  fieldOfStudy?: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @IsString({ message: 'Start date must be a string (e.g. YYYY-MM or YYYY)' })
  startDate!: string;

  @IsOptional()
  @IsString({ message: 'End date must be a string (e.g. YYYY-MM or YYYY)' })
  endDate?: string;

  @IsOptional()
  @IsBoolean({ message: 'isCurrent must be a boolean' })
  isCurrent?: boolean;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;
}
