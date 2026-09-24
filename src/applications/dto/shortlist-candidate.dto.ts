import { IsString, IsOptional, IsArray } from 'class-validator';

export class ShortlistCandidateDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkShortlistDto {
  @IsArray()
  @IsString({ each: true })
  applicationIds: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}
