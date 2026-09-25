import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ReportMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  details?: string;
}
