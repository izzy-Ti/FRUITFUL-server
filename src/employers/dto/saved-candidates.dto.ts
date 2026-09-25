import { IsString, IsOptional, IsArray, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSavedCandidateDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class QuerySavedCandidatesDto {
  @IsString()
  @IsOptional()
  tag?: string;

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
