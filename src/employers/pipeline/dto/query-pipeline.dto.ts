import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPipelineDto {
  /**
   * Search keyword matching candidate name, headline, or email.
   */
  @IsString()
  @IsOptional()
  search?: string;

  /**
   * Filter candidates by minimum star rating (1 to 5).
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  /**
   * Filter candidates matching specific tag.
   */
  @IsString()
  @IsOptional()
  tag?: string;

  /**
   * Sort candidate cards within columns.
   */
  @IsString()
  @IsOptional()
  @IsIn(['matching_score', 'applied_at', 'rating', 'days_in_stage', 'name'])
  sortBy?: string = 'matching_score';

  /**
   * Sort direction.
   */
  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
