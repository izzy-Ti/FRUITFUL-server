import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';

export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  TEMPORARY = 'temporary',
}

export enum WorkplaceType {
  REMOTE = 'remote',
  HYBRID = 'hybrid',
  ON_SITE = 'on_site',
}

export enum ExperienceLevel {
  ENTRY = 'entry',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  EXECUTIVE = 'executive',
}

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

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
  employmentType?: string = EmploymentType.FULL_TIME;

  @IsEnum(WorkplaceType)
  @IsOptional()
  workplaceType?: string = WorkplaceType.ON_SITE;

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
  salaryCurrency?: string = 'USD';

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

  @IsBoolean()
  @IsOptional()
  publishImmediately?: boolean = false;
}
