import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateJobDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  adminNotes?: string;
}

export class RejectJobDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
