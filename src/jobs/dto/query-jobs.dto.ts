import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryJobsDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  employmentType?: string;

  @IsString()
  @IsOptional()
  workplaceType?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  experienceLevel?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minSalary?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maxSalary?: number;

  @IsString()
  @IsOptional()
  employerId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
