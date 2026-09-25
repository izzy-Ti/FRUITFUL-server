import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsISO8601,
} from 'class-validator';

export enum RejectionCategory {
  SKILLS = 'skills',
  EXPERIENCE = 'experience',
  COMPENSATION = 'compensation',
  CULTURE = 'culture',
  LOGISTICS = 'logistics',
  ASSESSMENT = 'assessment',
  POSITION = 'position',
  OTHER = 'other',
}

export class RejectCandidateDto {
  @IsString()
  @IsNotEmpty()
  applicationId!: string;

  @IsString()
  @IsNotEmpty()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsBoolean()
  notifyCandidate?: boolean = true;

  @IsOptional()
  @IsString()
  customEmailContent?: string;

  @IsOptional()
  @IsBoolean()
  createInternalNote?: boolean = true;
}

export class CreateRejectionReasonDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsEnum(RejectionCategory)
  category!: RejectionCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  defaultEmailTemplate?: string;
}

export class QueryRejectionAnalyticsDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
