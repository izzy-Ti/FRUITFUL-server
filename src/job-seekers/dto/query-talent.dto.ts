import { IsString, IsOptional, IsBoolean, IsNumber, Min, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum TalentSortBy {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  EXPERIENCE = 'experience',
  NAME = 'name',
}

export enum TalentApprovalFilter {
  APPROVED = 'approved',
  PENDING = 'pending',
  REJECTED = 'rejected',
  ALL = 'all',
}

export class QueryTalentDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  skills?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  education?: string;

  @IsString()
  @IsOptional()
  institution?: string;

  @IsString()
  @IsOptional()
  experience?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minExperienceYears?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isAvailable?: boolean;

  @IsEnum(TalentApprovalFilter)
  @IsOptional()
  approvalStatus?: TalentApprovalFilter;

  @IsEnum(TalentSortBy)
  @IsOptional()
  sortBy?: TalentSortBy;

  @IsString()
  @IsOptional()
  minSkillLevel?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minMatchScore?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
