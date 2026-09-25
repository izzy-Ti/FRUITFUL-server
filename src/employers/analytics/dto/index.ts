import {
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
} from 'class-validator';

export type AnalyticsTimeframe = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export class QueryAnalyticsDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsIn(['7d', '30d', '90d', '1y', 'all', 'custom'])
  timeframe?: AnalyticsTimeframe = '30d';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  department?: string;
}

export class ExportAnalyticsDto extends QueryAnalyticsDto {
  @IsOptional()
  @IsIn(['csv', 'json'])
  format?: 'csv' | 'json' = 'csv';
}

export class QueryJobBenchmarkDto extends QueryAnalyticsDto {
  @IsOptional()
  @IsIn(['applicants', 'hires', 'conversion', 'time_to_fill', 'days_open', 'title'])
  sortBy?: 'applicants' | 'hires' | 'conversion' | 'time_to_fill' | 'days_open' | 'title' = 'applicants';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
