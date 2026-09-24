import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { EmploymentType, WorkplaceType, ExperienceLevel } from './create-job.dto.js';

export enum JobStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export class UpdateJobDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  requirements?: string;

  @IsString()
  @IsOptional()
  responsibilities?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: string;

  @IsEnum(WorkplaceType)
  @IsOptional()
  workplaceType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  location?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  salaryMin?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  salaryMax?: number;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  salaryCurrency?: string;

  @IsEnum(ExperienceLevel)
  @IsOptional()
  experienceLevel?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsDateString()
  @IsOptional()
  deadline?: string;

  @IsEnum(JobStatus)
  @IsOptional()
  status?: string;
}
