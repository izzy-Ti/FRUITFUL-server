import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsUrl,
} from 'class-validator';

export class ApplyJobDto {
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @IsString()
  @IsOptional()
  coverLetter?: string;

  @IsString()
  @IsOptional()
  cvUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  portfolioLinks?: string[];
}
