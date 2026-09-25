import { IsOptional, IsString, IsInt, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

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

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20000)
  @IsOptional()
  radiusKm?: number = 50;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  includeRemote?: boolean = true;

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
