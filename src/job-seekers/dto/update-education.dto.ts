import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEducationDto {
  @IsOptional()
  @IsString({ message: 'Institution must be a string' })
  @MaxLength(150, { message: 'Institution cannot exceed 150 characters' })
  institution?: string;

  @IsOptional()
  @IsString({ message: 'Degree must be a string' })
  @MaxLength(120, { message: 'Degree cannot exceed 120 characters' })
  degree?: string;

  @IsOptional()
  @IsString({ message: 'Field of study must be a string' })
  @MaxLength(120, { message: 'Field of study cannot exceed 120 characters' })
  fieldOfStudy?: string;

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
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;
}
