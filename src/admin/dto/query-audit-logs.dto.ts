import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditLogsDto {
  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  targetEntity?: string;

  @IsString()
  @IsOptional()
  targetId?: string;

  @IsString()
  @IsOptional()
  adminId?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

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
